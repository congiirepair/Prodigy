import { chromium } from "@playwright/test";

const scenarios = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["qualifying"];
const baseUrl = process.env.QA_BASE_URL || process.env.PRODIGY_LOCAL_URL || "http://127.0.0.1:5000";
const validScenarios = new Set(["qualifying", "bracket", "twin", "twin-double"]);

const browser = await chromium.launch();
const page = await browser.newPage();

for (const rawScenario of scenarios) {
  const scenario = validScenarios.has(rawScenario) ? rawScenario : "qualifying";
  const url = new URL(baseUrl);
  url.searchParams.set("testMode", "1");
  url.searchParams.set("seedTest", scenario);
  url.hash = "#/event-admin/registration";
  console.log(`Seeding isolated test scenario: ${scenario}`);
  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
  await page.waitForSelector("body[data-test-mode='true']", { timeout: 30_000 });
  await page.waitForSelector("#testModePanel:not(.hidden)", { timeout: 30_000 });
  await page.waitForFunction(() => {
    const stateText = document.querySelector("#testDebugPanel")?.textContent || "";
    return document.body.dataset.role === "admin" && document.querySelector("#eventSelect")?.textContent?.includes("DEMO");
  }, null, { timeout: 30_000 }).catch(() => {});
}

await browser.close();
console.log("QA test data seed complete. Data stayed in Test Mode / emulator scope.");
