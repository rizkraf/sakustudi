import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "~/lib/db/client";
import { CATALOG_SEED_VERSION, seedCatalog } from "~/lib/db/seed";
import {
  user,
  profiles,
  academicTerms,
  courses,
  activities,
  notes,
  attachments,
  reminders,
  calendarEvents,
  courseCatalog,
  studyPrograms,
} from "~/lib/db/schema";

const db = getDb();
const createdUserIds: string[] = [];

function newUserId(): string {
  const id = crypto.randomUUID();
  createdUserIds.push(id);
  return id;
}

async function createUser(id: string): Promise<void> {
  await db.insert(user).values({
    id,
    name: "Integration Test User",
    email: `${id}@integration.test`,
    emailVerified: true,
  });
}

function pgErrorCode(error: unknown): string | undefined {
  const candidate = error as { code?: string; cause?: { code?: string } };
  return candidate.code ?? candidate.cause?.code;
}

const EXPECTED_TABLES = [
  "user",
  "session",
  "account",
  "verification",
  "profiles",
  "legal_consents",
  "study_programs",
  "course_catalog",
  "academic_terms",
  "courses",
  "activities",
  "notes",
  "attachments",
  "calendar_events",
  "useful_links",
  "reminders",
  "outbox_events",
  "data_exports",
  "audit_logs",
  "analytics_events",
];

describe("db schema", () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seedCatalog(db);
  }, 60_000);

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await db.delete(user).where(inArray(user.id, createdUserIds));
    }
    await closeDb();
  });

  it("creates all expected tables", async () => {
    const result = await db.execute<{ tablename: string }>(
      sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    const names = result.rows.map((r) => r.tablename);
    for (const table of EXPECTED_TABLES) {
      expect(names).toContain(table);
    }
  });

  it("rejects two active terms for one user", async () => {
    const userId = newUserId();
    await createUser(userId);

    await db.insert(academicTerms).values({
      userId,
      name: "Term 1",
      startDate: new Date("2026-02-01T00:00:00Z"),
      endDate: new Date("2026-07-01T00:00:00Z"),
    });

    let error: unknown;
    try {
      await db.insert(academicTerms).values({
        userId,
        name: "Term 2",
        startDate: new Date("2026-08-01T00:00:00Z"),
        endDate: new Date("2027-01-01T00:00:00Z"),
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeDefined();
    expect(pgErrorCode(error)).toBe("23505");
  });

  it("rejects an attachment with two parents", async () => {
    const userId = newUserId();
    await createUser(userId);

    const [course] = await db
      .insert(courses)
      .values({ userId, name: "Database Systems", code: "SISI4101" })
      .returning();
    const [activity] = await db
      .insert(activities)
      .values({ userId, courseId: course.id, title: "Tugas 1" })
      .returning();

    let error: unknown;
    try {
      await db.insert(attachments).values({
        userId,
        filename: "doc.pdf",
        storageKey: `users/${userId}/doc.pdf`,
        courseId: course.id,
        activityId: activity.id,
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeDefined();
    expect(pgErrorCode(error)).toBe("23514");
  });

  it("cascade-deletes user-owned rows when the user is deleted", async () => {
    const userId = newUserId();
    await createUser(userId);

    const [term] = await db
      .insert(academicTerms)
      .values({
        userId,
        name: "Cascade Term",
        startDate: new Date("2026-02-01T00:00:00Z"),
        endDate: new Date("2026-07-01T00:00:00Z"),
      })
      .returning();
    const [course] = await db
      .insert(courses)
      .values({ userId, termId: term.id, name: "Algorithms" })
      .returning();
    await db.insert(profiles).values({ userId, displayName: "Cascade Tester" });
    await db.insert(notes).values({ userId, courseId: course.id, title: "Note" });
    await db.insert(reminders).values({
      userId,
      title: "Reminder",
      remindAt: new Date("2026-06-01T00:00:00Z"),
      idempotencyKey: `cascade-${userId}`,
    });
    await db.insert(calendarEvents).values({
      userId,
      title: "Exam",
      startsAt: new Date("2026-06-01T08:00:00Z"),
      endsAt: new Date("2026-06-01T10:00:00Z"),
    });
    await db.insert(attachments).values({
      userId,
      filename: "notes.pdf",
      storageKey: `users/${userId}/notes.pdf`,
      courseId: course.id,
    });

    await db.delete(user).where(sql`${user.id} = ${userId}`);

    const profileCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(profiles)
      .where(sql`${profiles.userId} = ${userId}`);
    const courseCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(courses)
      .where(sql`${courses.userId} = ${userId}`);
    const attachmentCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(attachments)
      .where(sql`${attachments.userId} = ${userId}`);
    const reminderCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(reminders)
      .where(sql`${reminders.userId} = ${userId}`);

    expect(Number(profileCount[0].count)).toBe(0);
    expect(Number(courseCount[0].count)).toBe(0);
    expect(Number(attachmentCount[0].count)).toBe(0);
    expect(Number(reminderCount[0].count)).toBe(0);
  });

  it("runs the catalog seed twice without duplicate codes", async () => {
    await seedCatalog(db);
    await seedCatalog(db);

    const programRows = await db.select().from(studyPrograms);
    const courseRows = await db.select().from(courseCatalog);

    const programCodes = new Set(programRows.map((p) => p.code));
    const courseCodes = new Set(courseRows.map((c) => c.code));

    expect(programRows.length).toBe(programCodes.size);
    expect(courseRows.length).toBe(courseCodes.size);
    expect(courseCodes.size).toBeGreaterThanOrEqual(8);
    expect(programCodes).toContain("SI");
    expect(programCodes).toContain("TI");
    expect(courseCodes).toContain("MKDU4111");
    expect(CATALOG_SEED_VERSION).toBeGreaterThanOrEqual(1);
  });
});
