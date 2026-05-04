import { test, expect } from "@playwright/test";
import { gotoSeeded } from "./helpers/qaApp.js";

test.describe("qualifying order randomization", () => {
  test("keeps signed-up Reg # values with each driver after randomizing", async ({ page }) => {
    await gotoSeeded(page, "qualifying-waiting", "#/event-admin/qualifying");

    const before = await page.locator("#driversTableBody tr").evaluateAll((rows) => rows.map((row) => ({
      order: row.querySelector(".row-index")?.textContent?.trim() || "",
      reg: row.querySelector(".td-reg")?.textContent?.trim() || "",
      name: row.querySelector(".driver-meta strong")?.textContent?.trim() || "",
    })).filter((row) => row.name));
    expect(before.length).toBeGreaterThan(1);

    const beforeByName = new Map(before.map((row) => [row.name, row.reg]));

    await page.locator("#randomizeQualifyingBtn").click();

    await expect.poll(async () => page.locator("#driversTableBody tr").evaluateAll((rows) => rows.map((row) => ({
      order: row.querySelector(".row-index")?.textContent?.trim() || "",
      reg: row.querySelector(".td-reg")?.textContent?.trim() || "",
      name: row.querySelector(".driver-meta strong")?.textContent?.trim() || "",
    })).filter((row) => row.name)), { timeout: 15_000 }).not.toEqual(before);

    const randomized = await page.locator("#driversTableBody tr").evaluateAll((rows) => rows.map((row) => ({
      order: row.querySelector(".row-index")?.textContent?.trim() || "",
      reg: row.querySelector(".td-reg")?.textContent?.trim() || "",
      name: row.querySelector(".driver-meta strong")?.textContent?.trim() || "",
    })).filter((row) => row.name));

    expect(randomized.map((row) => row.name)).not.toEqual(before.map((row) => row.name));
    for (const row of randomized) {
      expect(row.reg).toBe(beforeByName.get(row.name));
    }
    expect(randomized.some((row) => row.order !== row.reg)).toBe(true);

    await page.locator("#randomizeQualifyingBtn").click();
    const randomizedAgain = await page.locator("#driversTableBody tr").evaluateAll((rows) => rows.map((row) => ({
      order: row.querySelector(".row-index")?.textContent?.trim() || "",
      reg: row.querySelector(".td-reg")?.textContent?.trim() || "",
      name: row.querySelector(".driver-meta strong")?.textContent?.trim() || "",
    })).filter((row) => row.name));

    for (const row of randomizedAgain) {
      expect(row.reg).toBe(beforeByName.get(row.name));
    }

    await page.evaluate(() => {
      const url = new URL(window.location.href);
      url.searchParams.delete("seedTest");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    });
    await page.reload();
    await expect(page.locator("body")).toHaveAttribute("data-test-mode", "true", { timeout: 30_000 });
    const afterReload = await page.locator("#driversTableBody tr").evaluateAll((rows) => rows.map((row) => ({
      order: row.querySelector(".row-index")?.textContent?.trim() || "",
      reg: row.querySelector(".td-reg")?.textContent?.trim() || "",
      name: row.querySelector(".driver-meta strong")?.textContent?.trim() || "",
    })).filter((row) => row.name));

    for (const row of afterReload) {
      expect(row.reg).toBe(beforeByName.get(row.name));
    }
    expect(afterReload.some((row) => row.order !== row.reg)).toBe(true);
  });
});
