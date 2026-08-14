import type { Job } from "bullmq";

import type { DeleteUserFilesPayload } from "~/lib/queue/job-ids";
import { resolveStorage } from "~/lib/storage/storage";

/**
 * Removes a deleted user's private storage objects. Idempotent: absent
 * objects are treated as already deleted. Runs after the auth user and
 * metadata rows are gone, so it only needs the keys from the job payload.
 */
export async function runDeleteUserFiles(
  job: Job<DeleteUserFilesPayload>,
): Promise<{ removed: number }> {
  const storage = await resolveStorage();
  let removed = 0;
  for (const key of job.data.keys) {
    try {
      await storage.delete(key);
      removed += 1;
    } catch (error) {
      if (await storage.exists(key).catch(() => false)) {
        // A transient storage failure: retry later (BullMQ backoff).
        throw error;
      }
      // Already gone — idempotent success.
    }
  }
  return { removed };
}
