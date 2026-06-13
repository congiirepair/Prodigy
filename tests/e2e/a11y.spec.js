import { test } from "@playwright/test";
import { gotoSeeded, loginRole, runAxe, setTheme } from "./helpers/qaApp.js";

const pages = [
  ["admin registration", "qualifying", "#/event-admin/registration"],
  ["admin bracket", "bracket", "#/event-admin/bracket"],
  ["spectator live", "qualifying", "#/spectator/live"],
  ["streamer dashboard", "bracket", "#/dashboard"],
];

test.describe("axe accessibility coverage", () => {
  for (const theme of ["light", "dark"]) {
    for (const [name, scenario, hash] of pages) {
      test(`${name} has no critical automated axe violations in ${theme}`, async ({ page }, testInfo) => {
        await gotoSeeded(page, scenario, hash);
        await setTheme(page, theme);
        await runAxe(page, `${testInfo.project.name}-${theme}-${name}`);
      });
    }
  }

  test("mobile judge qualifying page has no automated axe violations", async ({ page }, testInfo) => {
    await gotoSeeded(page, "qualifying");
    await loginRole(page, "j1", "qualifying");
    await setTheme(page, "dark");
    await runAxe(page, `${testInfo.project.name}-judge-mobile-dark`);
  });
});
