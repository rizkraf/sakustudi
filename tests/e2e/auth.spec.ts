import { expect, test, type Page } from "@playwright/test";

import { mailFor, resetMails, uniqueEmail } from "./helpers";

async function registerUser(page: Page, email: string, name = "E2E User") {
  await page.goto("/register");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("checkbox").nth(0).check();
  await page.getByRole("checkbox").nth(1).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/login\?registered=1/);
}

test.describe("auth flows", () => {
  test.beforeEach(async () => {
    await resetMails();
  });

  test("registers, verifies the email, and reaches the app", async ({ page }) => {
    const email = uniqueEmail("reg");

    await registerUser(page, email);

    await expect(
      page.getByText(/check your email for a verification link/i),
    ).toBeVisible();

    const mail = await mailFor(email, "verification");
    await page.goto(mail.url!);

    await expect(page).toHaveURL("http://localhost:3000/");
    await expect(page.getByText(/SakuStudi/i).first()).toBeVisible();
  });

  test("signs in with verified credentials", async ({ page }) => {
    const email = uniqueEmail("login");

    await registerUser(page, email);
    const mail = await mailFor(email, "verification");
    await page.goto(mail.url!);
    await expect(page).toHaveURL("http://localhost:3000/");

    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL("http://localhost:3000/");
  });

  test("resets the password via email link", async ({ page }) => {
    const email = uniqueEmail("reset");

    await registerUser(page, email);
    const verifyMail = await mailFor(email, "verification");
    await page.goto(verifyMail.url!);
    await expect(page).toHaveURL("http://localhost:3000/");
    await page.context().clearCookies();

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(
      page.getByText(/a reset link is on its way/i),
    ).toBeVisible();

    const resetMail = await mailFor(email, "password_reset");
    await page.goto(resetMail.url!);

    await page.getByLabel("New password").fill("newpassword456");
    await page.getByRole("button", { name: "Reset password" }).click();

    await expect(page).toHaveURL(/\/login\?reset=1/);

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("newpassword456");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL("http://localhost:3000/");
  });

  test("re-consents from the terms page after being blocked", async ({ page }) => {
    const email = uniqueEmail("reconsent");

    // Raw API sign-up (skips the register route) so no consent rows exist.
    await resetMails();
    const signup = await page.request.post("/api/auth/sign-up/email", {
      data: { name: "Re-consent User", email, password: "password123" },
    });
    expect(signup.ok()).toBeTruthy();
    const verifyMail = await mailFor(email, "verification");
    const verifyResponse = await page.request.get(verifyMail.url!);
    expect(verifyResponse.ok()).toBeTruthy();

    await page.goto("/");
    await expect(page).toHaveURL(/\/legal\/terms\?consent=required/);

    await page.getByRole("checkbox").nth(0).check();
    await page.getByRole("checkbox").nth(1).check();
    await page.getByRole("button", { name: "Accept and continue" }).click();

    await expect(page).toHaveURL("http://localhost:3000/");
    await expect(page.getByText(/SakuStudi/i).first()).toBeVisible();
  });
});
