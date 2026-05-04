import { test, expect } from "@playwright/test";
import { capture, expectNoHorizontalOverflow, gotoSeeded, setTheme } from "./helpers/qaApp.js";

const publicRoutes = [
  ["admin registration", "qualifying", "#/event-admin/registration", "Registration"],
  ["admin qualifying", "qualifying", "#/event-admin/qualifying", "Qualifying Board"],
  ["admin bracket", "bracket", "#/event-admin/bracket", "Competition"],
  ["spectator home", "qualifying", "#/spectator", "Prodigy"],
  ["spectator live", "qualifying", "#/spectator/live", "LIVE"],
  ["spectator results", "qualifying", "#/spectator/results", "Results"],
  ["self registration", "qualifying", "#/spectator/self-register", "Pre-Register"],
  ["streamer dashboard", "bracket", "#/dashboard", "Stream Studio"],
  ["streamer library", "bracket", "#/library", "Package Library"],
  ["streamer demo", "bracket", "#/demo", "Preview Every Scene"],
];

test.describe("route, role, and theme smoke coverage", () => {
  for (const theme of ["light", "dark"]) {
    for (const [name, scenario, hash, expectedText] of publicRoutes) {
      test(`${name} renders without overflow in ${theme} mode`, async ({ page }, testInfo) => {
        await gotoSeeded(page, scenario, hash);
        await setTheme(page, theme);
        await expect(page.locator(".view-section.is-active").getByText(expectedText, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
        await expectNoHorizontalOverflow(page);
        await capture(page, `${testInfo.project.name}-${theme}-${name}`);
      });
    }
  }
});
