import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

export const PASSWORDS = {
  admin: "@" + "CBo" + "28087021",
  j1: "changeme-j1",
  j2: "changeme-j2",
  j3: "changeme-j3",
};

export const scenarios = ["qualifying", "bracket", "twin", "twin-double"];

export function testUrl(path = "/", scenario = "qualifying", hash = "#/event-admin/registration") {
  const url = new URL(path, "http://127.0.0.1:5000");
  const routeRoot = String(hash || "").replace(/^#\/?/, "").split("/").filter(Boolean)[0] || "";
  if (["dashboard", "library", "demo", "scene", "overlay"].includes(routeRoot)) {
    url.searchParams.set("streamer", "1");
  }
  url.searchParams.set("emulators", process.env.QA_USE_FIREBASE_EMULATORS === "1" ? "1" : "0");
  if (process.env.QA_USE_FIREBASE_EMULATORS !== "1") {
    url.searchParams.set("qaOffline", "1");
  }
  url.searchParams.set("testMode", "1");
  url.searchParams.set("seedTest", scenario);
  url.hash = hash;
  return `${url.pathname}${url.search}${url.hash}`;
}

export async function gotoSeeded(page, scenario = "qualifying", hash = "#/event-admin/registration") {
  await page.goto(testUrl("/", scenario, hash));
  await expect(page.locator("body")).toHaveAttribute("data-test-mode", "true", { timeout: 30_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await expect(page.locator("#topbarLifecyclePill")).toContainText(/TEST MODE/i, { timeout: 30_000 });
  await dismissDialogs(page);
}

export async function dismissDialogs(page) {
  page.on("dialog", async (dialog) => {
    if (/reset|finalize|apply|continue|confirm/i.test(dialog.message())) await dialog.accept();
    else await dialog.accept();
  });
}

export async function loginRole(page, role = "j1", scenario = "qualifying") {
  const roleHash = role === "admin" ? "#/event-admin" : role === "j1" ? "#/judge-1" : role === "j2" ? "#/judge-2" : "#/judge-3";
  await page.evaluate(() => {
    for (const storage of [window.localStorage, window.sessionStorage]) {
      for (const key of Object.keys(storage)) {
        if (key.startsWith("rc-drift-event-role")) storage.removeItem(key);
      }
    }
  }).catch(() => {});
  await page.goto(testUrl("/", scenario, roleHash));
  await expect(page.locator("body")).toHaveAttribute("data-test-mode", "true", { timeout: 30_000 });
  const passwordInput = page.locator("#passwordInput");
  if (await passwordInput.isVisible({ timeout: 15_000 }).catch(() => false)) {
    await passwordInput.fill(PASSWORDS[role]);
    await page.locator("#passwordSubmitBtn").click();
  }
  await expect(page.locator("body")).toHaveAttribute("data-role", role, { timeout: 30_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
}

export async function setTheme(page, theme = "light") {
  await page.evaluate((nextTheme) => {
    document.body.dataset.theme = nextTheme;
    try {
      localStorage.setItem("rc-drift-theme-v7", nextTheme);
    } catch (error) {}
  }, theme);
}

export async function capture(page, name) {
  const clean = name.replace(/[^a-z0-9_.-]+/gi, "-").toLowerCase();
  const screenshotMetrics = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    width: document.documentElement.scrollWidth,
    scale: window.devicePixelRatio || 1,
  }));
  const maxBitmapSide = Math.max(screenshotMetrics.height, screenshotMetrics.width) * screenshotMetrics.scale;
  await page.screenshot({
    path: `qa-artifacts/screenshots/${clean}.png`,
    fullPage: maxBitmapSide <= 32767,
  });
}

export async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
  }));
  expect(Math.max(overflow.scrollWidth - overflow.clientWidth, overflow.bodyScrollWidth - overflow.bodyClientWidth)).toBeLessThanOrEqual(4);
}

export async function expectJudgeTouchTargets(page) {
  const smallTargets = await page.locator(
    "body[data-role^='j'] button:visible, body[data-role^='j'] input:visible, body[data-role^='j'] select:visible"
  ).evaluateAll((elements) => elements
    .map((element) => {
      const rect = element.getBoundingClientRect();
      const label = element.getAttribute("aria-label") || element.textContent || element.placeholder || element.tagName;
      return { width: rect.width, height: rect.height, label: label.trim().slice(0, 80) };
    })
    .filter((item) => item.width > 0 && item.height > 0 && (item.width < 40 || item.height < 40)));
  expect(smallTargets, `Small judge touch targets: ${JSON.stringify(smallTargets, null, 2)}`).toEqual([]);
}

export async function runAxe(page, name) {
  const results = await new AxeBuilder({ page }).analyze();
  await page.evaluate(({ key, value }) => {
    window.__qaA11y = window.__qaA11y || {};
    window.__qaA11y[key] = value;
  }, { key: name, value: results.violations });
  expect(results.violations, `${name} axe violations`).toEqual([]);
}

export async function fillVisibleScoreInputs(page, value = "91") {
  const scoreInputs = page.locator(".score-input:visible");
  const count = await scoreInputs.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < Math.min(count, 2); index += 1) {
    const input = scoreInputs.nth(index);
    if (await input.isEnabled().catch(() => false)) {
      await input.fill(value);
    }
  }
}

export async function submitJudgeScore(page) {
  const submit = page.locator("[data-action='submit-judge-run']:visible, [data-action='submit-judge-scores']:visible").first();
  await expect(submit).toBeVisible({ timeout: 20_000 });
  await submit.click();
  await submit.click({ trial: true }).catch(() => {});
}
