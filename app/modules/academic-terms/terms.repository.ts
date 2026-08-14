import { and, eq, ne } from "drizzle-orm";

import { getDb } from "~/lib/db/client";
import { academicTerms } from "~/lib/db/schema";

const db = getDb();

export type AcademicTermRow = typeof academicTerms.$inferSelect;

export async function findOwnedTerm(
  userId: string,
  termId: string,
): Promise<AcademicTermRow | undefined> {
  const [row] = await db
    .select()
    .from(academicTerms)
    .where(and(eq(academicTerms.id, termId), eq(academicTerms.userId, userId)))
    .limit(1);
  return row;
}

export async function findActiveTerm(
  userId: string,
): Promise<AcademicTermRow | undefined> {
  const [row] = await db
    .select()
    .from(academicTerms)
    .where(
      and(eq(academicTerms.userId, userId), eq(academicTerms.status, "active")),
    )
    .limit(1);
  return row;
}

export async function listOwnedTerms(
  userId: string,
): Promise<AcademicTermRow[]> {
  return db
    .select()
    .from(academicTerms)
    .where(eq(academicTerms.userId, userId))
    .orderBy(academicTerms.startDate, academicTerms.createdAt);
}

export async function insertTerm(
  userId: string,
  input: { name: string; startDate: Date; endDate: Date },
): Promise<AcademicTermRow> {
  const [row] = await db
    .insert(academicTerms)
    .values({
      userId,
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
      status: "active",
    })
    .returning();
  return row;
}

/**
 * Marks every other active term archived inside the given transaction, so the
 * caller can activate its own term without racing another activation.
 */
export async function archiveOtherActiveTerms(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  exceptTermId: string,
): Promise<void> {
  await tx
    .update(academicTerms)
    .set({ status: "archived", updatedAt: new Date() })
    .where(
      and(
        eq(academicTerms.userId, userId),
        eq(academicTerms.status, "active"),
        ne(academicTerms.id, exceptTermId),
      ),
    );
}

/**
 * Detects a PostgreSQL unique constraint violation (23505), optionally
 * scoped to a named constraint such as academic_terms_user_active_unique.
 */
export function isUniqueViolation(
  error: unknown,
  constraint?: string,
): boolean {
  const candidate = error as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  };
  const code = candidate.code ?? candidate.cause?.code;
  if (code !== "23505") return false;
  if (!constraint) return true;
  return (
    candidate.constraint === constraint ||
    candidate.cause?.constraint === constraint
  );
}
