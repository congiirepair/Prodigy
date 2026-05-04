module.exports = {
  ci: {
    collect: {
      startServerCommand: "firebase emulators:start --only hosting,auth,firestore --project prodigy-rc-competitions",
      startServerReadyPattern: "Hosting Emulator logging to",
      startServerReadyTimeout: 120000,
      url: [
        "http://127.0.0.1:5000/?testMode=1&seedTest=qualifying#/spectator",
        "http://127.0.0.1:5000/?testMode=1&seedTest=qualifying#/spectator/live",
        "http://127.0.0.1:5000/?testMode=1&seedTest=bracket#/dashboard",
      ],
      numberOfRuns: 1,
      settings: {
        preset: "desktop",
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
        chromeFlags: "--no-sandbox --disable-dev-shm-usage",
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["warn", { minScore: 0.5 }],
        "categories:accessibility": ["warn", { minScore: 0.75 }],
        "categories:best-practices": ["warn", { minScore: 0.75 }],
        "categories:seo": ["warn", { minScore: 0.75 }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: "qa-artifacts/lighthouse",
    },
  },
};
