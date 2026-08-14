import type { Job } from "bullmq";

import { publishPendingOutbox } from "~/modules/outbox/outbox.service";

export type PublishOutboxPayload = {
  limit: number;
};

export const PUBLISH_OUTBOX_JOB_ID = "outbox-publish-pending";

/**
 * Publishes pending outbox events to Redis (claim -> enqueue -> mark sent in
 * short transactions). Called by the reconcile loop and once at worker boot;
 * the deterministic job id makes concurrent or repeated runs harmless.
 */
export async function runPublishOutbox(
  job: Job<PublishOutboxPayload>,
): Promise<number> {
  const limit = Math.max(1, Math.min(job.data.limit ?? 100, 500));
  return publishPendingOutbox(limit);
}
