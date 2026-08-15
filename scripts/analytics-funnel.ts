import { closeDb } from "../app/lib/db/client";
import {
  FUNNEL_TIME_ZONE,
  getFunnelSnapshot,
} from "../app/modules/analytics/funnel";

function todayInZone(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid date "${value}". Use YYYY-MM-DD.`);
  }
  return value;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, " ");
}

async function main(): Promise<void> {
  const date = parseDate(process.argv[2] ?? todayInZone(FUNNEL_TIME_ZONE));
  const snapshot = await getFunnelSnapshot(date, FUNNEL_TIME_ZONE);

  const rows: Array<[string, number]> = [
    ["signup_completed", snapshot.signupCompleted],
    ["onboarding_started", snapshot.onboardingStarted],
    ["onboarding_completed", snapshot.onboardingCompleted],
    ["course_created", snapshot.courseCreated],
    ["activity_created", snapshot.activityCreated],
    ["returned_next_day", snapshot.returnedNextDay],
    ["returned_within_7d", snapshot.returnedWithin7d],
  ];

  console.log(`Funnel ${snapshot.date} (${FUNNEL_TIME_ZONE})`);
  for (const [name, value] of rows) {
    if (value > 0) {
      console.log(`${name.padEnd(20)} ${pad(value, 4)}`);
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error("Analytics funnel failed:", error);
    process.exit(1);
  })
  .finally(() => closeDb());
