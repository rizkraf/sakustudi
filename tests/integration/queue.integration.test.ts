import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, count, eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Queue, QueueEvents, Worker } from "bullmq";

import { closeDb, getDb } from "~/lib/db/client";
import { seedCatalog } from "~/lib/db/seed";
import { user } from "~/lib/db/schema";
import { getRedisConnection, closeRedis } from "~/lib/queue/connection";
import { JOB_NAMES, QUEUE_NAMES } from "~/lib/queue/names";
import { buildReminderJobId } from "~/lib/queue/job-ids";
import { dispatchReminder } from "~/lib/queue/publish";
import { setMailAdapter, createInMemoryMailer } from "~/lib/mail/mailer";
import { createAcademicTerm } from "~/modules/academic-terms/terms.service";
import { createCustomCourse } from "~/modules/catalog/catalog.service";
import {
  createActivity,
  setActivityStatus,
  updateActivity,
} from "~/modules/activities/activities.service";
import {
  cancelReminderSchedule,
  deliverReminderEmail,
  markReminderRead,
  sendReminder,
} from "~/modules/reminders/reminders.service";
import {
  findReminderById,
  listUnreadInAppReminders,
} from "~/modules/reminders/reminders.repository";
import { publishPendingOutbox } from "~/modules/outbox/outbox.service";
import {
  findOutboxEvent,
  resetStaleProcessing,
} from "~/modules/outbox/outbox.repository";
import { reminders, outboxEvents } from "~/lib/db/schema";

const db = getDb();
const createdUserIds: string[] = [];
const createdJobIds: string[] = [];

function newUserId(): string {
  const id = crypto.randomUUID();
  createdUserIds.push(id);
  return id;
}

async function createUser(id: string): Promise<void> {
  await db.insert(user).values({
    id,
    name: "Queue Integration User",
    email: `${id}@queue-int.test`,
    emailVerified: true,
  });
}

async function createUserWithCourse(): Promise<{ userId: string; courseId: string }> {
  const userId = newUserId();
  await createUser(userId);
  const term = await createAcademicTerm(userId, {
    name: "Gasal 2026/2027",
    startDate: new Date("2026-09-01T00:00:00Z"),
    endDate: new Date("2027-02-28T00:00:00Z"),
  });
  const course = await createCustomCourse(userId, term.id, {
    name: "Queue Course",
  });
  return { userId, courseId: course.id };
}

// The publisher (app/lib/queue/publish.ts) writes to the default-prefix
// queues, so assertions read those same queues; test job ids are random
// uuids and are removed in afterAll.
function remindersQueue() {
  return new Queue(QUEUE_NAMES.reminders, {
    connection: getRedisConnection(),
  });
}

function emailsQueue() {
  return new Queue(QUEUE_NAMES.emails, {
    connection: getRedisConnection(),
  });
}

function trackJob(jobId: string): void {
  createdJobIds.push(jobId);
}

