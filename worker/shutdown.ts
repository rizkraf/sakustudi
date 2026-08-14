import type { Worker } from "bullmq";

import { closeRedis } from "~/lib/queue/connection";

type ShutdownOptions = {
  workers: Worker[];
  /** Optional pool teardown to run after the workers drain. */
  onClose?: () => Promise<void>;
};

let installed = false;

/**
 * Graceful shutdown for SIGINT/SIGTERM: stop accepting jobs, await active
 * jobs, close workers, close Redis, close the database pool, then exit 0. A
 * hard-exit timer bounds the drain so a wedged job cannot hang the process
 * forever.
 */
export function installShutdown(options: ShutdownOptions): void {
  if (installed) {
    return;
  }
  installed = true;

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`worker: ${signal} received, draining...`);
    const timer = setTimeout(() => {
      console.error("worker: drain timed out, forcing exit");
      process.exit(1);
    }, 15_000);
    timer.unref();

    try {
      for (const worker of options.workers) {
        // close() stops accepting new jobs and waits for active ones.
        await worker.close();
      }
      if (options.onClose) {
        await options.onClose();
      }
      await closeRedis();
      console.log("worker: shutdown complete");
      process.exit(0);
    } catch (error) {
      console.error("worker: shutdown failed", error);
      process.exit(1);
    }
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("uncaughtException", (error) => {
    console.error("worker: uncaught exception", error);
    process.exit(1);
  });
}
