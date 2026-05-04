import { test, expect } from "@playwright/test";
import { gotoSeeded, setTheme } from "./helpers/qaApp.js";

async function clickFirstMainBattleWinner(page) {
  return page.evaluate(() => {
    const buttons = [...document.querySelectorAll("#mainBracketPage .slot-button[data-bracket='main']")];
    const groups = new Map();
    for (const button of buttons) {
      const rect = button.getBoundingClientRect();
      if (button.disabled || rect.width <= 0 || rect.height <= 0) continue;
      const key = `${button.dataset.bracket}:${button.dataset.round}:${button.dataset.match}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(button);
    }
    const group = [...groups.values()]
      .filter((entry) => entry.length >= 2)
      .filter((entry) => !entry.some((button) => button.classList.contains("selected") || button.classList.contains("loser")))
      .sort((left, right) => {
        const leftRound = Number.parseInt(left[0].dataset.round || "0", 10);
        const rightRound = Number.parseInt(right[0].dataset.round || "0", 10);
        const leftMatch = Number.parseInt(left[0].dataset.match || "0", 10);
        const rightMatch = Number.parseInt(right[0].dataset.match || "0", 10);
        return leftRound - rightRound || leftMatch - rightMatch;
      })[0];
    const winner = group?.[0] || null;
    if (!winner) return null;
    const name = winner.querySelector(".slot-name")?.textContent?.trim() || "";
    winner.click();
    return name;
  });
}

test.describe("winner reveal presentation", () => {
  for (const theme of ["light", "dark"]) {
    test(`shows winner-first reveal and auto-hides without clearing the result in ${theme} mode`, async ({ page }) => {
      await page.addInitScript(() => {
        const nativeSetTimeout = window.setTimeout.bind(window);
        window.setTimeout = (handler, timeout = 0, ...args) => nativeSetTimeout(handler, timeout === 30_000 ? 900 : timeout, ...args);
      });
      await gotoSeeded(page, "bracket", "#/event-admin/bracket");
      await setTheme(page, theme);

      const winnerName = await clickFirstMainBattleWinner(page);
      expect(winnerName).toBeTruthy();

      const overlay = page.locator("#winnerRevealOverlay");
      await expect(overlay).toBeVisible();
      await expect(overlay.locator(".winner-focus-name")).toContainText(winnerName);
      await expect(overlay.locator(".winner-status-box")).toContainText(/winner result stays saved/i);

      const typeScale = await overlay.evaluate((node) => {
        const name = node.querySelector(".winner-focus-name");
        const status = node.querySelector(".winner-status-box strong");
        return {
          name: Number.parseFloat(window.getComputedStyle(name).fontSize),
          status: Number.parseFloat(window.getComputedStyle(status).fontSize),
        };
      });
      expect(typeScale.name).toBeGreaterThan(typeScale.status * 2);

      await expect(overlay).toBeHidden({ timeout: 3_000 });
      const resultStillSelected = await page.locator("#mainBracketPage .slot-button.selected").count();
      expect(resultStillSelected).toBeGreaterThan(0);
    });
  }
});
