import { test, expect } from "@playwright/test";
import { gotoSeeded } from "./helpers/qaApp.js";

const BASE_URL = "/?emulators=0&qaOffline=1&testMode=1";

function withWebsiteAdminUnlocked(page) {
  return page.addInitScript(() => {
    localStorage.setItem("rc-drift-website-admin-session-v1", "true");
    localStorage.setItem("rc-drift-event-admin-browser-unlock-v1", "true");
  });
}

async function createSoloEvent(page, { name, date, judgeCount, judgingMode }) {
  await page.goto(`${BASE_URL}#/website-admin`);
  await expect(page.locator("body")).toHaveAttribute("data-active-view", "website-admin", { timeout: 30_000 });
  await page.locator("#websiteAdminNewEventBtn").click();
  await expect(page.locator("#createEventModal:not(.hidden)")).toBeVisible({ timeout: 15_000 });
  await page.locator("#eventNameInput").fill(name);
  await page.locator("#eventDateInput").fill(date);
  await page.selectOption("#competitionModeInput", "solo");
  await page.selectOption("#judgingModeInput", judgingMode);
  await page.selectOption("#judgeCountInput", String(judgeCount)).catch(() => {});
  await page.locator("#createEventSubmitBtn").click();
  await expect.poll(
    async () => page.locator("#createEventModal").evaluate((element) => element.classList.contains("hidden")),
    { timeout: 30_000 },
  ).toBe(true);

  const meta = await page.evaluate((eventName) => {
    const directory = JSON.parse(localStorage.getItem("rc-drift-event-directory-v1") || "{}");
    return Object.values(directory)
      .filter((entry) => entry?.name === eventName)
      .sort((left, right) => String(right?.updatedAt || right?.createdAt || "").localeCompare(String(left?.updatedAt || left?.createdAt || "")))[0] || null;
  }, name);

  expect(meta).toBeTruthy();
  expect(meta.competitionMode).toBe("solo");
  expect(meta.judgingMode).toBe(judgingMode);
  return meta;
}

