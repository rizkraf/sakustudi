import { enqueueOutboxEvent } from "~/lib/queue/publish";
import {
  claimOutboxEvent,
  findPendingOutbox,
  markOutboxSent,
} from "./outbox.repository";

/**
 * Publishes up to `limit` pending outbox events to Redis. Each event is
 * claimed in a short transaction, published by deterministic job id, then
 * marked sent. The claim is the at-least-once fence: a crash between publish
 * and mark leaves the row "processing"; reconciliation resets it to pending
 * after the lease expires and the duplicate publication is ignored by the
 * job-id dedup.
 *
 * Returns the number of events published.
 */
export async function publishPendingOutbox(limit: number): Promise<number> {
  const pending = await findPendingOutbox(limit);
  let published = 0;
  for (const event of pending) {
    const claimed = await claimOutboxEvent(event.id);
    if (!claimed) {
      continue;
    }
    await enqueueOutboxEvent(event.id);
    await markOutboxSent(event.id);
    published += 1;
  }
  return published;
}
