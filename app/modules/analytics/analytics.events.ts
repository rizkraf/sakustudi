/**
 * Product events recorded anonymously for pilot funnel metrics. Names are
 * validated server-side; never attach PII to properties.
 */
export const ANALYTICS_EVENTS = [
  "signup_completed",
  "onboarding_started",
  "onboarding_completed",
  "course_created",
  "activity_created",
  "activity_completed",
  "note_created",
  "file_uploaded",
  "reminder_created",
  "export_requested",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export const FORBIDDEN_PROPERTY_KEYS = [
  "email",
  "content",
  "title",
  "name",
  "url",
  "path",
  "token",
  "ip",
  "password",
] as const;

export function assertValidEvent(
  eventName: string,
  properties: Record<string, unknown>,
): void {
  if (!ANALYTICS_EVENTS.includes(eventName as AnalyticsEventName)) {
    throw new Error(`analytics: unknown event "${eventName}"`);
  }
  for (const key of Object.keys(properties)) {
    if (FORBIDDEN_PROPERTY_KEYS.includes(key as (typeof FORBIDDEN_PROPERTY_KEYS)[number])) {
      throw new Error(`analytics: forbidden property key "${key}"`);
    }
  }
}
