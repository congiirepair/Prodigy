import { test, expect } from "@playwright/test";
import { capture, expectNoHorizontalOverflow, gotoSeeded, loginRole, PASSWORDS } from "./helpers/qaApp.js";

test.describe("admin live simulations", () => {
  async function openJudgeForActiveEvent(page, role) {
    const roleNumber = role.replace("j", "");
    await page.goto(`/?emulators=0&qaOffline=1&testMode=1#/judge-${roleNumber}`);
    const passwordInput = page.locator("#passwordInput");
    if (await passwordInput.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await passwordInput.fill(PASSWORDS[role]);
      await page.locator("#passwordSubmitBtn").click();
    }
    await expect(page.locator("body")).toHaveAttribute("data-role", role, { timeout: 30_000 });
    await expect(page.locator("#competitionJudgePanel")).toBeVisible({ timeout: 30_000 });
  }

  async function voteBattleWinner(page, role, side = "left") {
    await openJudgeForActiveEvent(page, role);
    const voteButton = page.locator(`[data-action='judge-competition-vote'][data-side='${side}']:visible`).first();
    await expect(voteButton).toBeVisible({ timeout: 20_000 });
    const name = await voteButton.locator("strong").innerText().catch(() => "");
    await voteButton.click();
    if (role !== "j3") {
      await expect(voteButton).toHaveClass(/selected|button-accent/, { timeout: 10_000 });
    }
    return name.trim();
  }

  test("admin can seed qualifying, start/reseed demo data, and open competition", async ({ page }, testInfo) => {
    await gotoSeeded(page, "qualifying", "#/event-admin/registration");
    await expect(page.locator("body")).toHaveAttribute("data-role", "admin");
    await page.locator(".mode-tab[data-target='registration']").click();
    await expect(page.locator("#testModePanelTitle")).toContainText("TEST MODE");
    await expect(page.locator("#startDemoEventBtn")).toBeVisible();
    await page.selectOption("#testScenarioSelect", "bracket");
    await page.locator("#startDemoEventBtn").click();
    await expect(page.getByText(/DEMO Bracket Battle Test|Competition/i).first()).toBeVisible({ timeout: 30_000 });
    await expectNoHorizontalOverflow(page);
    await capture(page, `${testInfo.project.name}-admin-demo-bracket`);
  });

  test("Twin Comp bottom-half finalization exposes next round and podium reveal", async ({ page }, testInfo) => {
    await gotoSeeded(page, "twin-double", "#/event-admin/bracket");
    await expect(page.locator("body")).toHaveAttribute("data-role", "admin");
    await expect(page.getByText(/Twin Comp/i).first()).toBeVisible();

    const roundRows = page.locator("#bracketBoard tbody tr");
    await expect(roundRows.first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#view-bracket")).toContainText(/bottom half/i);
    await expectNoHorizontalOverflow(page);
    await capture(page, `${testInfo.project.name}-admin-twin-double-live`);
  });

  test("role route protection requires judge password before mobile judge access", async ({ page }) => {
    await gotoSeeded(page, "qualifying");
    await page.goto("/?testMode=1#/judge-2");
    await expect(page.locator("#passwordModal")).toBeVisible({ timeout: 20_000 });
    await page.locator("#passwordInput").fill("wrong-password");
    await page.locator("#passwordSubmitBtn").click();
    await expect(page.locator("#passwordError")).toBeVisible();
    await loginRole(page, "j2", "qualifying");
    await expect(page.locator("body")).toHaveAttribute("data-role", "j2");
  });

  test("OMT notice expires once and does not return after rerun driver vote", async ({ page }) => {
    await gotoSeeded(page, "bracket", "#/event-admin/bracket");
    await expect(page.locator("body")).toHaveAttribute("data-role", "admin");
    await expect(page.locator("#view-bracket.is-active")).toBeVisible({ timeout: 30_000 });

    for (const role of ["j1", "j2", "j3"]) {
      await openJudgeForActiveEvent(page, role);
      const omtButton = page.locator("[data-action='judge-competition-vote'][data-side='omt']:visible").first();
      await expect(omtButton).toBeVisible({ timeout: 20_000 });
      await omtButton.click();
      if (role !== "j3") {
        await expect(omtButton).toHaveClass(/selected|button-accent/, { timeout: 10_000 });
      }
    }

    const omtOverlay = page.locator("#competitionOmtOverlay:not(.hidden)");
    await expect(omtOverlay).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#competitionOmtOverlay")).toHaveClass(/hidden/, { timeout: 10_000 });

    const leftVote = page.locator("[data-action='judge-competition-vote'][data-side='left']:visible").first();
    await expect(leftVote).toBeVisible({ timeout: 20_000 });
    await leftVote.click();
    await expect(leftVote).toHaveClass(/selected|button-accent/, { timeout: 10_000 });
    await page.waitForTimeout(1500);
    await expect(page.locator("#competitionOmtOverlay")).toHaveClass(/hidden/);
  });

  test("battle auto-advances after judges choose a winner", async ({ page }) => {
    await gotoSeeded(page, "bracket", "#/event-admin/bracket");
    await expect(page.locator("body")).toHaveAttribute("data-role", "admin");
    await expect(page.locator("#view-bracket.is-active")).toBeVisible({ timeout: 30_000 });

    const firstBattleTitle = await page.locator("#mainBracketCurrentBattle").innerText();
    for (const role of ["j1", "j2", "j3"]) {
      await voteBattleWinner(page, role, "left");
    }

    await page.goto("/?emulators=0&qaOffline=1&testMode=1#/event-admin/bracket");
    await expect(page.locator("body")).toHaveAttribute("data-role", "admin", { timeout: 30_000 });
    await expect(page.locator("#competitionDecisionPanel:not(.hidden)")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#competitionDecisionPanel")).toContainText("Contest?");
    await expect(page.locator("#competitionDecisionPanel")).toHaveClass(/hidden/, { timeout: 40_000 });
    await expect.poll(
      async () => page.locator("#mainBracketCurrentBattle").innerText(),
      { timeout: 10_000 }
    ).not.toBe(firstBattleTitle);
  });

});
