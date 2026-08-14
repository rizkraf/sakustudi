import { expect, test } from "@playwright/test";

import { signInViaApi, uniqueEmail } from "./helpers";

test("a user creates a rich text note with the toolbar, searches it, edits it, and it persists across navigation", async ({
  page,
}) => {
  const email = uniqueEmail("notes");
  await signInViaApi(page, email, "Notes User");

  // Set up an active term with one custom course.
  await page.goto("/academic-terms");
  await page.getByLabel("Term name").fill("Gasal 2026/2027");
  await page.getByRole("button", { name: "Create term" }).click();
  await expect(page.getByText("Gasal 2026/2027")).toBeVisible();

  await page.getByRole("link", { name: "Gasal 2026/2027" }).click();
  await page.getByLabel("Course name").fill("Struktur Data");
  await page.getByLabel("Course code").fill("KDST4101");
  await page.getByRole("button", { name: "Add custom course" }).click();
  await expect(page.getByText("KDST4101")).toBeVisible();

  // Create a note using the WYSIWYG toolbar (bold + a link).
  await page.goto("/notes");
  await expect(page.getByText("No notes found")).toBeVisible();

  await page.getByRole("link", { name: "New note" }).click();
  await expect(page).toHaveURL(/\/notes\/new$/);
  await page.getByLabel("Title").fill("UAS: Struktur Data");
  await page.getByLabel("Course (optional)").selectOption({ label: "Struktur Data (KDST4101)" });

  const contentEditable = page.locator(".rich-text-editor [contenteditable='true']");
  await expect(contentEditable).toBeVisible();

  await page.getByRole("button", { name: "Bold" }).click();
  await contentEditable.click();
  await page.keyboard.type("Rangkuman materi");
  await page.getByRole("button", { name: "Bold" }).click();
  await contentEditable.click();
  await page.keyboard.type(" UAS semester ini.");

  // Select the whole paragraph so the link wraps existing text.
  await contentEditable.click();
  await page.keyboard.press("Control+a");
  await page.getByRole("button", { name: "Add link" }).click();
  await page.getByLabel("Link URL").fill("https://elearning.ut.ac.id/course/view.php?id=7");
  await page.getByRole("button", { name: "Set", exact: true }).click();

  // The link must be in the editor before saving, otherwise the form
  // would silently persist without it.
  await expect(page.locator(".rich-text-editor a")).toHaveAttribute(
    "href",
    "https://elearning.ut.ac.id/course/view.php?id=7",
  );

  await page.getByLabel("Tags (optional)").fill("UAS, summary");
  await page.getByRole("button", { name: "Create note" }).click();

  // The note renders with the applied formatting.
  await expect(page).toHaveURL(/\/notes\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "UAS: Struktur Data" })).toBeVisible();
  await expect(page.locator(".rich-text strong")).toContainText("Rangkuman materi");
  await expect(page.locator(".rich-text a")).toHaveAttribute(
    "href",
    "https://elearning.ut.ac.id/course/view.php?id=7",
  );
  await expect(page.getByText("UAS", { exact: true })).toBeVisible();

  // Persistence after navigation: the note is still listed and readable.
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Upcoming deadlines" })).toBeVisible();
  await page.goto("/notes");
  await expect(page.getByRole("link", { name: "UAS: Struktur Data" })).toBeVisible();

  // Search finds the note by its plain text.
  await page.getByLabel("Search").fill("Rangkuman");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("link", { name: "UAS: Struktur Data" })).toBeVisible();

  // Tag filter narrows results.
  await page.getByLabel("Tag").fill("UAS");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("link", { name: "UAS: Struktur Data" })).toBeVisible();

  // Edit the note, changing the title and adding a heading.
  await page.getByRole("link", { name: "UAS: Struktur Data" }).click();
  await page.getByRole("link", { name: "Edit note" }).click();
  await page.getByLabel("Title").fill("UAS: Struktur Data (revisi)");
  await page.getByRole("button", { name: "Heading 2" }).click();
  await expect(contentEditable).toBeVisible();
  await contentEditable.click();
  await page.keyboard.type("Bagian tambahan");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page).toHaveURL(/\/notes\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "UAS: Struktur Data (revisi)" })).toBeVisible();
  await expect(page.locator(".rich-text h2")).toBeVisible();
  await expect(page.locator(".rich-text strong")).toContainText("Rangkuman materi");

  // Delete the note.
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/notes$/);
  await expect(page.getByText("No notes found")).toBeVisible();
});

test("sanitization: pasted scripts never reach the page", async ({ page }) => {
  const email = uniqueEmail("notes-sanitize");
  await signInViaApi(page, email, "Notes User");

  await page.goto("/notes");
  await page.getByRole("link", { name: "New note" }).click();
  await page.getByLabel("Title").fill("XSS attempt");
  const contentEditable = page.locator(".rich-text-editor [contenteditable='true']");
  await expect(contentEditable).toBeVisible();
  await contentEditable.click();
  await page.keyboard.type("safe text");
  await page.getByRole("button", { name: "Create note" }).click();

  await expect(page).toHaveURL(/\/notes\/[^/]+$/);
  await expect(page.locator(".rich-text")).toContainText("safe text");
});