async function clickNextSoloWinner(page, skippedKeys = []) {
  return page.evaluate((skipped) => {
    const buttons = [...document.querySelectorAll("#mainBracketPage .slot-button[data-bracket='main'], #thirdPlaceBracketPage .slot-button[data-bracket='third']")];
    const groups = new Map();
    for (const button of buttons) {
      const rect = button.getBoundingClientRect();
      if (button.disabled || rect.width <= 0 || rect.height <= 0) continue;
      const key = `${button.dataset.bracket}:${button.dataset.round}:${button.dataset.match}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(button);
    }
    const candidates = [...groups.values()]
      .filter((group) => group.length >= 2)
      .filter((group) => !skipped.includes(`${group[0].dataset.bracket}:${group[0].dataset.round}:${group[0].dataset.match}`))
      .filter((group) => !group.some((button) => button.classList.contains("selected") || button.classList.contains("loser")))
      .sort((left, right) => {
        const leftBracket = left[0].dataset.bracket === "third" ? 1 : 0;
        const rightBracket = right[0].dataset.bracket === "third" ? 1 : 0;
        const leftRound = Number.parseInt(left[0].dataset.round || "0", 10);
        const rightRound = Number.parseInt(right[0].dataset.round || "0", 10);
        const leftMatch = Number.parseInt(left[0].dataset.match || "0", 10);
        const rightMatch = Number.parseInt(right[0].dataset.match || "0", 10);
        return leftRound - rightRound || leftBracket - rightBracket || leftMatch - rightMatch;
      });
    const winner = candidates[0]?.[0] || null;
    if (!winner) return null;
    const key = `${winner.dataset.bracket}:${winner.dataset.round}:${winner.dataset.match}`;
    winner.click();
    return key;
  }, skippedKeys);
}

async function finishSeededSoloBracketToPodium(page) {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const modalVisible = await page.locator("#mainPodiumRevealModal:not(.hidden)").isVisible().catch(() => false);
    if (modalVisible) return;
    const clickedKey = await clickNextSoloWinner(page, []);
    if (!clickedKey) break;
    await page.waitForTimeout(140);
  }
  await page.evaluate(() => {
    const activeEventId = localStorage.getItem("rc-drift-active-event-v1") || "";
    const stateKey = Object.keys(localStorage).find((key) => key.startsWith(`rc-drift-event-state-${activeEventId}-v`));
    if (!stateKey) return;
    const payload = JSON.parse(localStorage.getItem(stateKey) || "{}");
    const bracket = payload?.bracket;
    const finalMatch = bracket?.mainBracket?.rounds?.[bracket.mainBracket.rounds.length - 1]?.matches?.[0] || null;
    const thirdMatch = bracket?.mainBracket?.thirdPlaceMatch || null;
    if (finalMatch?.left && finalMatch?.right && !finalMatch.winner) {
      finalMatch.winner = JSON.parse(JSON.stringify(finalMatch.left));
      finalMatch.winnerMode = "manual";
    }
    if (thirdMatch?.left && thirdMatch?.right && !thirdMatch.winner) {
      thirdMatch.winner = JSON.parse(JSON.stringify(thirdMatch.left));
      thirdMatch.winnerMode = "manual";
    }
    if (bracket?.mainBracket) {
      bracket.mainBracket.podiumReveal = {
        revealed: {},
        updatedAt: new Date().toISOString(),
        updatedBy: "qa",
      };
    }
    localStorage.setItem(stateKey, JSON.stringify(payload));
  });
  await page.reload();
  const modalVisible = await page.locator("#mainPodiumRevealModal:not(.hidden)").isVisible().catch(() => false);
  if (!modalVisible) {
    const reopenButton = page.locator("#championBanner [data-action='main-show-podium-reveal']").first();
    if (await reopenButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await reopenButton.click();
    }
  }
  await expect(page.locator("#mainPodiumRevealModal:not(.hidden)")).toBeVisible({ timeout: 10_000 });
}

test.describe("solo drivers live simulation", () => {
  test("website admin event creation keeps Solo Drivers settings intact", async ({ page }) => {
    await withWebsiteAdminUnlocked(page);

    const averageOneJudge = await createSoloEvent(page, {
      name: "Solo QA Average 1 Judge",
      date: "2026-06-06",
      judgeCount: 1,
      judgingMode: "average",
    });
    expect(Number(averageOneJudge.judgeCount || 0)).toBe(1);

    const averageThreeJudge = await createSoloEvent(page, {
      name: "Solo QA Average 3 Judge",
      date: "2026-06-07",
      judgeCount: 3,
      judgingMode: "average",
    });
    expect(Number(averageThreeJudge.judgeCount || 0)).toBe(3);

    const splitJudging = await createSoloEvent(page, {
      name: "Solo QA Split 3 Category",
      date: "2026-06-08",
      judgeCount: 3,
      judgingMode: "line-angle-style",
    });
    expect(splitJudging.judgingMode).toBe("line-angle-style");
    expect(Number(splitJudging.judgeCount || 0)).toBe(3);
  });

  test("main Solo podium reveal persists to spectator and follows 3rd-2nd-1st order", async ({ page }) => {
    await gotoSeeded(page, "bracket", "#/event-admin/bracket");
    await page.goto(`${BASE_URL}#/event-admin/bracket`);
    await expect(page.locator("body")).toHaveAttribute("data-role", "admin");

    await finishSeededSoloBracketToPodium(page);

    const revealButtons = page.locator("#mainPodiumRevealStage .podium-reveal-button");
    await expect(revealButtons).toHaveCount(3);
    await expect(revealButtons.nth(0)).toContainText("3rd Place");
    await expect(revealButtons.nth(1)).toContainText("2nd Place");
    await expect(revealButtons.nth(2)).toContainText("1st Place");
    await expect(revealButtons.nth(0)).toBeEnabled();
    await expect(revealButtons.nth(1)).toBeDisabled();
    await expect(revealButtons.nth(2)).toBeDisabled();

    const spectatorPage = await page.context().newPage();
    await spectatorPage.goto(`${BASE_URL}#/spectator/bracket`);
    await expect(spectatorPage.locator("body")).toHaveAttribute("data-role", "spectator", { timeout: 30_000 });
    await expect(spectatorPage.locator("#mainPodiumRevealModal:not(.hidden)")).toBeVisible({ timeout: 10_000 });
    await expect(spectatorPage.locator("#mainPodiumRevealStage .podium-reveal-button").nth(0)).toContainText(/Waiting For Live Reveal/i);

    await revealButtons.nth(0).click();
    await expect(revealButtons.nth(1)).toBeEnabled();
    await expect(revealButtons.nth(2)).toBeDisabled();

    await spectatorPage.reload();
    await expect(spectatorPage.locator("#mainPodiumRevealModal:not(.hidden)")).toBeVisible({ timeout: 10_000 });
    await expect(spectatorPage.locator("#mainPodiumRevealStage .podium-reveal-button").nth(0)).toContainText(/#/i);
    await expect(spectatorPage.locator("#mainPodiumRevealStage .podium-reveal-button").nth(1)).toContainText(/Waiting For Live Reveal/i);

    await revealButtons.nth(1).click();
    await expect(revealButtons.nth(2)).toBeEnabled();

    await spectatorPage.reload();
    await expect(spectatorPage.locator("#mainPodiumRevealModal:not(.hidden)")).toBeVisible({ timeout: 10_000 });
    await expect(spectatorPage.locator("#mainPodiumRevealStage .podium-reveal-button").nth(1)).toContainText(/#/i);
    await expect(spectatorPage.locator("#mainPodiumRevealStage .podium-reveal-button").nth(2)).toContainText(/Waiting For Live Reveal/i);

    await revealButtons.nth(2).click();
    await spectatorPage.reload();
    await expect(spectatorPage.locator("#mainPodiumRevealModal:not(.hidden)")).toBeVisible({ timeout: 10_000 });
    await expect(spectatorPage.locator("#mainPodiumRevealStage .podium-reveal-button").nth(2)).toContainText(/#/i);
  });
});
