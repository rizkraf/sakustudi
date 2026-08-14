import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { Pool } from "pg";

import { signInViaApi, uniqueEmail } from "./helpers";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgres://sakustudi:sakustudi@localhost:5432/sakustudi",
});

let worker: ChildProcess | null = null;

function startWorker(): Promise<ChildProcess> {
  const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  const child = spawn(process.execPath, [tsxCli, "worker/index.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RECONCILE_INTERVAL_MS: "2000",
      MAIL_ADAPTER: "file",
      MAIL_FILE_PATH: ".tmp/mail.json",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    let out = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`Worker did not boot in time:\n${out}`));
      }
    }, 60_000);
    child.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString();
      if (!settled && out.includes("worker: started")) {
        settled = true;
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.on("exit", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Worker exited early (code ${code}):\n${out}`));
      }
    });
  });
}

async function stopWorker(): Promise<void> {
  if (!worker) return;
  const child = worker;
  worker = null;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill();
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 10_000))]);
}

test.beforeAll(async () => {
  worker = await startWorker();
});

test.afterAll(async () => {
  await stopWorker();
  await pool.end().catch(() => undefined);
});

test("requests an export, downloads it, and deletes the account", async ({ page }) => {
  const email = uniqueEmail("privacy");
  await signInViaApi(page, email);
  const { rows } = await pool.query('SELECT id FROM "user" WHERE email = $1', [email]);
  const userId = rows[0].id as string;

  await page.goto("/settings/privacy");
  await expect(page.getByText("Privacy & data")).toBeVisible();

  // Request an export; the worker marks it ready within a few seconds.
  await page.getByRole("button", { name: "Request export" }).click();
  await expect(page.getByText("Request export")).toBeVisible();
  await expect
    .poll(
      async () => {
        const { rows } = await pool.query(
          "SELECT status FROM data_exports WHERE user_id = $1 ORDER BY requested_at DESC LIMIT 1",
          [userId],
        );
        return rows[0]?.status ?? null;
      },
      { timeout: 30_000, message: "export never became ready" },
    )
    .toBe("ready");

  // The list is server-rendered; reload to see the ready export.
  await page.reload();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download" }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/sakustudi-export-.*\.zip/);

  // Delete the account with the correct password. The session dies with the
  // user, so the app bounces to /login; what matters is the row is gone.
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByLabel(/^Password/).fill("password123");
  await page.getByRole("button", { name: "Delete account" }).click();

  await expect
    .poll(
      async () => {
        const { rows } = await pool.query('SELECT 1 FROM "user" WHERE id = $1', [userId]);
        return rows.length;
      },
      { timeout: 15_000, message: "user row was not deleted" },
    )
    .toBe(0);
});

test("account deletion requires re-authentication without a fresh session", async ({
  page,
}) => {
  const email = uniqueEmail("privacy-fresh");
  await signInViaApi(page, email);
  const { rows } = await pool.query('SELECT id FROM "user" WHERE email = $1', [email]);
  const userId = rows[0].id as string;

  // Age the session so Better Auth's fresh-session check fails.
  await pool.query(
    'UPDATE "session" SET created_at = now() - interval \'2 days\' WHERE "user_id" = $1',
    [userId],
  );

  await page.goto("/settings/privacy");
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByRole("button", { name: "Delete account" }).click();

  // Without a password the action must surface the re-authentication error.
  await expect(page.getByText(/Re-authenticate/).first()).toBeVisible();
  const { rows: after } = await pool.query('SELECT 1 FROM "user" WHERE id = $1', [userId]);
  expect(after.length).toBe(1);
});
