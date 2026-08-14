import { expect, test } from "@playwright/test";

test.describe("PWA installability and mobile shell", () => {
  test.use({ viewport: { width: 400, height: 800 } });

  async function bodyBackgroundColor(page: import("@playwright/test").Page) {
    return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  }

  async function bodyTextColor(page: import("@playwright/test").Page) {
    return page.evaluate(() => getComputedStyle(document.body).color);
  }

  test("serves manifest metadata and registers the service worker", async ({ page }) => {
    await page.goto("/");

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
    await page.goto("/");

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
    await page.goto("/");

    await expect.poll(() => bodyBackgroundColor(page)).toBe("rgb(250, 250, 250)");
    await expect.poll(() => bodyTextColor(page)).toBe("rgb(23, 23, 23)");

    await page.evaluate(() => document.documentElement.classList.add("dark"));

    await expect.poll(() => bodyBackgroundColor(page)).toBe("rgb(21, 21, 21)");
    await expect.poll(() => bodyTextColor(page)).toBe("rgb(252, 252, 252)");
  });
});
