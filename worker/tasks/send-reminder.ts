import type { Job } from "bullmq";

import type { ReminderJobPayload } from "~/lib/queue/job-ids";
import { sendReminder } from "~/modules/reminders/reminders.service";

/**
 * Reminders-queue processor. Delivers one reminder job: verifies the
 * reminder is still scheduled and its activity is incomplete, then creates
 * the in-app state (or enqueues the email send). Stale jobs (activity
 * completed/deleted/rescheduled) are safe no-ops thanks to the worker-side
 * state check and the conditional status fence in the repository.
 */
export async function runSendReminder(
  job: Job<ReminderJobPayload>,
): Promise<void> {
  await sendReminder({
    reminderId: job.data.reminderId,
    userId: job.data.userId,
    channel: job.data.channel,
  });
}
