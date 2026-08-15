import { Queue, Worker } from "bullmq";

import { getRedisConnection } from "~/lib/queue/connection";
import { JOB_NAMES, QUEUE_NAMES } from "~/lib/queue/names";
import { closeDb } from "~/lib/db/client";
import { listOrphanObjects } from "~/modules/files/files.service";
import { resolveStorage } from "~/lib/storage/storage";
import { PUBLISH_OUTBOX_JOB_ID, runPublishOutbox } from "./tasks/publish-outbox";
import {
  armMaintenanceJobs,
  CLEANUP_JOB_ID,
  MAINTENANCE_JOB_OPTS,
  RECONCILE_JOB_ID,
  runReconcile,
} from "./tasks/reconcile";
import { runSendEmail } from "./tasks/send-email";
import { runSendReminder } from "./tasks/send-reminder";
import { runCreateExport } from "./tasks/create-export";
import { runDeleteUserFiles } from "./tasks/delete-user-files";
import { installShutdown } from "./shutdown";
import { startHeartbeat } from "~/lib/monitoring/heartbeat";

const REMINDERS_CONCURRENCY = 4;
const EMAILS_CONCURRENCY = 2;
const CLEANUP_CONCURRENCY = 1;
const EXPORTS_CONCURRENCY = 2;

/**
 * Storage-orphan cleanup: deletes storage objects whose attachment metadata
 * row no longer exists. Runs on its own queue at a low cadence.
 */
async function cleanupStorage(): Promise<{ removed: string[] }> {
  const orphans = await listOrphanObjects();
  const storage = await resolveStorage();
  const removed: string[] = [];
  for (const key of orphans) {
    try {
      await storage.delete(key);
      removed.push(key);
    } catch (error) {
      // A concurrent delete or a transient storage error must not abort the
      // sweep; the key stays an orphan and the next sweep retries it.
      console.error("cleanup: delete failed", { key }, error);
    }
  }
  return { removed };
}

async function main(): Promise<void> {
  const connection = getRedisConnection();
  await connection.ping();

  const remindersWorker = new Worker(
    QUEUE_NAMES.reminders,
    async (job) => {
      switch (job.name) {
        case JOB_NAMES.sendReminder:
          return runSendReminder(job);
        case JOB_NAMES.reconcile:
          return runReconcile(job);
        case JOB_NAMES.publishOutbox:
          return runPublishOutbox(job);
        default:
          throw new Error(`Unknown reminders job: ${job.name}`);
      }
    },
    { connection, concurrency: REMINDERS_CONCURRENCY },
  );

  const emailsWorker = new Worker(
    QUEUE_NAMES.emails,
    (job) => runSendEmail(job),
    { connection, concurrency: EMAILS_CONCURRENCY },
  );

  const cleanupWorker = new Worker(
    QUEUE_NAMES.cleanup,
    () => cleanupStorage(),
    { connection, concurrency: CLEANUP_CONCURRENCY },
  );

  const exportsWorker = new Worker(
    QUEUE_NAMES.exports,
    (job) => {
      switch (job.name) {
        case JOB_NAMES.createExport:
          return runCreateExport(job);
        case JOB_NAMES.deleteUserFiles:
          return runDeleteUserFiles(job);
        default:
          throw new Error(`Unknown exports job: ${job.name}`);
      }
    },
    { connection, concurrency: EXPORTS_CONCURRENCY },
  );

  // Failed jobs are logged by id and error class — never payload contents,
  // which may carry user data.
  for (const [queueName, worker] of [
    [QUEUE_NAMES.reminders, remindersWorker],
    [QUEUE_NAMES.emails, emailsWorker],
    [QUEUE_NAMES.cleanup, cleanupWorker],
    [QUEUE_NAMES.exports, exportsWorker],
  ] as const) {
    worker.on("failed", (job, error) => {
      const name = error instanceof Error ? error.name : String(error);
      console.error("worker: job failed", {
        queue: queueName,
        jobId: job?.id ?? "unknown",
        jobName: job?.name ?? "unknown",
        attemptsMade: job?.attemptsMade ?? 0,
        errorName: name,
      });
    });
    worker.on("error", (error) => {
      console.error("worker: connection error", {
        queue: queueName,
        errorName: error instanceof Error ? error.name : String(error),
      });
    });
  }

  const heartbeat = await startHeartbeat();

  installShutdown({
    workers: [remindersWorker, emailsWorker, cleanupWorker, exportsWorker],
    onClose: async () => {
      await heartbeat.stop();
      await closeDb();
    },
  });

  // Re-arm the maintenance loops from the workers' completion/failure events
  // (never from inside a maintenance handler — adding a job whose fixed id
  // is still active is ignored by BullMQ deduplication and would kill the
  // loop after one cycle). Each cycle's jobs remove themselves on finish, so
  // the fixed ids are free for the next arm.
  const arm = (): Promise<void> =>
    armMaintenanceJobs().catch((error) => {
      console.error("worker: failed to arm maintenance loop", error);
    });
  remindersWorker.on("completed", (job) => {
    if (job && (job.name === JOB_NAMES.reconcile || job.name === JOB_NAMES.publishOutbox)) {
      void arm();
    }
  });
  remindersWorker.on("failed", (job) => {
    if (job && (job.name === JOB_NAMES.reconcile || job.name === JOB_NAMES.publishOutbox)) {
      void arm();
    }
  });
  cleanupWorker.on("completed", (job) => {
    if (job && job.name === JOB_NAMES.cleanupStorage) {
      void arm();
    }
  });
  cleanupWorker.on("failed", (job) => {
    if (job && job.name === JOB_NAMES.cleanupStorage) {
      void arm();
    }
  });

  // Kick the maintenance loops immediately. A previous run's killed worker
  // may have left stale fixed-id jobs (delayed up to their original
  // interval) in Redis; jobId dedup would ignore the fresh add and stall
  // reconciliation, so clear those ids before arming.
  const remindersQueue = new Queue(QUEUE_NAMES.reminders, { connection });
  const cleanupQueue = new Queue(QUEUE_NAMES.cleanup, { connection });
  try {
    await remindersQueue.remove(RECONCILE_JOB_ID).catch(() => undefined);
    await remindersQueue.remove(PUBLISH_OUTBOX_JOB_ID).catch(() => undefined);
    await cleanupQueue.remove(CLEANUP_JOB_ID).catch(() => undefined);
    await remindersQueue.add(JOB_NAMES.reconcile, {}, { ...MAINTENANCE_JOB_OPTS, jobId: RECONCILE_JOB_ID });
    await remindersQueue.add(JOB_NAMES.publishOutbox, { limit: 100 }, { ...MAINTENANCE_JOB_OPTS, jobId: PUBLISH_OUTBOX_JOB_ID });
  } finally {
    await Promise.allSettled([remindersQueue.close(), cleanupQueue.close()]);
  }

  console.log("worker: started", {
    queues: [
      QUEUE_NAMES.reminders,
      QUEUE_NAMES.emails,
      QUEUE_NAMES.cleanup,
      QUEUE_NAMES.exports,
    ],
  });
}

main().catch((error) => {
  console.error("worker: fatal boot error", error);
  process.exit(1);
});
