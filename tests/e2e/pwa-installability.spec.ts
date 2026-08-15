import { expect, test } from "@playwright/test";

import { signInViaApi, uniqueEmail } from "./helpers";

test.describe("PWA installability and mobile shell", () => {
  test.use({ viewport: { width: 400, height: 800 } });

  async function bodyBackgroundColor(page: import("@playwright/test").Page) {
    return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  }

  async function bodyTextColor(page: import("@playwright/test").Page) {
    return page.evaluate(() => getComputedStyle(document.body).color);
  }

  async function openAppAsUser(page: import("@playwright/test").Page) {
    await signInViaApi(page, uniqueEmail("pwa"));
    // The root is the public landing; the app shell lives under /dashboard.
    await page.goto("/dashboard");
  }

  test("serves manifest metadata and registers the service worker", async ({ page }) => {
    // The offline-ready prompt fires on the first document load after the
    // service worker installs; sign-in ends on the public landing, so assert
    // here instead of navigating to the shell.
    await signInViaApi(page, uniqueEmail("pwa"));

    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      /manifest\.webmanifest/,
    );
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      "content",
      "#ffce54",
    );

    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            if (!("serviceWorker" in navigator)) return false;
            const registration = await navigator.serviceWorker.getRegistration();
            return Boolean(registration?.installing ?? registration?.waiting ?? registration?.active);
          }),
        { timeout: 15_000 },
      )
      .toBe(true);

    const swResponse = await page.request.get("/sw.js");
    expect(swResponse.ok()).toBe(true);

    await expect(page.getByText("App ready to work offline.")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("shows a bottom nav without horizontal overflow at 400px", async ({ page }) => {
    await openAppAsUser(page);

    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);

    const mobileNav = page.getByRole("navigation", { name: "Primary" });
    await expect(mobileNav).toBeVisible();
    await expect(mobileNav).toHaveCSS("position", "fixed");
    await expect(page.locator("aside")).toBeHidden();

    const link = mobileNav.getByRole("link", { name: "Dashboard" });
    await expect(link).toHaveCSS("min-height", "44px");
    await expect(link).toBeVisible();
  });

  test("applies light and dark semantic tokens", async ({ page }) => {
    await openAppAsUser(page);

    await expect.poll(() => bodyBackgroundColor(page)).toBe("rgb(250, 250, 250)");
    await expect.poll(() => bodyTextColor(page)).toBe("rgb(23, 23, 23)");

    await page.evaluate(() => document.documentElement.classList.add("dark"));

    await expect.poll(() => bodyBackgroundColor(page)).toBe("rgb(21, 21, 21)");
    await expect.poll(() => bodyTextColor(page)).toBe("rgb(252, 252, 252)");
  });
});
