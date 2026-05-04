import { test, expect } from "@playwright/test";
import { capture, gotoSeeded } from "./helpers/qaApp.js";

test.describe("fullscreen podium reveal", () => {
  test("command-center fullscreen button opens the bracket presentation", async ({ page }) => {
    await gotoSeeded(page, "bracket", "#/spectator/live");
    const fullscreenButton = page.locator("#raceControlDashboard .race-battle-panel .race-mini-btn", { hasText: "Full Screen" });
    await expect(fullscreenButton).toBeVisible({ timeout: 30_000 });

    await fullscreenButton.click();
    await expect(page.locator("#view-bracket.is-active")).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(() => page.evaluate(() => document.fullscreenElement?.id || (document.body.classList.contains("bracket-fullscreen") ? "fallback" : "")))
      .toMatch(/^(view-bracket|fallback)$/);

    const presentationState = await page.evaluate(() => {
      const activePage = document.querySelector(".competition-bracket-page.is-active");
      const board = activePage?.querySelector(".main-bracket-board");
      const current = activePage?.querySelector(".bracket-flow-slot.left");
      const next = activePage?.querySelector(".bracket-flow-slot.right");
      const dashboard = document.querySelector("#raceControlDashboardBracket");
      const rectOf = (element) => {
        const rect = element?.getBoundingClientRect();
        return {
          width: rect?.width || 0,
          height: rect?.height || 0,
        };
      };
      return {
        activePageVisible: Boolean(activePage && rectOf(activePage).width > 0 && rectOf(activePage).height > 0),
        boardVisible: Boolean(board && rectOf(board).width > 0 && rectOf(board).height > 0),
        currentVisible: Boolean(current && rectOf(current).width > 0 && rectOf(current).height > 0),
        nextVisible: Boolean(next && rectOf(next).width > 0 && rectOf(next).height > 0),
        inlineDashboardHidden: Boolean(dashboard && getComputedStyle(dashboard).display === "none"),
      };
    });
    expect(presentationState).toMatchObject({
      activePageVisible: true,
      boardVisible: true,
      currentVisible: true,
      nextVisible: true,
      inlineDashboardHidden: true,
    });
  });

  test("spectator bracket presentation has its own fullscreen button", async ({ page }) => {
    await gotoSeeded(page, "bracket", "#/spectator/live");
    await page.locator("#raceControlDashboard .race-nav-item[data-landing-jump='bracket']").click();
    await expect(page.locator("#view-bracket.is-active")).toBeVisible({ timeout: 30_000 });
    const presentationButton = page.locator("#presentationFullscreenBracketBtn");
    await expect(presentationButton).toBeVisible({ timeout: 30_000 });

    await presentationButton.click();
    await expect
      .poll(() => page.evaluate(() => document.fullscreenElement?.id || (document.body.classList.contains("bracket-fullscreen") ? "fallback" : "")))
      .toMatch(/^(view-bracket|fallback)$/);
    await expect(presentationButton).toHaveText(/Exit Fullscreen/i);
  });

  test("hosts the trophy reveal modal inside the fullscreen bracket", async ({ page }) => {
    await gotoSeeded(page, "bracket", "#/event-admin/bracket");

    await page.locator("#inlineFullscreenBracketBtn").click();
    await expect
      .poll(() => page.evaluate(() => document.fullscreenElement?.id || ""))
      .toBe("view-bracket");

    const clickedProtectedKeys = [];
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const isOpen = await page.locator("#mainPodiumRevealModal:not(.hidden)").isVisible().catch(() => false);
      if (isOpen) break;

      const clicked = await page.evaluate((skippedKeys) => {
        const buttons = [...document.querySelectorAll("#mainBracketPage .slot-button[data-bracket]")];
        const groups = new Map();
        for (const button of buttons) {
          const rect = button.getBoundingClientRect();
          if (button.disabled || rect.width <= 0 || rect.height <= 0) continue;
          const key = [
            button.dataset.bracket,
            button.dataset.round,
            button.dataset.match,
          ].join(":");
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(button);
        }
        const candidates = [...groups.values()]
          .filter((group) => group.length >= 2)
          .filter((group) => !skippedKeys.includes([
            group[0].dataset.bracket,
            group[0].dataset.round,
            group[0].dataset.match,
          ].join(":")))
          .filter((group) => !group.some((button) => button.classList.contains("selected") || button.classList.contains("loser")))
          .sort((a, b) => {
            const aBracket = a[0].dataset.bracket === "third" ? 1 : 0;
            const bBracket = b[0].dataset.bracket === "third" ? 1 : 0;
            const aRound = Number.parseInt(a[0].dataset.round || "0", 10);
            const bRound = Number.parseInt(b[0].dataset.round || "0", 10);
            const aMatch = Number.parseInt(a[0].dataset.match || "0", 10);
            const bMatch = Number.parseInt(b[0].dataset.match || "0", 10);
            return aRound - bRound || aBracket - bBracket || aMatch - bMatch;
        });
        const next = candidates[0]?.[0] || null;
        if (!next) return null;
        const key = [next.dataset.bracket, next.dataset.round, next.dataset.match].join(":");
        next.click();
        return key;
      }, clickedProtectedKeys);

      expect(clicked).toBeTruthy();
      if (clicked?.startsWith("third:") || clicked?.startsWith("main:3:")) {
        clickedProtectedKeys.push(clicked);
      }
      await page.waitForTimeout(140);
    }

    const modalState = await page.locator("#mainPodiumRevealModal").evaluate((modal) => {
      const rect = modal.getBoundingClientRect();
      return {
        parentId: modal.parentElement?.id || "",
        fullscreenId: document.fullscreenElement?.id || "",
        fullscreenContainsModal: Boolean(document.fullscreenElement?.contains(modal)),
        visible: !modal.classList.contains("hidden") && rect.width > 0 && rect.height > 0,
      }
    });

    expect(modalState).toMatchObject({
      parentId: "view-bracket",
      fullscreenId: "view-bracket",
      fullscreenContainsModal: true,
      visible: true,
    });
  });

  test("lower bracket fullscreen header does not overlap rule banner", async ({ page }, testInfo) => {
    await gotoSeeded(page, "qualifying-waiting", "#/event-admin/qualifying");
    await page.locator("#loadSampleBtn").click();
    await page.locator("#bracketModeSelect").evaluate((select) => {
      select.value = "sdc-top-8";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.locator("#openBracketBtn").click();
    await expect(page.locator("#lowerBracketPage.is-active")).toBeVisible({ timeout: 30_000 });

    await page.locator("#inlineFullscreenBracketBtn").click();
    await expect
      .poll(() => page.evaluate(() => document.fullscreenElement?.id || ""))
      .toBe("view-bracket");

    const spacing = await page.evaluate(() => {
      const title = document.querySelector("#lowerBracketPage .main-board-title");
      const banner = document.querySelector("#lowerBracketRuleAlert");
      const titleRect = title?.getBoundingClientRect();
      const bannerRect = banner?.getBoundingClientRect();
      return {
        titleBottom: titleRect?.bottom || 0,
        bannerTop: bannerRect?.top || 0,
        bannerHidden: banner?.classList.contains("hidden") || false,
      };
    });

    expect(spacing.bannerHidden).toBe(false);
    expect(spacing.bannerTop).toBeGreaterThanOrEqual(spacing.titleBottom + 4);
    await capture(page, `${testInfo.project.name}-lower-bracket-fullscreen-header`);
  });
});
