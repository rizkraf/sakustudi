import { Queue } from "bullmq";

import { getRedisConnection } from "~/lib/queue/connection";
import { buildDeleteUserFilesJobId as buildId } from "~/lib/queue/job-ids";
import { JOB_NAMES, QUEUE_NAMES } from "~/lib/queue/names";

/** Deterministic id so re-runs of the deletion flow never double-enqueue. */
export function buildDeleteUserFilesJobId(userId: string): string {
  return buildId(userId);
}

/**
 * Enqueues the storage-object cleanup for a deleted user. Idempotent by
 * deterministic job id; the worker deletes each key with retries.
 */
export async function deleteUserFilesPayloadFor(
  userId: string,
  keys: string[],
): Promise<void> {
  if (keys.length === 0) return;
  const queue = new Queue(QUEUE_NAMES.exports, {
    connection: getRedisConnection(),
  });
  try {
    await queue.add(
      JOB_NAMES.deleteUserFiles,
      { keys },
      {
        jobId: buildDeleteUserFilesJobId(userId),
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
      },
    );
  } finally {
    await queue.close();
  }
}
