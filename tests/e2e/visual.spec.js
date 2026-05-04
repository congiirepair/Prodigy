import { test, expect } from "@playwright/test";
import { capture, expectNoHorizontalOverflow, gotoSeeded, loginRole, setTheme } from "./helpers/qaApp.js";

const visualMatrix = [
  ["admin-registration", "qualifying", "#/event-admin/registration"],
  ["admin-bracket", "bracket", "#/event-admin/bracket"],
  ["spectator-live", "qualifying", "#/spectator/live"],
  ["spectator-results", "qualifying", "#/spectator/results"],
  ["streamer-dashboard", "bracket", "#/dashboard"],
  ["streamer-scene-battle", "bracket", "#/scene/battle"],
  ["self-register", "qualifying", "#/spectator/self-register"],
];

test.describe("visual screenshot artifact coverage", () => {
  for (const theme of ["light", "dark"]) {
    for (const [name, scenario, hash] of visualMatrix) {
      test(`${name} screenshot in ${theme}`, async ({ page }, testInfo) => {
        await gotoSeeded(page, scenario, hash);
        await setTheme(page, theme);
        await expect(page.locator(".view-section.is-active").first()).toBeVisible({ timeout: 20_000 });
        await expectNoHorizontalOverflow(page);
        await capture(page, `${testInfo.project.name}-${name}-${theme}`);
      });
    }
  }

  for (const theme of ["light", "dark"]) {
    test(`mobile judge screenshot matrix ${theme}`, async ({ page }, testInfo) => {
      await gotoSeeded(page, "twin", "#/event-admin/bracket");
      await loginRole(page, "j1", "twin");
      await setTheme(page, theme);
      await expect(page.locator("#view-bracket.is-active")).toBeVisible({ timeout: 30_000 });
      await expectNoHorizontalOverflow(page);
      await capture(page, `${testInfo.project.name}-mobile-judge-twin-${theme}`);
    });
  }
});
