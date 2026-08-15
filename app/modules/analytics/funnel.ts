import { and, countDistinct, eq, gte, lt } from "drizzle-orm";
import { fromZonedTime } from "date-fns-tz";

import { getDb } from "~/lib/db/client";
import { analyticsEvents } from "~/lib/db/schema";

export const FUNNEL_TIME_ZONE = "Asia/Jakarta";

export type FunnelSnapshot = {
  date: string;
  signupCompleted: number;
  onboardingStarted: number;
  onboardingCompleted: number;
  courseCreated: number;
  activityCreated: number;
  returnedNextDay: number;
  returnedWithin7d: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dayBounds(date: string, timeZone: string): { start: Date; end: Date } {
  const start = fromZonedTime(`${date}T00:00:00`, timeZone);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

async function countUsersWithEvent(
  eventName: string,
  start: Date,
  end: Date,
): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: countDistinct(analyticsEvents.userId) })
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.eventName, eventName),
        gte(analyticsEvents.occurredAt, start),
        lt(analyticsEvents.occurredAt, end),
      ),
    );
  return Number(row?.value ?? 0);
}

async function signupCohort(start: Date, end: Date): Promise<Set<string>> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ userId: analyticsEvents.userId })
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.eventName, "signup_completed"),
        gte(analyticsEvents.occurredAt, start),
        lt(analyticsEvents.occurredAt, end),
      ),
    );
  return new Set(rows.map((row) => row.userId).filter((id): id is string => id !== null));
}

async function activeUsersBetween(start: Date, end: Date): Promise<Set<string>> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ userId: analyticsEvents.userId })
    .from(analyticsEvents)
    .where(
      and(
        gte(analyticsEvents.occurredAt, start),
        lt(analyticsEvents.occurredAt, end),
      ),
    );
  return new Set(rows.map((row) => row.userId).filter((id): id is string => id !== null));
}

export async function getFunnelSnapshot(
  date: string,
  timeZone: string = FUNNEL_TIME_ZONE,
): Promise<FunnelSnapshot> {
  const { start, end } = dayBounds(date, timeZone);
  const nextStart = new Date(end.getTime());
  const nextEnd = new Date(nextStart.getTime() + DAY_MS);
  const sevenDayEnd = new Date(start.getTime() + 8 * DAY_MS);

  const cohort = await signupCohort(start, end);
  const nextDayUsers = await activeUsersBetween(nextStart, nextEnd);
  const weekUsers = await activeUsersBetween(end, sevenDayEnd);

  return {
    date,
    signupCompleted: await countUsersWithEvent("signup_completed", start, end),
    onboardingStarted: await countUsersWithEvent("onboarding_started", start, end),
    onboardingCompleted: await countUsersWithEvent("onboarding_completed", start, end),
    courseCreated: await countUsersWithEvent("course_created", start, end),
    activityCreated: await countUsersWithEvent("activity_created", start, end),
    returnedNextDay: [...cohort].filter((id) => nextDayUsers.has(id)).length,
    returnedWithin7d: [...cohort].filter((id) => weekUsers.has(id)).length,
  };
}
