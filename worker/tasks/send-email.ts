import type { Job } from "bullmq";

import type { ReminderJobPayload } from "~/lib/queue/job-ids";
import { deliverReminderEmail } from "~/modules/reminders/reminders.service";

/**
 * Emails-queue processor. Sends one reminder email through the mail adapter
 * and records sent/failed on the reminder row. Queue options give these jobs
 * 3 attempts with exponential backoff; the row flip is fenced so retries
 * after a partial send cannot double-mark.
 */
export async function runSendEmail(job: Job<ReminderJobPayload>): Promise<void> {
  await deliverReminderEmail(job.data.reminderId);
}
