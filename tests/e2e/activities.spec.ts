import { expect, test } from "@playwright/test";

import { signInViaApi, uniqueEmail } from "./helpers";

/** Date-only input value (YYYY-MM-DD) N days from the test run's clock. */
function daysFromNow(days: number): string {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

test("a user creates, edits, completes, reopens, and sees activities on the dashboard", async ({
  page,
}) => {
  const email = uniqueEmail("activities");
  await signInViaApi(page, email, "Activities User");

  // Set up an active term with one custom course.
  await page.goto("/academic-terms");
  await page.getByLabel("Term name").fill("Gasal 2026/2027");
  await page.getByRole("button", { name: "Create term" }).click();
  await expect(page.getByText("Gasal 2026/2027")).toBeVisible();

  await page.getByRole("link", { name: "Gasal 2026/2027" }).click();
  await page.getByLabel("Course name").fill("Struktur Data");
  await page.getByLabel("Course code").fill("KDST4101");
  await page.getByRole("button", { name: "Add custom course" }).click();
  // KDST4101 exists only on the added course (the catalog's "Struktur Data"
  // carries KOMI4201), so this waits for the action to commit and the term
  // page to revalidate before we navigate anywhere.
  await expect(page.getByText("KDST4101")).toBeVisible();

  // Dashboard starts empty: no courses' progress, no upcoming deadlines.
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Upcoming deadlines" })).toBeVisible();
  await expect(
    page.getByText("No upcoming deadlines in the next 7 days."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Struktur Data/ })).toBeVisible();

  // Create an activity with a deadline inside the 7-day window.
  await page.goto("/activities");
  await expect(page.getByText("No activities yet")).toBeVisible();

  await page.getByRole("link", { name: "New activity" }).click();
  await expect(page).toHaveURL(/\/activities\/new$/);
  await page.getByLabel("Title").fill("Tugas 1: struktur");
  await page.getByLabel("Course").selectOption({ label: "Struktur Data (KDST4101)" });
  await page.getByLabel("Deadline").fill(daysFromNow(2));
  await page.getByRole("button", { name: "Create activity" }).click();

  await expect(page).toHaveURL("http://localhost:3000/activities");
  await expect(page.getByRole("link", { name: "Tugas 1: struktur" })).toBeVisible();
  await expect(page.getByText("Not started")).toBeVisible();

  // The dashboard shows the activity as an upcoming deadline.
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Upcoming deadlines" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Tugas 1: struktur" })).toBeVisible();
  await expect(page.getByText("1 course · 1 upcoming · 0 overdue")).toBeVisible();

  // Edit: rename and push the deadline into the past.
  await page.goto("/activities");
  await page.getByRole("link", { name: "Tugas 1: struktur" }).click();
  await page.getByRole("link", { name: "Edit activity" }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await page.getByLabel("Title").fill("Tugas 1: struktur (revisi)");
  await page.getByLabel("Deadline").fill(daysFromNow(-2));
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page).toHaveURL(/\/activities\/[^/]+$/);
  await expect(
    page.getByRole("heading", { name: "Tugas 1: struktur (revisi)" }),
  ).toBeVisible();
  await expect(page.getByText("Overdue", { exact: true })).toBeVisible();

  // The dashboard now lists it as overdue.
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Overdue" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Tugas 1: struktur (revisi)" }),
  ).toBeVisible();

  // Complete and reopen from the detail page.
  await page.goto("/activities");
  await page.getByRole("link", { name: "Tugas 1: struktur (revisi)" }).click();
  await page.getByRole("button", { name: "Mark complete" }).click();
  await expect(page.getByText("Completed")).toBeVisible();

  await page.getByRole("button", { name: "Reopen" }).click();
  // The deadline is in the past, so the derived state is overdue again.
  await expect(page.getByText("Overdue", { exact: true })).toBeVisible();
});
