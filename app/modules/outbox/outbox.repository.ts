import { and, count, eq, isNull, lte, or } from "drizzle-orm";

import { getDb } from "~/lib/db/client";
import { outboxEvents } from "~/lib/db/schema";

const db = getDb();

export type OutboxEventRow = typeof outboxEvents.$inferSelect;
export type OutboxEventStatus = OutboxEventRow["status"];

export type OutboxEventInsert = {
  userId: string;
  eventType: string;
  eventKey: string;
  payload: Record<string, unknown>;
};

export type OutboxTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Writes an outbox event inside the caller's transaction. */
export async function insertOutboxEvent(
  tx: OutboxTx,
  input: OutboxEventInsert,
): Promise<OutboxEventRow> {
  const [row] = await tx
    .insert(outboxEvents)
    .values({
      userId: input.userId,
      eventType: input.eventType,
      eventKey: input.eventKey,
      payload: input.payload,
    })
    .returning();
  return row;
}

export async function findOutboxEvent(
  eventId: string,
): Promise<OutboxEventRow | undefined> {
  const [row] = await db
    .select()
    .from(outboxEvents)
    .where(eq(outboxEvents.id, eventId))
    .limit(1);
  return row;
}

/**
 * Pending events whose next attempt is due, oldest first. `nextAttemptAt`
 * null means never attempted.
 */
export async function findPendingOutbox(
  limit: number,
): Promise<OutboxEventRow[]> {
  return db
    .select()
    .from(outboxEvents)
    .where(
      and(
        eq(outboxEvents.status, "pending"),
        or(
          isNull(outboxEvents.nextAttemptAt),
          lte(outboxEvents.nextAttemptAt, new Date()),
        ),
      ),
    )
    .orderBy(outboxEvents.createdAt)
    .limit(limit);
}

/**
 * Atomically claims a pending event for publication: the conditional update
 * wins only if the row is still pending, so concurrent publishers never
 * process the same row twice. Claims carry a 5-minute lease
 * (`next_attempt_at`); a crashed publisher leaves a "processing" row that
 * reconciliation resets once the lease expires.
 */
export async function claimOutboxEvent(eventId: string): Promise<boolean> {
  const rows = await db
    .update(outboxEvents)
    .set({
      status: "processing",
      nextAttemptAt: new Date(Date.now() + 5 * 60_000),
      updatedAt: new Date(),
    })
    .where(and(eq(outboxEvents.id, eventId), eq(outboxEvents.status, "pending")))
    .returning({ id: outboxEvents.id });
  return rows.length > 0;
}

export async function markOutboxSent(eventId: string): Promise<void> {
  await db
    .update(outboxEvents)
    .set({
      status: "sent",
      nextAttemptAt: null,
      updatedAt: new Date(),
    })
    .where(eq(outboxEvents.id, eventId));
}

/**
 * Returns stale "processing" rows (lease expired) to pending so a crashed or
 * restarted publisher's work is redone. Redis-side idempotency (deterministic
 * job ids) makes the redo harmless.
 */
export async function resetStaleProcessing(now: Date): Promise<number> {
  const rows = await db
    .update(outboxEvents)
    .set({ status: "pending", updatedAt: new Date() })
    .where(
      and(
        eq(outboxEvents.status, "processing"),
        lte(outboxEvents.nextAttemptAt, now),
      ),
    )
    .returning({ id: outboxEvents.id });
  return rows.length;
}

/**
 * Count of rows in a status, used by tests to watch the publish pipeline.
 */
export async function countOutboxByStatus(
  status: OutboxEventStatus,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(outboxEvents)
    .where(eq(outboxEvents.status, status));
  return Number(row?.value ?? 0);
}
