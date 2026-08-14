import type { Job } from "bullmq";
import { eq } from "drizzle-orm";

import type { ExportJobPayload } from "~/lib/queue/job-ids";
import {
  buildExportBundle,
  buildExportZip,
  markExportFailed,
  markExportReady,
  storeExportZip,
} from "~/modules/exports/export.service";
import { getDb } from "~/lib/db/client";
import { attachments, dataExports } from "~/lib/db/schema";
import { resolveStorage } from "~/lib/storage/storage";

/**
 * Builds one data export: gathers the user's data, bundles it with their
 * private attachments into a ZIP, stores it privately, and marks the export
 * ready with a 24-hour expiry. Failures mark the row failed (BullMQ retries
 * 3x with backoff; permanent errors surface in the export list).
 */
export async function runCreateExport(
  job: Job<ExportJobPayload>,
): Promise<void> {
  const { exportId, userId } = job.data;
  const db = getDb();
  const [row] = await db
    .select()
    .from(dataExports)
    .where(eq(dataExports.id, exportId))
    .limit(1);
  if (!row || row.userId !== userId) {
    // Stale or foreign export job: nothing to build.
    return;
  }

  try {
    await db
      .update(dataExports)
      .set({ status: "processing" })
      .where(eq(dataExports.id, exportId));

    const bundle = await buildExportBundle(userId);
    const storage = await resolveStorage();

    // Attachment rows carry the display filename for the ZIP entries.
    const attachmentRows = await db
      .select({ storageKey: attachments.storageKey, filename: attachments.filename })
      .from(attachments)
      .where(eq(attachments.userId, userId));

    const { buffer, checksum } = await buildExportZip(
      bundle,
      attachmentRows,
      storage,
    );
    const fileUrl = await storeExportZip(exportId, buffer, checksum);
    await markExportReady(exportId, fileUrl);
  } catch (error) {
    await markExportFailed(exportId).catch(() => undefined);
    throw error;
  }
}
