import { getDb } from "~/lib/db/client";
import { analyticsEvents } from "~/lib/db/schema";

export async function insertAnalyticsEvent(
  userId: string,
  eventName: string,
  properties: Record<string, unknown>,
): Promise<void> {
  await getDb().insert(analyticsEvents).values({
    userId,
    eventName,
    properties,
  });
}