describe("outbox, reminders, and BullMQ integration", () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seedCatalog(db);
    // Purge pending/processing outbox rows left behind by previous runs
    // (deleted users keep their outbox history because the FK is set-null);
    // without this, leftover pending rows crowd the publish limit and make
    // assertions flaky.
    await db
      .delete(outboxEvents)
      .where(inArray(outboxEvents.status, ["pending", "processing"]));
  }, 60_000);

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await db
        .delete(outboxEvents)
        .where(inArray(outboxEvents.userId, createdUserIds));
      await db.delete(user).where(inArray(user.id, createdUserIds));
    }
    for (const queue of [remindersQueue(), emailsQueue()]) {
      for (const jobId of createdJobIds) {
        await queue.remove(jobId).catch(() => undefined);
      }
      await queue.close().catch(() => undefined);
    }
    await closeRedis();
    await closeDb();
  });

  it("schedules the 3-day/1-day 09:00 WIB reminders and writes an outbox row in one transaction", async () => {
    const { userId, courseId } = await createUserWithCourse();
    const activity = await createActivity(userId, {
      title: "Tugas deadline",
      courseId,
      type: "assignment",
      deadline: "2026-10-15",
    });

    const scheduled = await db
      .select()
      .from(reminders)
      .where(eq(reminders.activityId, activity.id))
      .orderBy(reminders.remindAt);
    expect(scheduled).toHaveLength(2);
    expect(scheduled.map((r) => r.channel)).toEqual(["in_app", "in_app"]);
    expect(scheduled.map((r) => r.remindAt.toISOString())).toEqual([
      "2026-10-12T02:00:00.000Z",
      "2026-10-14T02:00:00.000Z",
    ]);
    expect(scheduled.every((r) => r.status === "scheduled")).toBe(true);
    expect(scheduled.every((r) => r.deadlineVersion === 1)).toBe(true);

    const events = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.userId, userId));
    const created = events.find((e) => e.eventType === "activity.created");
    expect(created).toBeDefined();
    expect(created!.status).toBe("pending");
    expect(created!.payload).toEqual({ activityId: activity.id });
  });

  it("publishes pending outbox events and dedupes deterministic job ids", async () => {
    const { userId, courseId } = await createUserWithCourse();
    const activity = await createActivity(userId, {
      title: "Publish me",
      courseId,
      type: "quiz",
      deadline: "2026-10-20",
    });
    const events = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.userId, userId));
    const event = events.find((e) => e.eventType === "activity.created")!;

    const published = await publishPendingOutbox(10);
    // May also drain events left pending by earlier tests.
    expect(published).toBeGreaterThanOrEqual(1);
    expect((await findOutboxEvent(event.id))!.status).toBe("sent");

    const queue = remindersQueue();
    try {
      const remindersRows = await db
        .select()
        .from(reminders)
        .where(eq(reminders.activityId, activity.id));
      for (const reminder of remindersRows) {
        const jobId = buildReminderJobId(
          reminder.id,
          reminder.deadlineVersion ?? 1,
          "in_app",
        );
        trackJob(jobId);
        const job = await queue.getJob(jobId);
        expect(job).not.toBeNull();
        expect(job!.name).toBe(JOB_NAMES.sendReminder);
        expect(job!.data).toEqual({
          reminderId: reminder.id,
          userId,
          channel: "in_app",
        });
      }

      // Re-publishing (crash between enqueue and mark-sent) must not
      // duplicate jobs: the jobId already exists, so the add is ignored.
      await dispatchReminder(remindersRows[0]);
      const again = await queue.getJob(
        buildReminderJobId(remindersRows[0].id, 1, "in_app"),
      );
      expect(again?.opts.attempts).toBe(1);
      expect(again).not.toBeNull();
    } finally {
      await queue.close();
    }

    const secondRun = await publishPendingOutbox(10);
    expect(secondRun).toBe(0);
  });

  it("delivers in-app reminders and records read state", async () => {
    const { userId, courseId } = await createUserWithCourse();
    const activity = await createActivity(userId, {
      title: "Read me",
      courseId,
      type: "assignment",
      deadline: "2026-11-01",
    });
    const [reminder] = await db
      .select()
      .from(reminders)
      .where(eq(reminders.activityId, activity.id))
      .orderBy(reminders.remindAt);

    await sendReminder({
      reminderId: reminder.id,
      userId,
      channel: "in_app",
    });
    const sent = await findReminderById(reminder.id);
    expect(sent!.status).toBe("sent");
    expect(sent!.sentAt).toBeInstanceOf(Date);
    expect(sent!.attempts).toBe(1);

    const unread = await listUnreadInAppReminders(userId);
    expect(unread.some((r) => r.id === reminder.id)).toBe(true);

    await markReminderRead(userId, reminder.id);
    expect((await findReminderById(reminder.id))!.readAt).toBeInstanceOf(Date);
    const unreadAfter = await listUnreadInAppReminders(userId);
    expect(unreadAfter.some((r) => r.id === reminder.id)).toBe(false);
  });

  it("never delivers stale reminders for completed or cancelled activities", async () => {
    const { userId, courseId } = await createUserWithCourse();
    const activity = await createActivity(userId, {
      title: "Finish me",
      courseId,
      type: "assignment",
      deadline: "2026-11-05",
    });
    const [reminder] = await db
      .select()
      .from(reminders)
      .where(eq(reminders.activityId, activity.id))
      .orderBy(reminders.remindAt);

    await setActivityStatus(userId, activity.id, "completed");
    const cancelled = await findReminderById(reminder.id);
    expect(cancelled!.status).toBe("cancelled");

    // A late worker job with the old payload must be a no-op.
    await sendReminder({
      reminderId: reminder.id,
      userId,
      channel: "in_app",
    });
    expect((await findReminderById(reminder.id))!.status).toBe("cancelled");
    expect((await findReminderById(reminder.id))!.sentAt).toBeNull();

    // Direct cancellation also fences delivery.
    const other = await createActivity(userId, {
      title: "Cancel me",
      courseId,
      type: "quiz",
      deadline: "2026-11-06",
    });
    await cancelReminderSchedule(userId, other.id);
    const [otherReminder] = await db
      .select()
      .from(reminders)
      .where(eq(reminders.activityId, other.id))
      .orderBy(reminders.remindAt);
    await sendReminder({
      reminderId: otherReminder.id,
      userId,
      channel: "in_app",
    });
    expect((await findReminderById(otherReminder.id))!.status).toBe("cancelled");
  });

  it("reschedules reminders with a bumped deadline version on deadline change", async () => {
    const { userId, courseId } = await createUserWithCourse();
    const activity = await createActivity(userId, {
      title: "Move me",
      courseId,
      type: "assignment",
      deadline: "2026-10-15",
    });
    const before = await db
      .select()
      .from(reminders)
      .where(eq(reminders.activityId, activity.id));

    await updateActivity(userId, activity.id, { deadline: "2026-10-25" });

    // The old schedule must be cancelled (re-fetch by id: the rows captured
    // before the update were still scheduled at that point).
    const oldRows = await db
      .select()
      .from(reminders)
      .where(inArray(reminders.id, before.map((r) => r.id)));
    expect(oldRows.every((r) => r.status === "cancelled")).toBe(true);

    const after = await db
      .select()
      .from(reminders)
      .where(eq(reminders.activityId, activity.id))
      .orderBy(reminders.remindAt);
    expect(after.filter((r) => r.status === "scheduled")).toHaveLength(2);
    expect(after.filter((r) => r.status === "scheduled").map((r) => r.remindAt.toISOString())).toEqual([
      "2026-10-22T02:00:00.000Z",
      "2026-10-24T02:00:00.000Z",
    ]);
    expect(after.some((r) => r.deadlineVersion === 2)).toBe(true);

    const events = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.userId, userId));
    expect(events.some((e) => e.eventType === "activity.updated")).toBe(true);
  });

  it("retries email jobs three times with exponential backoff, then marks failed", async () => {
    const { userId, courseId } = await createUserWithCourse();
    const activity = await createActivity(userId, {
      title: "Mail retry",
      courseId,
      type: "assignment",
      deadline: "2026-11-10",
    });
    const [reminder] = await db
      .select()
      .from(reminders)
      .where(eq(reminders.activityId, activity.id))
      .orderBy(reminders.remindAt);

    let attempts = 0;
    const worker = new Worker(
      QUEUE_NAMES.emails,
      async () => {
        attempts += 1;
        throw new Error("SMTP unreachable");
      },
      { connection: getRedisConnection(), concurrency: 1 },
    );
    const queueEvents = new QueueEvents(QUEUE_NAMES.emails, {
      connection: getRedisConnection(),
    });
    await worker.waitUntilReady();
    await queueEvents.waitUntilReady();

    const queue = emailsQueue();
    try {
      const jobId = buildReminderJobId(reminder.id, reminder.deadlineVersion ?? 1, "email");
      trackJob(jobId);
      const job = await queue.add(
        JOB_NAMES.sendEmail,
        { reminderId: reminder.id, userId, channel: "email" },
        {
          jobId,
          attempts: 3,
          backoff: { type: "exponential", delay: 100 },
        },
      );

      // waitUntilFinished rejects only after every retry is exhausted.
      await expect(job.waitUntilFinished(queueEvents)).rejects.toThrow(/SMTP unreachable/);
      const settled = await queue.getJob(jobId);
      expect(settled!.attemptsMade).toBe(3);
      expect(settled!.opts.attempts).toBe(3);
      expect(settled!.opts.backoff).toMatchObject({ type: "exponential" });
      expect(attempts).toBe(3);
    } finally {
      await worker.close();
      await queueEvents.close();
      await queue.close();
    }
  });

  it("sends reminder emails through the mail adapter and records sent", async () => {
    const memoryMailer = createInMemoryMailer();
    setMailAdapter(memoryMailer);

    const { userId, courseId } = await createUserWithCourse();
    const activity = await createActivity(userId, {
      title: "Mail me",
      courseId,
      type: "assignment",
      deadline: "2026-11-15",
    });
    const [row] = await db
      .select()
      .from(reminders)
      .where(eq(reminders.activityId, activity.id))
      .orderBy(reminders.remindAt);

    await deliverReminderEmail(row.id);

    const mail = memoryMailer.messages.find((m) => m.kind === "reminder");
    expect(mail).toBeDefined();
    expect(mail!.to).toBe(`${userId}@queue-int.test`);
    expect(mail!.title).toBe("Mail me");

    const sent = await findReminderById(row.id);
    expect(sent!.status).toBe("sent");
  });

  it("marks reminders failed when the mail adapter rejects", async () => {
    setMailAdapter({
      async send() {
        throw new Error("connection refused");
      },
    });
    const { userId, courseId } = await createUserWithCourse();
    const activity = await createActivity(userId, {
      title: "Fail mail",
      courseId,
      type: "assignment",
      deadline: "2026-11-20",
    });
    const [row] = await db
      .select()
      .from(reminders)
      .where(eq(reminders.activityId, activity.id))
      .orderBy(reminders.remindAt);

    await expect(deliverReminderEmail(row.id)).rejects.toThrow(/connection refused/);
    const failed = await findReminderById(row.id);
    expect(failed!.status).toBe("failed");
    expect(failed!.failedAt).toBeInstanceOf(Date);
  });

  it("reconciliation re-enqueues due reminders and resets stale outbox claims", async () => {
    const { userId, courseId } = await createUserWithCourse();
    const activity = await createActivity(userId, {
      title: "Reconcile me",
      courseId,
      type: "assignment",
      deadline: "2026-12-01",
    });

    // Simulate a crash: claim the outbox event but never publish it, and
    // rewind a reminder's remind_at into the past (a missed enqueue).
    const events = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.userId, userId));
    const event = events.find((e) => e.eventType === "activity.created")!;
    await db
      .update(outboxEvents)
      .set({
        status: "processing",
        nextAttemptAt: new Date(Date.now() - 60_000),
      })
      .where(eq(outboxEvents.id, event.id));

    const [reminder] = await db
      .select()
      .from(reminders)
      .where(eq(reminders.activityId, activity.id))
      .orderBy(reminders.remindAt);
    await db
      .update(reminders)
      .set({ remindAt: new Date(Date.now() - 60_000) })
      .where(eq(reminders.id, reminder.id));

    // Reconcile: reset stale claims, publish, re-enqueue due reminders.
    const reset = await resetStaleProcessing(new Date());
    expect(reset).toBeGreaterThanOrEqual(1);
    const published = await publishPendingOutbox(10);
    expect(published).toBeGreaterThanOrEqual(1);

    const queue = remindersQueue();
    try {
      const jobId = buildReminderJobId(
        reminder.id,
        reminder.deadlineVersion ?? 1,
        "in_app",
      );
      trackJob(jobId);
      const job = await queue.getJob(jobId);
      expect(job).not.toBeNull();
      expect(job!.opts.delay).toBe(0);
      expect((await findOutboxEvent(event.id))!.status).toBe("sent");
    } finally {
      await queue.close();
    }
  });

  it("publishes nothing for completed-activity events", async () => {
    const { userId, courseId } = await createUserWithCourse();
    const activity = await createActivity(userId, {
      title: "Done event",
      courseId,
      type: "assignment",
      deadline: "2026-12-10",
    });
    await setActivityStatus(userId, activity.id, "completed");

    const published = await publishPendingOutbox(10);
    // Both this activity's created and completed events are pending, plus any
    // leftovers from earlier tests; only the created one enqueues jobs.
    expect(published).toBeGreaterThanOrEqual(2);

    const queue = remindersQueue();
    try {
      const rows = await db
        .select()
        .from(reminders)
        .where(eq(reminders.activityId, activity.id));
      for (const reminder of rows) {
        const jobId = buildReminderJobId(
          reminder.id,
          reminder.deadlineVersion ?? 1,
          "in_app",
        );
        expect(await queue.getJob(jobId)).toBeUndefined();
      }
    } finally {
      await queue.close();
    }
  });

  it("keeps the outbox index consistent after publication", async () => {
    const { userId, courseId } = await createUserWithCourse();
    await createActivity(userId, {
      title: "Indexed",
      courseId,
      type: "other",
      deadline: "2026-12-20",
    });
    const pendingForUser = async () => {
      const [row] = await db
        .select({ value: count() })
        .from(outboxEvents)
        .where(
          and(eq(outboxEvents.userId, userId), eq(outboxEvents.status, "pending")),
        );
      return Number(row?.value ?? 0);
    };
    const pendingBefore = await pendingForUser();
    const published = await publishPendingOutbox(10);
    const pendingAfter = await pendingForUser();
    expect(published).toBeGreaterThanOrEqual(1);
    expect(pendingAfter).toBe(0);
    expect(pendingBefore).toBe(1);
  });
});
