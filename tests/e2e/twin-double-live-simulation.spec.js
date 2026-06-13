import { test, expect } from "@playwright/test";
import { gotoSeeded, PASSWORDS } from "./helpers/qaApp.js";

const SCORE_SCHEDULE = [98, 96, 94, 92, 90, 88, 86, 84];

async function fillJudgeScore(page, score) {
  const inputs = page.locator(".score-input:visible");
  await expect(inputs.first()).toBeVisible({ timeout: 20_000 });
  const count = await inputs.count();
  for (let index = 0; index < count; index += 1) {
    const input = inputs.nth(index);
    if (await input.isEnabled().catch(() => false)) {
      await input.fill(String(score));
    }
  }
  const submit = page.locator("[data-action='submit-judge-run']:visible, [data-action='submit-judge-scores']:visible").first();
  await expect(submit).toBeVisible({ timeout: 20_000 });
  await submit.click();
}

async function unlockRole(page, hash, password = null) {
  await page.goto(`/?emulators=0&qaOffline=1&testMode=1${hash}`);
  const passwordInput = page.locator("#passwordInput");
  if (password && await passwordInput.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await passwordInput.fill(password);
    await page.locator("#passwordSubmitBtn").click();
  }
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function readTwinSnapshot(page) {
  return page.evaluate(() => {
    const debug = window.__PRODIGY_QA_DEBUG?.() || {};
    const eventId = debug.activeEventId;
    const raw = eventId ? localStorage.getItem(`rc-drift-event-state-${eventId}-v1`) : null;
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      eventId,
      role: debug.currentRole || document.body.dataset.role || null,
      activeView: document.body.dataset.activeView || null,
      eventName: debug.activeEventMeta?.name || null,
      competitionMode: debug.activeEventMeta?.competitionMode || null,
      twinComp: parsed.twinComp || null,
      drivers: parsed.drivers || [],
      qualifyingFlow: parsed.qualifyingFlow || null,
      adminButtons: Array.from(document.querySelectorAll("#view-bracket [data-action^='twin-']")).map((button) => button.dataset.action),
      bodyText: document.body.innerText,
    };
  });
}

async function refreshAndRead(page) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  return readTwinSnapshot(page);
}

test.describe("Twin Comp Double Elimination live simulation", () => {
  test.describe.configure({ timeout: 300_000 });
  test("seeded live event can be scored through completion with refresh persistence", async ({ browser }) => {
    const context = await browser.newContext();
    const adminPage = await context.newPage();
    const judgePages = await Promise.all([context.newPage(), context.newPage(), context.newPage()]);
    const spectatorPage = await context.newPage();

    for (const page of [adminPage, spectatorPage, ...judgePages]) {
      page.on("dialog", async (dialog) => {
        await dialog.accept();
      });
    }

    await gotoSeeded(adminPage, "twin-double", "#/event-admin/bracket");
    await expect(adminPage.locator("body")).toHaveAttribute("data-role", "admin");
    await expect(adminPage.locator("#view-bracket.is-active")).toBeVisible({ timeout: 30_000 });
    await adminPage.goto("/?emulators=0&qaOffline=1&testMode=1#/event-admin/bracket");
    await adminPage.waitForLoadState("networkidle").catch(() => {});

    let adminState = await readTwinSnapshot(adminPage);
    expect(adminState.eventName).toMatch(/Twin Comp Double/i);
    expect(adminState.competitionMode).toBe("twin-double");
    expect(adminState.bodyText).not.toMatch(/Solo Drivers|Team Tandem/i);

    await unlockRole(spectatorPage, "#/spectator/bracket");
    let spectatorState = await readTwinSnapshot(spectatorPage);
    expect(spectatorState.eventId).toBe(adminState.eventId);
    expect(spectatorState.adminButtons).toEqual([]);

    await unlockRole(judgePages[0], "#/judge-1/bracket", PASSWORDS.j1);
    await unlockRole(judgePages[1], "#/judge-2/bracket", PASSWORDS.j2);
    await unlockRole(judgePages[2], "#/judge-3/bracket", PASSWORDS.j3);
    for (const judgePage of judgePages) {
      await expect(judgePage.locator("body")).toHaveAttribute("data-role", /j[123]/);
      await expect(judgePage.locator("#competitionJudgePanel:visible, #mobileDriversList:visible").first()).toBeVisible({ timeout: 30_000 });
    }

    let completedRoundCount = 0;
    for (let safety = 0; safety < 40; safety += 1) {
      adminState = await refreshAndRead(adminPage);
      const twinComp = adminState.twinComp;
      expect(twinComp).toBeTruthy();

      if (twinComp.status === "complete") {
        break;
      }

      const currentRound = twinComp.rounds.find((round) => round.id === twinComp.currentRoundId) || twinComp.rounds[twinComp.rounds.length - 1];
      expect(currentRound).toBeTruthy();

      if (currentRound.status === "finalized" || ["setup", "round_complete", "review"].includes(twinComp.status)) {
        const startButton = adminPage.locator("[data-action='twin-start-round']:visible").first();
        await expect(startButton).toBeVisible({ timeout: 20_000 });
        await startButton.click();
        continue;
      }

      const teamIds = Array.isArray(currentRound.teamIds) ? currentRound.teamIds : [];
      const scoreIndex = Object.keys(currentRound.scores || {}).length;
      const currentDriverId = adminState.qualifyingFlow?.currentDriverId || currentRound.currentTeamId || teamIds[scoreIndex] || null;
      expect(currentDriverId).toBeTruthy();
      const currentDriver = (adminState.drivers || []).find((entry) => entry.id === currentDriverId);
      expect(currentDriver?.teamName || currentDriver?.name).toBeTruthy();

      const targetScore = SCORE_SCHEDULE[scoreIndex % SCORE_SCHEDULE.length];
      for (const judgePage of judgePages) {
        await judgePage.reload({ waitUntil: "domcontentloaded" });
        await judgePage.waitForLoadState("networkidle").catch(() => {});
        await fillJudgeScore(judgePage, targetScore);
      }

      adminState = await refreshAndRead(adminPage);
      const rescoredRound = adminState.twinComp.rounds.find((round) => round.id === adminState.twinComp.currentRoundId) || adminState.twinComp.rounds[adminState.twinComp.rounds.length - 1];
      expect(rescoredRound.scores[currentDriverId]).toBeTruthy();

      const allScored = teamIds.every((teamId) => Boolean(rescoredRound.scores?.[teamId]));
      if (allScored) {
        const finalizeButton = adminPage.locator("[data-action='twin-finalize-round']:visible").first();
        await expect(finalizeButton).toBeVisible({ timeout: 20_000 });
        await finalizeButton.click();
        completedRoundCount += 1;

        const refreshedAdmin = await refreshAndRead(adminPage);
        const refreshedSpectator = await refreshAndRead(spectatorPage);
        expect(refreshedAdmin.twinComp.rounds.length).toBeGreaterThanOrEqual(completedRoundCount);
        expect(refreshedSpectator.eventId).toBe(adminState.eventId);
        expect(refreshedSpectator.adminButtons).toEqual([]);
      }
    }

    adminState = await refreshAndRead(adminPage);
    expect(adminState.twinComp?.status).toBe("complete");
    expect(adminState.twinComp?.winnerName).toBeTruthy();
    expect(completedRoundCount).toBeGreaterThan(0);

    const finalAdminState = await refreshAndRead(adminPage);
    expect(finalAdminState.twinComp?.winnerName).toBeTruthy();
    await expect(adminPage.locator("#view-bracket")).toContainText(/Final Podium|1st Place/i);
  });
});
