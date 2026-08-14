import { eq } from "drizzle-orm";

import { getDb } from "~/lib/db/client";
import { auditLogs, legalConsents } from "~/lib/db/schema";
import { AppError } from "~/lib/errors/AppError";
import { auth } from "~/lib/auth/server";
import {
  buildDeleteUserFilesJobId,
  deleteUserFilesPayloadFor,
} from "./privacy.jobs";
import {
  listUserAttachmentKeys,
  listUserExportKeys,
} from "~/modules/exports/export.service";

const db = getDb();

/** Storage keys the deletion worker must remove for this user. */
export async function collectUserStorageKeys(
  userId: string,
): Promise<string[]> {
  const [attachmentKeys, exportKeys] = await Promise.all([
    listUserAttachmentKeys(userId),
    listUserExportKeys(userId),
  ]);
  return [...new Set([...attachmentKeys, ...exportKeys])];
}

export type ConsentSummary = {
  documentType: string;
  version: string;
  acceptedAt: Date;
};

/** The user's recorded legal consents, newest first. */
export async function listUserConsents(
  userId: string,
): Promise<ConsentSummary[]> {
  const rows = await db
    .select()
    .from(legalConsents)
    .where(eq(legalConsents.userId, userId));
  return rows.map((r) => ({
    documentType: r.consentType,
    version: r.version,
    acceptedAt: r.acceptedAt,
  }));
}

/**
 * Deletes the user's account end to end:
 *
 * 1. Collects private storage keys (attachments, export files).
 * 2. Enforces the fresh-session/re-authentication rule through Better Auth's
 *    delete-user API — an old session without a password is rejected with a
 *    re-authentication error that the UI surfaces.
 * 3. Better Auth deletes sessions, accounts, and the user row; domain tables
 *    cascade via FK policy.
 * 4. Enqueues the storage-object deletion job (idempotent, retried).
 * 5. Records a non-personal audit event (no email, no contents).
 *
 * Safe to retry: anything already absent is a no-op.
 */
export async function requestAccountDeletion(
  userId: string,
  request: Request,
  password?: string,
): Promise<void> {
  const keys = await collectUserStorageKeys(userId);

  try {
    await auth.api.deleteUser({
      body: { password: password ?? undefined, callbackURL: "/" },
      headers: request.headers,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    const status =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode?: unknown }).statusCode)
        : 0;
    if (
      status === 401 ||
      status === 403 ||
      message.includes("Re-authenticate") ||
      message.includes("re-authenticate") ||
      message.includes("session")
    ) {
      throw new AppError(
        "FORBIDDEN",
        "Re-authenticate (or provide your password) to delete your account",
      );
    }
    if (message.includes("password")) {
      throw new AppError(
        "VALIDATION_FAILED",
        "Password is incorrect",
      );
    }
    throw error;
  }

  await deleteUserFilesPayloadFor(userId, keys).catch((error) => {
    // Storage cleanup is best-effort with retries; a failure here must not
    // resurrect the deleted account. Orphan sweeps also cover stragglers.
    console.error("account deletion: file cleanup enqueue failed", {
      userId,
      error,
    });
  });

  await db
    .insert(auditLogs)
    .values({
      action: "account.deleted",
      entityType: "user",
      entityId: null,
      newValue: { storageKeysCount: keys.length },
    })
    .catch((error) => {
      // The audit log FK is set-null; if the user row is already gone this
      // write is best-effort only.
      console.error("account deletion: audit log write failed", error);
    });
}

/** Job id helper re-exported for tests. */
export { buildDeleteUserFilesJobId };
