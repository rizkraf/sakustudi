import { expect, test } from "@playwright/test";

import { signInViaApi, uniqueEmail } from "./helpers";

test("a fresh user completes onboarding and lands on the dashboard", async ({
  page,
}) => {
  const email = uniqueEmail("onboard");
  await signInViaApi(page, email, "Onboarding User");

  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByText("Choose a study program")).toBeVisible();

  await page.getByRole("radio", { name: /Sistem Informasi/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/step=2/);
  await page.getByLabel("Term name").fill("Gasal 2026/2027");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/step=3/);
  await expect(
    page.getByText(/Active term: Gasal 2026\/2027/),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: /Bahasa Indonesia/ }).check();
  await page.getByRole("button", { name: "Finish setup" }).click();

  await expect(page).toHaveURL("http://localhost:3000/dashboard");

  await page.goto("/onboarding");
  await expect(page).toHaveURL("http://localhost:3000/dashboard");
});

test("onboarding preserves field errors on the term step", async ({ page }) => {
  const email = uniqueEmail("onboard-errors");
  await signInViaApi(page, email, "Error User");

  await page.goto("/onboarding");
  await page.getByRole("radio", { name: /Sistem Informasi/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Term name").fill("Gasal 2026/2027");
  await page.getByLabel("Start date").fill("2026-09-01");
  await page.getByLabel("End date").fill("2026-08-01");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByText("End date must be after the start date."),
  ).toBeVisible();
  await expect(page).toHaveURL(/step=2/);

  await page.getByLabel("End date").fill("2027-02-28");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/step=3/);
});
