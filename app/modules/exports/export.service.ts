import { and, desc, eq, gt } from "drizzle-orm";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { ZipArchive } from "archiver";

import { getDb } from "~/lib/db/client";
import {
  academicTerms,
  activities,
  attachments,
  calendarEvents,
  courses,
  dataExports,
  legalConsents,
  notes,
  profiles,
  reminders,
  usefulLinks,
} from "~/lib/db/schema";
import { AppError } from "~/lib/errors/AppError";
import { resolveStorage } from "~/lib/storage/storage";
import type { FileStorage } from "~/lib/storage/storage";
import { insertOutboxEvent } from "~/modules/outbox/outbox.repository";
import { enqueueOutboxEvent } from "~/lib/queue/publish";

const db = getDb();

export type DataExportRow = typeof dataExports.$inferSelect;

export const EXPORT_EXPIRY_MS = 24 * 60 * 60 * 1000;
/** Flat storage-key prefix (no separators; see isSafeStorageKey). */
export const EXPORT_FILE_PREFIX = "exports-";

/** Rows exported to the ZIP, excluding auth/security internals. */
type ExportBundle = {
  exportedAt: string;
  profile: Record<string, unknown> | null;
  consents: unknown[];
  academicTerms: unknown[];
  courses: unknown[];
  activities: unknown[];
  notes: unknown[];
  calendarEvents: unknown[];
  usefulLinks: unknown[];
  reminders: unknown[];
};

/** An attachment included in the ZIP: storage key + safe display filename. */
export type ExportAttachment = {
  storageKey: string;
  filename: string;
};

/**
 * Creates a data-export request and its outbox event in one transaction. The
 * worker builds the ZIP after commit; the outbox row guarantees the job is
 * published exactly once (deterministic job id).
 */
export async function requestDataExport(
  userId: string,
): Promise<DataExportRow> {
  let created: DataExportRow | undefined;
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(dataExports)
      .values({ userId, exportType: "all", status: "pending" })
      .returning();
    created = row;
    await insertOutboxEvent(tx, {
      userId,
      eventType: "export.requested",
      eventKey: `export-requested:${row.id}`,
      payload: { exportId: row.id },
    });
  });
  if (!created) {
    throw new AppError("DEPENDENCY_UNAVAILABLE", "Export could not be created");
  }
  await enqueueOutboxEvent(created.id).catch((error) => {
    // The outbox row is committed; the reconcile loop re-publishes pending
    // events, so a transient Redis failure here is not data loss.
    console.error("export: enqueue failed, reconcile will retry", {
      exportId: created!.id,
      error,
    });
  });
  return created;
}

/** Lists the user's exports, newest first. */
export async function listUserExports(
  userId: string,
): Promise<DataExportRow[]> {
  return db
    .select()
    .from(dataExports)
    .where(eq(dataExports.userId, userId))
    .orderBy(desc(dataExports.requestedAt))
    .limit(20);
}

/**
 * Streams a finished export file back to the browser. Ownership and expiry
 * are checked before storage is touched; the stream goes through this
 * handler so credentials never reach the browser.
 */
