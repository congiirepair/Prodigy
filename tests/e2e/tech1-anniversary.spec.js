import { test, expect } from "@playwright/test";

const tech1Url = "/tech1?emulators=0&qaOffline=1";

test.describe("Tech 1 Drift anniversary mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(tech1Url);
    await expect(page.locator("body")).toHaveAttribute("data-role", "spectator", { timeout: 30_000 });
    await expect(page.locator("body")).toHaveAttribute("data-active-view", "tech1", { timeout: 30_000 });
  });

  test("renders the branded public registration and bracket page without protected controls", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Tech 1 Drift Anniversary Competition" })).toBeVisible();
    await expect(page.getByText("No Qualifying. Randomized Battles.")).toBeVisible();
    await expect(page.locator("#tech1Name")).toBeVisible();
    await expect(page.locator("#tech1TeamName")).toBeVisible();
    await expect(page.locator("#tech1Chassis")).toBeVisible();
    await expect(page.locator("#tech1Instagram")).toBeVisible();
    await expect(page.getByRole("button", { name: "Register And Claim Free Ticket" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Register And Claim Free Ticket" })).toBeDisabled();
    await expect(page.getByText("Offline preview mode. Connect sync before collecting live registrations.")).toBeVisible();
    await expect(page.getByText("Additional raffle tickets are $5 each")).toBeVisible();
    await expect(page.getByText("Public users cannot add paid tickets themselves")).toBeVisible();
    await expect(page.getByText("The randomized battle bracket has not been generated yet.")).toBeVisible();

    await expect(page.locator("#tech1RaffleForm")).toHaveCount(0);
    await expect(page.locator("[data-tech1-action='generate-bracket']")).toHaveCount(0);
    await expect(page.locator(".score-input:visible")).toHaveCount(0);
    await expect(page.locator("#testModePanel")).toBeHidden();
  });

  test("does not mutate the route when using in-page Tech 1 jump buttons", async ({ page }) => {
    await page.getByRole("button", { name: "View Bracket" }).click();
    await expect(page.locator("body")).toHaveAttribute("data-active-view", "tech1");
    await expect(page).toHaveURL(/\/tech1\?emulators=0&qaOffline=1$/);
  });
});
