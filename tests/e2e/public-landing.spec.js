import { test, expect } from "@playwright/test";

const publicBootUrl = "/?emulators=0&qaOffline=1";

test.describe("public landing audience separation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(publicBootUrl);
    await expect(page.locator("body")).toHaveAttribute("data-role", "spectator", { timeout: 30_000 });
    await expect(page.locator("body")).toHaveAttribute("data-active-view", "home", { timeout: 30_000 });
  });

  test("root shows product homepage without internal controls", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Run RC drift competitions from registration to podium." })).toBeVisible();
    await expect(page.getByRole("button", { name: "View Live Event" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Register Driver" }).first()).toBeVisible();

    await expect(page.locator(".role-switcher")).toBeHidden();
    await expect(page.locator("#websiteAdminBtn")).toBeHidden();
    await expect(page.locator("#testModePanel")).toBeHidden();
    await expect(page.locator(".score-input:visible")).toHaveCount(0);
    await expect(page.locator("#view-home")).not.toContainText("0 Drivers");
    await expect(page.locator("#view-home")).not.toContainText("Date TBD");
  });

  test("internal routes are marked noindex", async ({ page }) => {
    await page.goto("/admin?emulators=0&qaOffline=1");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  });

  test("privacy route renders public notice", async ({ page }) => {
    await page.goto("/privacy?emulators=0&qaOffline=1");
    await expect(page.getByRole("heading", { name: "Privacy Notice" })).toBeVisible();
    await expect(page.locator("body")).toHaveAttribute("data-active-view", "privacy");
  });

  test("spectator bracket and live views keep navigation clickable outside fullscreen", async ({ page }) => {
    await page.locator('.mode-tab[data-target="bracket"]').click();
    await expect(page.locator("body")).toHaveAttribute("data-active-view", "bracket");
    await expect(page.locator(".main-topbar")).toBeVisible();
    await expect(page.locator('.mode-tab[data-target="results"]')).toBeVisible();
    await page.locator('.mode-tab[data-target="results"]').click();
    await expect(page.locator("body")).toHaveAttribute("data-active-view", "results");

    await page.locator('.mode-tab[data-target="live"]').click();
    await expect(page.locator("body")).toHaveAttribute("data-active-view", "live");
    await expect(page.locator(".main-topbar")).toBeVisible();
    await page.locator('.mode-tab[data-target="home"]').click();
    await expect(page.locator("body")).toHaveAttribute("data-active-view", "home");
  });
});
