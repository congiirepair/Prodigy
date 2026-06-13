import { test, expect } from "@playwright/test";
import { PASSWORDS } from "./helpers/qaApp.js";

const EMULATOR_URL = "/?emulators=1";

async function unlockWebsiteAdmin(page) {
  await page.addInitScript(() => {
    localStorage.setItem("rc-drift-website-admin-session-v1", "true");
    localStorage.setItem("rc-drift-event-admin-browser-unlock-v1", "true");
  });
}

async function createSoloJudgeSyncEvent(page) {
  const eventName = `Solo Judge Sync Test ${Date.now()}`;
  await page.goto(`${EMULATOR_URL}#/website-admin`);
  await expect(page.locator("body")).toHaveAttribute("data-active-view", "website-admin", { timeout: 30_000 });
  await page.locator("#websiteAdminNewEventBtn").click();
  await expect(page.locator("#createEventModal:not(.hidden)")).toBeVisible({ timeout: 15_000 });
  await page.locator("#eventNameInput").fill(eventName);
  await page.locator("#eventDateInput").fill("2026-06-12");
  await page.selectOption("#competitionModeInput", "solo");
  await page.selectOption("#judgingModeInput", "average");
  await page.selectOption("#judgeCountInput", "1");
  await page.locator("#createEventSubmitBtn").click();
  await expect(page.locator("#createEventModal")).toHaveClass(/hidden/, { timeout: 30_000 });

  const eventMeta = await page.evaluate((name) => {
    const directory = JSON.parse(localStorage.getItem("rc-drift-event-directory-v1") || "{}");
    return Object.values(directory).find((entry) => entry?.name === name) || null;
  }, eventName);
  expect(eventMeta?.id).toBeTruthy();

  await page.goto(`${EMULATOR_URL}#/event-admin/qualifying`);
  await expect(page.locator("body")).toHaveAttribute("data-role", "admin", { timeout: 30_000 });
  await expect(page.locator("#view-qualifying.is-active")).toBeVisible({ timeout: 30_000 });
  page.on("dialog", async (dialog) => {
    if (/populate qualifying scores/i.test(dialog.message())) {
      await dialog.dismiss();
      return;
    }
    await dialog.accept();
  });
  await page.locator("#loadSampleBtn").click();
  await expect.poll(async () => page.locator("#driversTableBody tr").count(), { timeout: 30_000 }).toBeGreaterThan(8);
  await page.locator("#startQualifyingBtn").click();
  await expect(page.locator("#nowQualifyingCard, .qualifying-live-card").first()).toContainText(/now qualifying/i, { timeout: 30_000 });
  await expect(page.locator("#syncStatus")).toContainText(/sync|online/i, { timeout: 30_000 });
  return eventMeta.id;
}

async function unlockJudgeRole(page, eventId) {
  await page.addInitScript((id) => {
    localStorage.setItem("rc-drift-active-event-v1", id);
    localStorage.setItem("rc-drift-event-role-v1", JSON.stringify({ [id]: "j1" }));
    localStorage.setItem("rc-drift-event-role-persist-v1", JSON.stringify({ [id]: "j1" }));
    localStorage.setItem("rc-drift-event-role-unlocks-v1", JSON.stringify({ [id]: { j1: true } }));
  }, eventId);
}

test.describe("solo judge sync", () => {
  test("judge qualifying scores sync across isolated emulator sessions", async ({ browser }) => {
    const adminContext = await browser.newContext();
    const judgeContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const judgePage = await judgeContext.newPage();

    try {
      await unlockWebsiteAdmin(adminPage);
      const eventId = await createSoloJudgeSyncEvent(adminPage);

      await unlockJudgeRole(judgePage, eventId);
      judgePage.on("dialog", async (dialog) => dialog.accept());
      await judgePage.goto(`${EMULATOR_URL}#/judge-1`);
      const passwordInput = judgePage.locator("#passwordInput");
      if (await passwordInput.isVisible({ timeout: 10_000 }).catch(() => false)) {
        await passwordInput.fill(PASSWORDS.j1);
        await judgePage.locator("#passwordSubmitBtn").click();
      }
      if ((await judgePage.locator("body").getAttribute("data-role")) !== "j1") {
        await judgePage.locator("#globalRoleSelect").selectOption("j1");
        if (await passwordInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await passwordInput.fill(PASSWORDS.j1);
          await judgePage.locator("#passwordSubmitBtn").click();
        }
      }
      await expect(judgePage.locator("body")).toHaveAttribute("data-role", "j1", { timeout: 30_000 });
      const passwordModal = judgePage.locator("#passwordModal");
      if (await passwordModal.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await judgePage.locator("#passwordCancelBtn").click().catch(() => {});
      }
      await expect(judgePage.locator("#view-qualifying.is-active")).toBeVisible({ timeout: 30_000 });

      const initialInputCount = await judgePage.locator(".score-input:visible").count();
      if (initialInputCount >= 2 && await judgePage.locator("[data-action='submit-judge-scores']:visible").first().isVisible().catch(() => false)) {
        const scoreInputs = judgePage.locator(".score-input:visible");
        await scoreInputs.nth(0).fill("91");
        await scoreInputs.nth(1).fill("91");
        await judgePage.locator("[data-action='submit-judge-scores']:visible").first().click();
      } else {
        const run1Input = judgePage.locator(".score-input:visible").first();
        await expect(run1Input).toBeVisible({ timeout: 30_000 });
        await run1Input.fill("91");
        await judgePage.getByRole("button", { name: /submit run 1/i }).click();

        const run2Input = judgePage.locator(".score-input:visible").first();
        await expect(run2Input).toBeVisible({ timeout: 30_000 });
        await run2Input.fill("91");
        await judgePage.getByRole("button", { name: /submit run 2/i }).click();
      }

      await expect.poll(async () => {
        const liveCardText = await adminPage.locator("#qualifyingReadyGrid, .qualifying-ready-grid, #view-qualifying").first().textContent();
        return String(liveCardText || "");
      }, { timeout: 30_000 }).toMatch(/judge 1 submitted|91(?:\.0)?/i);
    } finally {
      await adminContext.close();
      await judgeContext.close();
    }
  });
});
