import { test, expect } from "@playwright/test";
import {
  capture,
  expectJudgeTouchTargets,
  expectNoHorizontalOverflow,
  fillVisibleScoreInputs,
  gotoSeeded,
  loginRole,
  PASSWORDS,
  setTheme,
  submitJudgeScore,
} from "./helpers/qaApp.js";

test.describe("mobile-only judge workflows", () => {
  test("mobile judge submits qualifying scores and survives refresh", async ({ page }, testInfo) => {
    await gotoSeeded(page, "qualifying");
    await loginRole(page, "j1", "qualifying");
    await setTheme(page, "light");
    await expect(page.locator("body")).toHaveAttribute("data-role", "j1");
    await expect(page.locator("#view-qualifying.is-active")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#mobileDriversList, #driversTable").first()).toBeVisible({ timeout: 30_000 });
    await expectNoHorizontalOverflow(page);
    await expectJudgeTouchTargets(page);

    await fillVisibleScoreInputs(page, "91");
    await submitJudgeScore(page);
    await capture(page, `${testInfo.project.name}-judge-qualifying-submitted-light`);

    await page.goto("/?emulators=0&qaOffline=1&testMode=1#/judge-1");
    await expect(page.locator("body")).toHaveAttribute("data-role", "j1", { timeout: 30_000 });
    await expectNoHorizontalOverflow(page);
  });

  test("mobile judge opens bracket battle and can submit OMT decision", async ({ page }, testInfo) => {
    await gotoSeeded(page, "bracket", "#/event-admin/bracket");
    await loginRole(page, "j1", "bracket");
    await setTheme(page, "dark");
    await expect(page.locator("#view-bracket.is-active")).toBeVisible({ timeout: 30_000 });
    await expectNoHorizontalOverflow(page);
    await expectJudgeTouchTargets(page);

    const scoreInput = page.locator(".competition-stage-score-input:visible").first();
    if (await scoreInput.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await scoreInput.fill("88");
      await page.locator("[data-action='judge-competition-submit-scorecard']:visible").first().click();
    }

    const omtButton = page.locator("[data-action='judge-competition-vote'][data-side='omt']:visible").first();
    if (await omtButton.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await omtButton.click();
      await expect(omtButton).toHaveClass(/selected|button-accent/, { timeout: 10_000 });
    } else {
      await expect(page.locator("#competitionJudgePanel")).toBeVisible();
    }
    await capture(page, `${testInfo.project.name}-judge-bracket-omt-dark`);
  });

  test("mobile judge can score the active lower bracket battle", async ({ page }, testInfo) => {
    await gotoSeeded(page, "qualifying-waiting", "#/event-admin/qualifying");
    await page.locator("#loadSampleBtn").click();
    await page.locator("#bracketModeSelect").evaluate((select) => {
      select.value = "sdc-top-8";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.locator("#openBracketBtn").click();
    await expect(page.locator("#lowerBracketPage.is-active")).toBeVisible({ timeout: 30_000 });

    await page.goto("/?emulators=0&qaOffline=1&testMode=1#/judge-1");
    const passwordInput = page.locator("#passwordInput");
    if (await passwordInput.isVisible({ timeout: 15_000 }).catch(() => false)) {
      await passwordInput.fill(PASSWORDS.j1);
      await page.locator("#passwordSubmitBtn").click();
    }
    await expect(page.locator("body")).toHaveAttribute("data-role", "j1", { timeout: 30_000 });
    await setTheme(page, "dark");
    await expect(page.locator("#view-bracket.is-active")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#lowerBracketPage.is-active")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#competitionJudgePanel")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#competitionJudgePanel")).toContainText(/lower|play-in|battle/i);
    await expectNoHorizontalOverflow(page);
    await expectJudgeTouchTargets(page);

    const lowerState = await page.evaluate(() => {
      const debug = window.__PRODIGY_QA_DEBUG?.() || {};
      const lowerLabel = document.querySelector("#lowerBracketPage .main-board-title")?.textContent?.trim() || "";
      const activePage = document.querySelector("#lowerBracketPage")?.classList.contains("is-active") ? "lower" : "main";
      const visibleVoteButtons = [...document.querySelectorAll("#competitionJudgePanel [data-action='judge-competition-vote']")]
        .filter((button) => {
          const rect = button.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map((button) => button.dataset.side || "");
      const visibleScoreInputs = [...document.querySelectorAll("#competitionJudgePanel .competition-stage-score-input")]
        .filter((input) => {
          const rect = input.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }).length;
      return {
        activePage,
        lowerLabel,
        role: debug.currentRole,
        visibleVoteButtons,
        visibleScoreInputs,
      };
    });

    expect(lowerState.activePage).toBe("lower");
    expect(lowerState.role).toBe("j1");

    if (lowerState.visibleScoreInputs > 0) {
      await fillVisibleScoreInputs(page, "88");
      await submitJudgeScore(page);
    } else {
      expect(lowerState.visibleVoteButtons).toEqual(expect.arrayContaining(["left", "right"]));
      const leftVote = page.locator("[data-action='judge-competition-vote'][data-side='left']:visible").first();
      await leftVote.click();
      await expect(leftVote).toHaveClass(/selected|button-accent/, { timeout: 10_000 });
    }

    await capture(page, `${testInfo.project.name}-judge-lower-bracket-dark`);
  });

  test("mobile judge scores one Twin Comp run in bracket view", async ({ page }, testInfo) => {
    await gotoSeeded(page, "twin", "#/event-admin/bracket");
    await loginRole(page, "j1", "twin");
    await setTheme(page, "dark");
    await expect(page.locator("#view-bracket.is-active")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#competitionJudgePanel:visible, #mobileDriversList:visible").first()).toBeVisible({ timeout: 30_000 });
    await expectNoHorizontalOverflow(page);
    await expectJudgeTouchTargets(page);

    await fillVisibleScoreInputs(page, "93");
    await submitJudgeScore(page);
    await capture(page, `${testInfo.project.name}-judge-twin-run-dark`);
  });
});
