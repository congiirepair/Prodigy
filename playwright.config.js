import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.QA_BASE_URL || "http://127.0.0.1:5000";
const webServerCommand = process.env.QA_WEB_SERVER_COMMAND
  || (process.env.QA_USE_FIREBASE_EMULATORS === "1"
    ? "firebase emulators:start --only hosting,auth,firestore --project prodigy-rc-competitions"
    : "node scripts/qa-static-server.mjs 5000");

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./qa-artifacts/playwright-results",
  snapshotDir: "./qa-artifacts/snapshots",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "qa-artifacts/playwright-report", open: "never" }],
    ["json", { outputFile: "qa-artifacts/playwright-results/results.json" }],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  webServer: {
    command: webServerCommand,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } },
    },
    {
      name: "desktop-firefox",
      use: { ...devices["Desktop Firefox"], viewport: { width: 1366, height: 768 } },
    },
    {
      name: "desktop-webkit",
      use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "tablet-chromium",
      use: { ...devices["iPad Pro 11"], viewport: { width: 834, height: 1194 } },
    },
    {
      name: "iphone-judge-webkit",
      testMatch: /judge-mobile|visual|a11y/,
      use: { ...devices["iPhone 14 Pro"] },
    },
    {
      name: "android-judge-chromium",
      testMatch: /judge-mobile|visual|a11y/,
      use: { ...devices["Pixel 7"] },
    },
  ],
});
