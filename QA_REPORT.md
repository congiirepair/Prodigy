# QA Report

Date: 2026-05-02  
App: Prodigy Event Control  
QA scope: automated QA harness, seeded demo/test mode, mobile judge flows, admin/role smoke coverage, visual screenshots, accessibility checks.

## Summary

I added a repeatable automated QA system around the existing Firebase Test Mode. The suite uses Firebase Hosting/Auth/Firestore emulators on localhost and always drives the app with `?testMode=1`, so QA data stays isolated from production.

The highest-priority mobile judge workflows now have automated coverage on iPhone/WebKit and Android/Chromium projects.

## Repo / Architecture Discovered

- Framework: static single-page app, no build framework.
- Main UI: `index.html`.
- Runtime config: `client-config.js`.
- Package manager: npm.
- Routing: hash routes plus host/subdomain detection.
- Backend/storage: Firebase Auth anonymous sign-in, Firestore state documents.
- Production data scope: `artifacts/{appId}/public/data`.
- Test data scope: `artifacts/{appId}/public/testData`.
- Local safe backend: Firebase Auth and Firestore emulators.
- Functions: Firebase Functions v2, `functions/index.js`, voice parsing endpoint.
- Deployment: Firebase Hosting and Functions via `firebase.json`.

## Routes / Pages Discovered

- `#/spectator`
- `#/spectator/live`
- `#/spectator/results`
- `#/spectator/self-register`
- `#/event-admin/registration`
- `#/event-admin/qualifying`
- `#/event-admin/bracket`
- `#/judge-1`
- `#/judge-2`
- `#/judge-3`
- `#/website-admin`
- `#/dashboard`
- `#/library`
- `#/demo`
- `#/scene/{scene}`
- `#/overlay/{scene}`

## Roles Discovered

- Spectator
- Event admin
- Website admin
- Judge 1
- Judge 2
- Judge 3
- Streamer / OBS route user

## Modes Discovered

- Production mode
- Test Mode using isolated `testData`
- Standalone demo window mode
- Streamer demo mode
- Light theme
- Dark theme

## Competition / Judging Modes Discovered

- Solo qualifying
- Solo bracket battles
- OMT / One More Time battle voting
- Team Tandem bracket
- Twin Comp Triple Elimination
- Twin Comp Double Elimination
- Average score judging
- Line / Angle / Style judging

## Test Data Added / Used

Existing demo seed functions were reused and extended through automation. Scenarios:

- `qualifying`: 16-driver live qualifying event.
- `bracket`: 16-driver bracket with partial battle progress.
- `twin`: 8-team Twin Comp triple-elimination event.
- `twin-double`: 8-team Twin Comp double-elimination event.
- Completed reference event in test archive.

Seed/reset commands:

```powershell
npm run seed:test
npm run reset:test
```

## Commands Added

```powershell
npm run test:unit
npm run test:e2e
npm run test:mobile
npm run test:judge-mobile
npm run test:visual
npm run test:a11y
npm run test:lighthouse
npm run qa:all
npm run seed:test
npm run reset:test
npm run test:url:twin-double
```

## Tests Created

- `tests/e2e/judge-mobile.spec.js`
  - Mobile judge qualifying scoring.
  - Mobile judge refresh/reopen via direct judge phone link.
  - Mobile bracket battle / OMT decision.
  - Mobile Twin Comp one-run scoring.
  - Judge touch-target checks.
  - Mobile overflow checks.

- `tests/e2e/admin-live-simulation.spec.js`
  - Admin demo event seeding/reseeding.
  - Twin Comp bottom-half wording/state smoke check.
  - Judge route password protection.

- `tests/e2e/smoke-routes.spec.js`
  - Route/theme smoke matrix for admin, spectator, streamer, and public views.

- `tests/e2e/visual.spec.js`
  - Screenshot artifact coverage for core routes and mobile judge states.

- `tests/e2e/a11y.spec.js`
  - Axe checks for admin, spectator, streamer, and mobile judge pages.

## Tools Installed

- `@playwright/test`
- `@axe-core/playwright`
- `lighthouse`
- `@lhci/cli`
- `start-server-and-test`

Browsers installed:

- Chromium
- Firefox
- WebKit

## Artifacts Generated

Screenshots saved in `qa-artifacts/screenshots`, including:

- `android-judge-chromium-judge-qualifying-submitted-light.png`
- `android-judge-chromium-judge-bracket-omt-dark.png`
- `android-judge-chromium-judge-twin-run-dark.png`
- `iphone-judge-webkit-judge-qualifying-submitted-light.png`
- `iphone-judge-webkit-judge-bracket-omt-dark.png`
- `iphone-judge-webkit-judge-twin-run-dark.png`
- `desktop-chromium-admin-demo-bracket.png`
- `desktop-chromium-admin-twin-double-live.png`

