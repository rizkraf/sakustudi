import nodemailer from "nodemailer";

import { renderAuthEmail } from "./templates";
import type { AuthEmailInput } from "./templates";

export type { AuthEmailInput } from "./templates";

export type MailAdapter = {
  send(input: AuthEmailInput): Promise<void>;
};

const SMTP_HOST = process.env.SMTP_HOST ?? "localhost";
const SMTP_PORT = Number.parseInt(process.env.SMTP_PORT ?? "1025", 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM ?? "SakuStudi <no-reply@sakustudi.local>";

export function createInMemoryMailer(): MailAdapter & { messages: AuthEmailInput[] } {
  const messages: AuthEmailInput[] = [];
  return {
    messages,
    async send(input: AuthEmailInput) {
      messages.push(input);
    },
  };
}

export function createFileMailer(filePath: string): MailAdapter & { filePath: string } {
  return {
    filePath,
    async send(input: AuthEmailInput) {
      const { writeFile, mkdir, readFile } = await import("node:fs/promises");
      const { dirname } = await import("node:path");
      await mkdir(dirname(filePath), { recursive: true });
      let fileText = "";
      try {
        fileText = await readFile(filePath, "utf8");
      } catch {
        // file does not exist yet
      }
      const messages = fileText ? (JSON.parse(fileText) as AuthEmailInput[]) : [];
      messages.push(input);
      await writeFile(filePath, JSON.stringify(messages, null, 2), "utf8");
    },
  };
}

export function createSmtpMailer(): MailAdapter {
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });

  return {
    async send(input: AuthEmailInput) {
      const rendered = renderAuthEmail(input);
      await transport.sendMail({
        from: SMTP_FROM,
        to: input.to,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });
    },
  };
}

const memoryMailer = createInMemoryMailer();
let activeAdapter: MailAdapter = memoryMailer;

export function setMailAdapter(adapter: MailAdapter): void {
  activeAdapter = adapter;
}

export function getMailAdapter(): MailAdapter & { messages?: AuthEmailInput[] } {
  return activeAdapter;
}

function adapterFromEnv(): MailAdapter {
  switch (process.env.MAIL_ADAPTER) {
    case "memory":
      return memoryMailer;
    case "file":
      return createFileMailer(process.env.MAIL_FILE_PATH ?? ".tmp/mail.json");
    case "smtp":
      return createSmtpMailer();
    default:
      return createSmtpMailer();
  }
}

if (typeof process !== "undefined" && process.env.MAIL_ADAPTER) {
  activeAdapter = adapterFromEnv();
}

export async function sendAuthEmail(input: AuthEmailInput): Promise<void> {
  await activeAdapter.send(input);
}

export type ReminderEmailInput = {
  to: string;
  title: string;
  message: string | null;
};

/**
 * Sends a reminder email through the active adapter. Used by the reminder
 * worker; the emails queue owns retry policy, so this is a single attempt.
 */
export async function sendReminderEmail(
  input: ReminderEmailInput,
): Promise<void> {
  await activeAdapter.send({
    kind: "reminder",
    to: input.to,
    title: input.title,
    message: input.message,
  });
}

/**
 * Whether a real SMTP transport is configured. The in-memory and file
 * adapters are test/local-only, so the UI hides the email-reminder toggle
 * unless the server would actually deliver mail.
 */
export function isSmtpCapable(): boolean {
  const adapter = process.env.MAIL_ADAPTER;
  if (adapter === "memory" || adapter === "file") {
    return false;
  }
  return Boolean(process.env.SMTP_HOST ?? "localhost");
}
