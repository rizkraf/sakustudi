import { and, eq } from "drizzle-orm";

import { AppError } from "~/lib/errors/AppError";
import { getDb } from "~/lib/db/client";
import { academicTerms } from "~/lib/db/schema";
import { zodIssuesToFieldErrors } from "~/modules/shared/zod";
import { createTermSchema, type CreateTermInput } from "./terms.schema";
import {
  archiveOtherActiveTerms,
  findOwnedTerm,
  insertTerm,
  isUniqueViolation,
  type AcademicTermRow,
} from "./terms.repository";

const ACTIVE_TERM_CONSTRAINT = "academic_terms_user_active_unique";

/**
 * Creates a new term as the user's active term. The partial unique index
 * enforces a single active term per user; a concurrent activation that loses
 * the race surfaces as a CONFLICT.
 */
export async function createAcademicTerm(
  userId: string,
  input: CreateTermInput,
): Promise<AcademicTermRow> {
  const parsed = createTermSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", "Please fix the highlighted fields.", {
      fieldErrors: zodIssuesToFieldErrors(parsed.error),
    });
  }

  try {
    return await insertTerm(userId, parsed.data);
  } catch (error) {
    if (isUniqueViolation(error, ACTIVE_TERM_CONSTRAINT)) {
      throw new AppError(
        "CONFLICT",
        "You already have an active term. Archive it before creating another.",
      );
    }
    throw error;
  }
}

/** Activates an owned term, archiving any other active term first. */
export async function setActiveTerm(
  userId: string,
  termId: string,
): Promise<AcademicTermRow> {
  const term = await findOwnedTerm(userId, termId);
  if (!term) {
    throw new AppError("NOT_FOUND", "Term not found.");
  }
  if (term.status === "active") {
    return term;
  }

  const db = getDb();
  try {
    return await db.transaction(async (tx) => {
      await archiveOtherActiveTerms(tx, userId, termId);
      const [row] = await tx
        .update(academicTerms)
        .set({ status: "active", updatedAt: new Date() })
        .where(and(eq(academicTerms.id, termId), eq(academicTerms.userId, userId)))
        .returning();
      if (!row) {
        throw new AppError("NOT_FOUND", "Term not found.");
      }
      return row;
    });
  } catch (error) {
    if (isUniqueViolation(error, ACTIVE_TERM_CONSTRAINT)) {
      throw new AppError(
        "CONFLICT",
        "Only one active term is allowed per user.",
      );
    }
    throw error;
  }
}