export async function getExportDownload(
  userId: string,
  exportId: string,
): Promise<Response> {
  const [row] = await db
    .select()
    .from(dataExports)
    .where(and(eq(dataExports.id, exportId), eq(dataExports.userId, userId)))
    .limit(1);
  if (!row || row.status !== "ready" || !row.fileUrl) {
    throw new AppError("NOT_FOUND", "Export not found or not ready");
  }
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    throw new AppError("NOT_FOUND", "Export has expired");
  }

  const storage = await resolveStorage();
  const stream = await storage.get(row.fileUrl);
  const nodeStream = Readable.fromWeb(
    stream as import("node:stream/web").ReadableStream,
  );
  const filename = `sakustudi-export-${exportId}.zip`;
  return new Response(nodeStream as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

/** Worker path: marks an export row failed. */
export async function markExportFailed(exportId: string): Promise<void> {
  await db
    .update(dataExports)
    .set({ status: "failed" })
    .where(eq(dataExports.id, exportId));
}

/** Worker path: marks an export row ready with its storage key and expiry. */
export async function markExportReady(
  exportId: string,
  fileUrl: string,
): Promise<void> {
  await db
    .update(dataExports)
    .set({
      status: "ready",
      fileUrl,
      completedAt: new Date(),
      expiresAt: new Date(Date.now() + EXPORT_EXPIRY_MS),
    })
    .where(eq(dataExports.id, exportId));
}

/** Fetches every non-secret user record for the export bundle. */
export async function buildExportBundle(userId: string): Promise<ExportBundle> {
  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  const consents = await db
    .select()
    .from(legalConsents)
    .where(eq(legalConsents.userId, userId));
  const academicTermsRows = await db
    .select()
    .from(academicTerms)
    .where(eq(academicTerms.userId, userId));
  const coursesRows = await db
    .select()
    .from(courses)
    .where(eq(courses.userId, userId));
  const activitiesRows = await db
    .select()
    .from(activities)
    .where(eq(activities.userId, userId));
  const notesRows = await db
    .select()
    .from(notes)
    .where(eq(notes.userId, userId));
  const calendarEventsRows = await db
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.userId, userId));
  const usefulLinksRows = await db
    .select()
    .from(usefulLinks)
    .where(eq(usefulLinks.userId, userId));
  const remindersRows = await db
    .select()
    .from(reminders)
    .where(eq(reminders.userId, userId));

  return {
    exportedAt: new Date().toISOString(),
    profile: profile
      ? {
          displayName: profile.displayName,
          timezone: profile.timezone,
          onboardingCompletedAt: profile.onboardingCompletedAt,
        }
      : null,
    consents,
    academicTerms: academicTermsRows,
    courses: coursesRows,
    activities: activitiesRows,
    notes: notesRows,
    calendarEvents: calendarEventsRows,
    usefulLinks: usefulLinksRows,
    reminders: remindersRows,
  };
}

/** Storage keys of every attachment the user owns (export + deletion). */
export async function listUserAttachmentKeys(
  userId: string,
): Promise<string[]> {
  const rows = await db
    .select({ storageKey: attachments.storageKey })
    .from(attachments)
    .where(eq(attachments.userId, userId));
  return rows.map((r) => r.storageKey);
}

/** Storage keys of the user's finished export files (deletion cleanup). */
export async function listUserExportKeys(userId: string): Promise<string[]> {
  const rows = await db
    .select({ fileUrl: dataExports.fileUrl })
    .from(dataExports)
    .where(and(eq(dataExports.userId, userId), gt(dataExports.fileUrl, "")));
  return rows
    .map((r) => r.fileUrl)
    .filter((key): key is string => Boolean(key));
}

/**
 * Builds the export ZIP: one JSON document with all user data plus one file
 * per attachment. Returns the buffer and its sha256 checksum.
 */
export async function buildExportZip(
  bundle: ExportBundle,
  attachments: ExportAttachment[],
  storage: FileStorage,
): Promise<{ buffer: Buffer; checksum: string }> {
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const chunks: Buffer[] = [];
  archive.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolve, reject) => {
    archive.on("end", resolve);
    archive.on("error", reject);
  });

  archive.append(JSON.stringify(bundle, null, 2), {
    name: "sakustudi-data.json",
  });

  for (const attachment of attachments) {
    try {
      const stream = await storage.get(attachment.storageKey);
      const nodeStream = Readable.fromWeb(
        stream as import("node:stream/web").ReadableStream,
      );
      archive.append(nodeStream, { name: `files/${attachment.filename}` });
    } catch (error) {
      // A missing/corrupt object must not fail the whole export; the JSON
      // bundle is authoritative and the file is listed as skipped below.
      console.warn("export: attachment unavailable, skipping", {
        key: attachment.storageKey,
        error,
      });
      archive.append(
        JSON.stringify({ skipped: true, key: attachment.storageKey }),
        { name: `files/skipped-${attachment.filename}.json` },
      );
    }
  }

  await archive.finalize();
  await done;

  const buffer = Buffer.concat(chunks);
  const checksum = createHash("sha256").update(buffer).digest("hex");
  return { buffer, checksum };
}

/** Persists the finished ZIP under a generated key. */
export async function storeExportZip(
  exportId: string,
  buffer: Buffer,
  checksum: string,
): Promise<string> {
  const storage = await resolveStorage();
  const key = `${EXPORT_FILE_PREFIX}${exportId}.zip`;
  await storage.put({
    key,
    body: buffer,
    contentType: "application/zip",
    size: buffer.length,
    checksum,
  });
  return key;
}
