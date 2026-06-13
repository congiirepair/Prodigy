import { test, expect } from "@playwright/test";
import { gotoSeeded } from "./helpers/qaApp.js";

test.describe("solo qualifying to bracket", () => {
  test("loading a scored sample roster launches a bracket with visible driver names", async ({ page }) => {
    await gotoSeeded(page, "qualifying-waiting", "#/event-admin/qualifying");
    await expect(page.locator("body")).toHaveAttribute("data-role", "admin");

    await page.locator("#loadSampleBtn").click();
    await expect.poll(async () => {
      return page.locator("#driversTableBody tr").count();
    }, { timeout: 15_000 }).toBeGreaterThan(8);

    await page.locator("#openBracketBtn").click();
    await expect(page.locator("#view-bracket.is-active")).toBeVisible({ timeout: 30_000 });

    const visibleBracketNames = await page.evaluate(() => {
      return [...document.querySelectorAll("#mainBracketPage.is-active .slot-button .slot-name, #lowerBracketPage.is-active .slot-button .slot-name")]
        .map((node) => node.textContent?.trim() || "")
        .filter((text) => text && !/waiting|bye|open slot|winner of|pending/i.test(text));
    });

    expect(visibleBracketNames.length).toBeGreaterThan(3);
    expect(visibleBracketNames.some((name) => /alex|jordan|mason|shawn|owen/i.test(name))).toBe(true);
  });
});
