import { assertValidEvent } from "./analytics.events";
import { insertAnalyticsEvent } from "./analytics.repository";

/**
 * Best-effort analytics write: validates the event, inserts the row, and
 * swallows failures with a warning. Analytics must never affect the result
 * of the calling mutation.
 */
export async function trackEvent(
  userId: string,
  eventName: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  try {
    assertValidEvent(eventName, properties);
    await insertAnalyticsEvent(userId, eventName, properties);
  } catch (error) {
    console.warn(`analytics: event "${eventName}" dropped`, error);
  }
}
