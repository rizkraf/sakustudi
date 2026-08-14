import { expect, type Page } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const MAIL_FILE = process.env.MAIL_FILE_PATH ?? ".tmp/mail.json";
const EMAIL_SUFFIX = "@e2e.test";

export type CapturedMail = {
  kind: "verification" | "password_reset";
  to: string;
  url: string;
};

export function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}${EMAIL_SUFFIX}`;
}

export async function readMails(): Promise<CapturedMail[]> {
  try {
    const text = await readFile(MAIL_FILE, "utf8");
    return JSON.parse(text) as CapturedMail[];
  } catch {
    return [];
  }
}

export async function resetMails(): Promise<void> {
  await mkdir(dirname(MAIL_FILE), { recursive: true });
  await writeFile(MAIL_FILE, "[]", "utf8");
}

export async function mailFor(
  to: string,
  kind: CapturedMail["kind"],
): Promise<CapturedMail> {
  let mail: CapturedMail | undefined;
  await expect
    .poll(
      async () => {
        const mails = await readMails();
        mail = mails.find((m) => m.to === to && m.kind === kind);
        return mail ?? null;
      },
      { timeout: 10_000 },
    )
    .not.toBeNull();
  return mail!;
}

/**
 * Creates a verified user with recorded legal consents by going through the
 * register route, then opens the app as that user. The session cookie is
 * stored in the page's browser context.
 */
export async function signInViaApi(page: Page, email: string, name = "E2E User") {
  await resetMails();
  const response = await page.request.post("/register", {
    form: {
      name,
      email,
      password: "password123",
      acceptTerms: "on",
      acceptPrivacy: "on",
    },
  });
  expect(response.ok()).toBeTruthy();

  const verifyMail = await mailFor(email, "verification");
  const verifyResponse = await page.request.get(verifyMail.url);
  expect(verifyResponse.ok()).toBeTruthy();

  await page.goto("/");
  await expect(page).toHaveURL("http://localhost:3000/");
}
