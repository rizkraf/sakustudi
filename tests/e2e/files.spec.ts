import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { signInViaApi, uniqueEmail } from "./helpers";

const PDF_BYTES = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
);
const DOCX_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

/** Sets up a term + course, the minimal fixture both notes and activities need. */
async function setUpTermAndCourse(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/academic-terms");
  await page.getByLabel("Term name").fill("Gasal 2026/2027");
  await page.getByRole("button", { name: "Create term" }).click();
  await expect(page.getByText("Gasal 2026/2027")).toBeVisible();

  await page.getByRole("link", { name: "Gasal 2026/2027" }).click();
  await page.getByLabel("Course name").fill("Struktur Data");
  await page.getByLabel("Course code").fill("KDST4101");
  await page.getByRole("button", { name: "Add custom course" }).click();
  await expect(page.getByText("KDST4101")).toBeVisible();
}

async function createNote(page: import("@playwright/test").Page, title: string): Promise<void> {
  await page.goto("/notes");
  await page.getByRole("link", { name: "New note" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Create note" }).click();
  await expect(page).toHaveURL(/\/notes\/[^/]+$/);
}

test("a user uploads, downloads, and deletes an attachment on a note", async ({ page }) => {
  const email = uniqueEmail("files-note");
  await signInViaApi(page, email, "Files User");
  await setUpTermAndCourse(page);
  await createNote(page, "Files: rangkuman");

  // Empty state before any upload.
  await expect(page.getByText("No attachments yet.")).toBeVisible();

  // Upload a tiny real PDF through the server handler.
  await page.getByLabel("Add file").setInputFiles({
    name: "rangkuman.pdf",
    mimeType: "application/pdf",
    buffer: PDF_BYTES,
  });
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByRole("link", { name: "rangkuman.pdf" })).toBeVisible();
  await expect(page.getByText("No attachments yet.")).toBeHidden();

  // Download streams the exact bytes with the original filename.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "rangkuman.pdf" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("rangkuman.pdf");
  const saved = await readFile((await download.path())!);
  expect(saved.equals(PDF_BYTES)).toBe(true);

  // Delete returns to the empty state.
  await page.getByRole("button", { name: "Delete rangkuman.pdf" }).click();
  await expect(page.getByText("No attachments yet.")).toBeVisible();
  await expect(page.getByRole("link", { name: "rangkuman.pdf" })).toBeHidden();
});

test("invalid uploads are rejected and never listed", async ({ page }) => {
  const email = uniqueEmail("files-reject");
  await signInViaApi(page, email, "Files User");
  await setUpTermAndCourse(page);
  await createNote(page, "Files: reject");

  await page.getByLabel("Add file").setInputFiles({
    name: "virus.exe",
    mimeType: "application/octet-stream",
    buffer: Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]),
  });
  await page.getByRole("button", { name: "Upload" }).click();

  await expect(
    page.getByText("Only PDF, PNG, JPEG, and DOCX files are allowed."),
  ).toBeVisible();
  await expect(page.getByText("No attachments yet.")).toBeVisible();

  // A spoofed type is rejected too: PDF bytes claiming to be a PNG.
  await page.getByLabel("Add file").setInputFiles({
    name: "notes.png",
    mimeType: "image/png",
    buffer: PDF_BYTES,
  });
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(
    page.getByText("The file contents do not match its type."),
  ).toBeVisible();
  await expect(page.getByText("No attachments yet.")).toBeVisible();
});

/** Date-only input value (YYYY-MM-DD) N days from the test run's clock. */
function daysFromNow(days: number): string {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

test("an activity accepts and lists attachments", async ({ page }) => {
  const email = uniqueEmail("files-activity");
  await signInViaApi(page, email, "Files User");
  await setUpTermAndCourse(page);

  await page.goto("/activities");
  await page.getByRole("link", { name: "New activity" }).click();
  await page.getByLabel("Title").fill("Tugas 1: struktur");
  await page.getByLabel("Course").selectOption({ label: "Struktur Data (KDST4101)" });
  await page.getByLabel("Deadline").fill(daysFromNow(2));
  await page.getByRole("button", { name: "Create activity" }).click();
  await expect(page).toHaveURL("http://localhost:3000/activities");

  await page.getByRole("link", { name: "Tugas 1: struktur" }).click();
  await expect(page.getByText("No attachments yet.")).toBeVisible();

  await page.getByLabel("Add file").setInputFiles({
    name: "lembar-kerja.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: DOCX_BYTES,
  });
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByRole("link", { name: "lembar-kerja.docx" })).toBeVisible();
});