Playwright reports/traces/videos:

- `qa-artifacts/playwright-report`
- `qa-artifacts/playwright-results`

## Bugs Found

### Fixed: Judge Mobile Touch Targets Too Small

Route: mobile judge qualifying  
Viewport: Android mobile and likely iPhone  
Issue: deduction buttons and voice button were 34px tall.  
Risk: judges could mistap while watching a run.  
Fix: increased `.score-deduction-btn` min-height to 44px and padding to 10px.
Reproduction:

```powershell
npx playwright test tests/e2e/judge-mobile.spec.js --project=android-judge-chromium
```

Before the fix, the judge touch-target assertion failed on the deduction and voice controls.

### Fixed: Mobile Judge Page Missing Accessible H1

Route: mobile judge qualifying  
Tool: axe  
Issue: the visible judge hero is hidden in mobile judge layout, leaving no level-one heading.  
Fix: added a screen-reader-only `h1` inside the active qualifying main layout.
Reproduction:

```powershell
npx playwright test tests/e2e/a11y.spec.js --project=android-judge-chromium -g "mobile judge"
```

Before the fix, axe reported `page-has-heading-one`.

### Documented: Full Route Visual Matrix Is Slow

Issue: full visual/route matrix can exceed a 5-minute command timeout on this machine.  
Status: not a product bug. The tests exist and can be run in smaller slices or with longer CI timeouts.
Reproduction:

```powershell
npx playwright test tests/e2e/visual.spec.js --project=android-judge-chromium
```

### Documented: Shared Localhost Role Reload Can Revert To Admin

Issue: after seeding as admin and switching to judge in the same shared localhost tab, a plain reload may restore admin. Direct judge route reopen works.  
Risk: low for real judge phones because they use direct judge links/subdomains.  
Recommendation: long term, add a regression test and consider preserving forced role context more strongly on shared-host hash routes.
Reproduction:

1. Seed a demo event as admin on localhost with `?testMode=1&seedTest=qualifying`.
2. Log into a judge route in the same browser context.
3. Reload the same tab.
4. Compare that behavior against directly opening `/?testMode=1#/judge-1`, which currently works.

## Mobile Judge Coverage

Mobile judge testing was run on:

- iPhone/WebKit project
- Android/Chromium project
- Light theme qualifying scoring
- Dark theme bracket/OMT scoring
- Dark theme Twin Comp scoring

The tests check for:

- No horizontal overflow
- Touch-sized scoring controls
- Direct judge route access
- Score submission
- Duplicate-submit resistance via button state and post-submit UI
- Refresh/direct reopen behavior
- Mobile screenshots for light and dark states

Desktop judging is intentionally treated as a safe-access fallback, not the supported primary judging workflow.

## Bugs Fixed

- Mobile judge deduction/voice controls now meet touch target minimum.
- Mobile judge qualifying has an axe-compliant hidden h1.
- Twin Comp simulator now matches bottom-half elimination-point logic.
- QA scripts now include Twin Comp double-elimination scenario URL support.
- Firebase Hosting ignore rules now exclude QA docs/config/artifacts so test reports are not deployed accidentally.

## Bugs Not Fixed

- Full visual matrix runtime. This is a QA runtime/CI sizing concern, not a user-facing bug.
- Shared localhost same-tab role reload nuance. Risky to change quickly because role persistence, direct route access, and host-specific behavior are intertwined.

## Final Test Results

Passed:

```powershell
npm run test:unit
npx playwright test tests/e2e/judge-mobile.spec.js --project=android-judge-chromium
npx playwright test tests/e2e/judge-mobile.spec.js --project=iphone-judge-webkit
npx playwright test tests/e2e/admin-live-simulation.spec.js --project=desktop-chromium
npx playwright test tests/e2e/visual.spec.js --project=android-judge-chromium -g "mobile judge screenshot matrix"
npx playwright test tests/e2e/a11y.spec.js --project=android-judge-chromium -g "mobile judge"
```

Timed out in this local session:

```powershell
npm run test:e2e
npx playwright test tests/e2e/visual.spec.js --project=android-judge-chromium
```

The timeout happened because those commands run a larger route/screenshot matrix. They should be split in CI or run with a longer timeout.

## Recommended Long-Term QA Setup

- Run `test:judge-mobile` on every release.
- Run `test:unit` before every deploy.
- Run `test:a11y` nightly.
- Run `test:visual` nightly or before event weekends.
- Add GitHub Actions or another CI runner with a 20-30 minute timeout.
- Store `qa-artifacts/screenshots` as CI artifacts.
- Keep judge tests mobile-only except for safe desktop fallback checks.
- Add a dedicated role-route persistence regression for shared-host localhost behavior.
