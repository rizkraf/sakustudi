import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";

import { mailFor, readMails, signInViaApi, uniqueEmail } from "./helpers";

/**
 * Reminder delivery e2e: a real BullMQ worker processes due reminders that
 * are "fake-clocked" into the past via SQL (instead of waiting real time),
 * and reminder emails land in the shared file mail transport.
 *
 * The worker runs as a child of the spec (not the webServer), with a short
 * reconcile interval so due reminders are picked up within a few seconds.
 */
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgres://sakustudi:sakustudi@localhost:5432/sakustudi",
});

let worker: ChildProcess | null = null;

/** Date-only input value (YYYY-MM-DD) N days from the test run's clock. */
function daysFromNow(days: number): string {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function userIdFor(email: string): Promise<string> {
  const { rows } = await pool.query("SELECT id FROM \"user\" WHERE email = $1", [
    email,
  ]);
  if (rows.length === 0) throw new Error(`No user for ${email}`);
  return rows[0].id as string;
}

/** Fake clock: rewinds the soonest due reminder row into the past so delivery fires now. */
async function rewindReminders(
  userId: string,
  channel: "in_app" | "email",
): Promise<number> {
  const { rowCount } = await pool.query(
    "UPDATE reminders SET remind_at = now() - interval '2 minutes' " +
      "WHERE id = (SELECT id FROM reminders WHERE user_id = $1 AND channel = $2 " +
      "  AND status = 'scheduled' ORDER BY remind_at LIMIT 1)",
    [userId, channel],
  );
  return rowCount ?? 0;
}

async function remindersOfActivity(activityTitle: string, userId: string) {
  const { rows } = await pool.query(
    "SELECT r.status, r.channel FROM reminders r " +
      "JOIN activities a ON a.id = r.activity_id " +
      "WHERE a.user_id = $1 AND a.title = $2",
    [userId, activityTitle],
  );
  return rows as Array<{ status: string; channel: string }>;
}

/**
 * Waits until the worker has delivered the next scheduled reminder of the
 * given channel. The calendar/settings pages render server-side, so the test
 * must not navigate to them before delivery completes.
 */
async function waitForDelivery(
  userId: string,
  channel: "in_app" | "email",
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { rows } = await pool.query(
      "SELECT status FROM reminders WHERE user_id = $1 AND channel = $2 AND status <> 'scheduled' ORDER BY remind_at DESC LIMIT 1",
      [userId, channel],
    );
    if (rows.length > 0 && rows[0].status === "sent") return;
    if (Date.now() > deadline) {
      throw new Error(`Reminder (${channel}) was not delivered within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

function startWorker(): Promise<ChildProcess> {
  // Spawn tsx directly (no npm wrapper): child.kill() then kills the actual
  // worker process, cross-platform.
  const tsxCli = path.join(
    process.cwd(),
    "node_modules",
    "tsx",
    "dist",
    "cli.mjs",
  );
  const child = spawn(process.execPath, [tsxCli, "worker/index.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RECONCILE_INTERVAL_MS: "2000",
      CLEANUP_INTERVAL_MS: "60000",
      MAIL_ADAPTER: "file",
      MAIL_FILE_PATH: ".tmp/mail.json",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const log = fs.createWriteStream(".tmp/e2e-worker.log", { flags: "a" });

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
      log.write(chunk);
      out += chunk.toString();
      if (!settled && out.includes("worker: started")) {
        settled = true;
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      log.write(chunk);
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
  const exited = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
  child.kill();
  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, 10_000)),
  ]);
}

test.beforeAll(async () => {
  worker = await startWorker();
});

test.afterAll(async () => {
  await stopWorker();
  await pool.end().catch(() => undefined);
});

test("delivers in-app reminders, records read state, sends email, and cancels on completion", async ({
  page,
}) => {
  const email = uniqueEmail("reminders");
  await signInViaApi(page, email, "Reminder User");
  const userId = await userIdFor(email);

  // Set up an active term with one custom course.
  await page.goto("/academic-terms");
  await page.getByLabel("Term name").fill("Gasal 2026/2027");
  await page.getByRole("button", { name: "Create term" }).click();
  await expect(page.getByText("Gasal 2026/2027")).toBeVisible();
  await page.getByRole("link", { name: "Gasal 2026/2027" }).click();
  await page.getByLabel("Course name").fill("Sistem Basis Data");
  await page.getByLabel("Course code").fill("KDST4101");
  await page.getByRole("button", { name: "Add custom course" }).click();
  await expect(page.getByText("KDST4101")).toBeVisible();

  // Create an activity with a deadline far enough out to schedule reminders.
  await page.goto("/activities/new");
  await page.getByLabel("Title").fill("Deadline reminder");
  await page.getByLabel("Course").selectOption({ label: "Sistem Basis Data (KDST4101)" });
  await page.getByLabel("Deadline").fill(daysFromNow(10));
  await page.getByRole("button", { name: "Create activity" }).click();
  await expect(page).toHaveURL(/\/activities$/);
  await expect(page.getByRole("link", { name: "Deadline reminder" })).toBeVisible();

  // Fake clock: make the in-app reminders due; the worker's reconcile loop
  // enqueues and delivers them.
  const rewoundInApp = await rewindReminders(userId, "in_app");
  expect(rewoundInApp).toBeGreaterThanOrEqual(1);
  await waitForDelivery(userId, "in_app");

  await page.goto("/calendar");
  await expect(page.getByText("Unread reminders")).toBeVisible();
  await expect(page.getByRole("link", { name: "Deadline reminder" })).toBeVisible();

  // Marking read removes the reminder from the unread bell.
  await page.getByRole("button", { name: "Mark read" }).first().click();
  await expect(page.getByText("Unread reminders")).toBeHidden({ timeout: 20_000 });

  // The settings page lists the sent in-app reminder without a read action.
  await page.goto("/settings/reminders");
  await expect(page.getByText("In-app · Sent")).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark read" })).toHaveCount(0);

  // Enable email reminders (the toggle is hidden without SMTP, so the
  // preference is written directly) and create another activity.
  await pool.query(
    `INSERT INTO profiles (user_id, settings) VALUES ($1, $2::jsonb)
     ON CONFLICT (user_id) DO UPDATE
     SET settings = profiles.settings || $2::jsonb, updated_at = now()`,
    [userId, JSON.stringify({ reminders: { emailEnabled: true } })],
  );

  await page.goto("/activities/new");
  await page.getByLabel("Title").fill("Email reminder");
  await page.getByLabel("Course").selectOption({ label: "Sistem Basis Data (KDST4101)" });
  await page.getByLabel("Deadline").fill(daysFromNow(12));
  await page.getByRole("button", { name: "Create activity" }).click();
  await expect(page).toHaveURL(/\/activities$/);
  await expect(page.getByRole("link", { name: "Email reminder" })).toBeVisible();

  // Fake clock: make the email reminders due; the worker sends through the
  // file mail transport.
  const rewoundEmail = await rewindReminders(userId, "email");
  expect(rewoundEmail).toBeGreaterThanOrEqual(1);
  await waitForDelivery(userId, "email");

  const mail = await mailFor(email, "reminder");
  expect(mail.title).toBe("Email reminder");

  await page.goto("/settings/reminders");
  await expect(page.getByText("Email · Sent")).toBeVisible();

  // Completing an activity cancels its schedule: no stale deliveries.
  await page.goto("/activities");
  const deadlineCard = page
    .getByRole("article")
    .filter({ hasText: "Deadline reminder" });
  await deadlineCard.getByRole("button", { name: "Mark complete" }).click();
  await expect(deadlineCard.getByText("Completed")).toBeVisible();

  const rows = await remindersOfActivity("Deadline reminder", userId);
  expect(rows.length).toBeGreaterThan(0);
  // Delivered reminders stay as delivered history; every still-scheduled
  // reminder must be cancelled so nothing stale fires later.
  const pending = rows.filter((r) => r.status !== "sent");
  expect(pending.every((r) => r.status === "cancelled")).toBe(true);

  // No reminder emails beyond the intended one were sent.
  const reminderMails = (await readMails()).filter((m) => m.kind === "reminder");
  expect(reminderMails).toHaveLength(1);
  expect(reminderMails[0].title).toBe("Email reminder");
});
