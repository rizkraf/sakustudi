import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { closeDb, getDb } from "~/lib/db/client";
import { analyticsEvents, user } from "~/lib/db/schema";
import { insertAnalyticsEvent } from "~/modules/analytics/analytics.repository";
import { getFunnelSnapshot } from "~/modules/analytics/funnel";

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
    name: "Analytics Integration User",
    email: `${id}@analytics-int.test`,
    emailVerified: true,
  });
}

async function event(userId: string, name: string, at: Date): Promise<void> {
  await insertAnalyticsEvent(userId, name, {});
  const [row] = await db
    .select({ id: analyticsEvents.id })
    .from(analyticsEvents)
    .where(eq(analyticsEvents.userId, userId))
    .orderBy(desc(analyticsEvents.occurredAt))
    .limit(1);
  await db
    .update(analyticsEvents)
    .set({ occurredAt: at })
    .where(eq(analyticsEvents.id, row.id));
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(user).where(eq(user.id, id)).catch(() => undefined);
  }
  await closeDb();
});

describe("getFunnelSnapshot", () => {
  it("counts same-day events and cohort returns for the given date", async () => {
    const a = newUserId();
    const b = newUserId();
    const c = newUserId();
    await createUser(a);
    await createUser(b);
    await createUser(c);

    const day = new Date("2026-08-01T00:00:00Z");
    await event(a, "signup_completed", day);
    await event(a, "onboarding_started", day);
    await event(a, "onboarding_completed", day);
    await event(a, "course_created", day);
    await event(a, "activity_created", day);
    await event(b, "signup_completed", day);
    await event(c, "signup_completed", day);

    // a kembali besoknya; c kembali di hari ke-3 (masuk 7 hari); b tidak pernah.
    await event(a, "activity_completed", new Date("2026-08-02T02:00:00Z"));
    await event(c, "note_created", new Date("2026-08-04T02:00:00Z"));

    const snapshot = await getFunnelSnapshot("2026-08-01");
    expect(snapshot.signupCompleted).toBe(3);
    expect(snapshot.onboardingStarted).toBe(1);
    expect(snapshot.onboardingCompleted).toBe(1);
    expect(snapshot.courseCreated).toBe(1);
    expect(snapshot.activityCreated).toBe(1);
    expect(snapshot.returnedNextDay).toBe(1);
    expect(snapshot.returnedWithin7d).toBe(2);
  });

  it("returns zeros for a date without events", async () => {
    const snapshot = await getFunnelSnapshot("2020-01-01");
    expect(snapshot).toEqual({
      date: "2020-01-01",
      signupCompleted: 0,
      onboardingStarted: 0,
      onboardingCompleted: 0,
      courseCreated: 0,
      activityCreated: 0,
      returnedNextDay: 0,
      returnedWithin7d: 0,
    });
  });
});
