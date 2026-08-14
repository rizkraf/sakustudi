import { and, asc, eq, isNull, or } from "drizzle-orm";

import { getDb } from "~/lib/db/client";
import { usefulLinks } from "~/lib/db/schema";

const db = getDb();

export type UsefulLinkRow = typeof usefulLinks.$inferSelect;

export type UsefulLinkInsert = {
  title: string;
  url: string;
  description: string | null;
  category: string | null;
  courseId: string | null;
};

/**
 * Links for the user: user-owned rows (scoped to a course when courseId is
 * given) plus the global UT defaults seeded with a null user_id, which are
 * visible to everyone. Ordered by the stable position field, then title.
 */
export async function listUsefulLinks(
  userId: string,
  courseId?: string | null,
): Promise<UsefulLinkRow[]> {
  const userScoped =
    courseId === undefined || courseId === null
      ? eq(usefulLinks.userId, userId)
      : and(eq(usefulLinks.userId, userId), eq(usefulLinks.courseId, courseId));
  const where = or(
    userScoped,
    and(isNull(usefulLinks.userId), isNull(usefulLinks.courseId)),
  );
  return db
    .select()
    .from(usefulLinks)
    .where(where)
    .orderBy(asc(usefulLinks.position), asc(usefulLinks.title));
}

export async function insertUsefulLink(
  userId: string,
  input: UsefulLinkInsert,
): Promise<UsefulLinkRow> {
  const [row] = await db
    .insert(usefulLinks)
    .values({
      userId,
      title: input.title,
      url: input.url,
      description: input.description,
      category: input.category,
      courseId: input.courseId,
    })
    .returning();
  return row;
}

export async function deleteOwnedUsefulLink(
  userId: string,
  linkId: string,
): Promise<boolean> {
  const rows = await db
    .delete(usefulLinks)
    .where(and(eq(usefulLinks.userId, userId), eq(usefulLinks.id, linkId)))
    .returning({ id: usefulLinks.id });
  return rows.length > 0;
}
