# Prodigy Event Control Agent Notes

## Project Shape

- Static single-page Firebase web app.
- Main app file: `index.html`.
- Runtime config: `client-config.js`.
- Firebase Hosting rewrites every route to `index.html`.
- Firebase Auth uses anonymous sign-in.
- Firestore state lives under `artifacts/{appId}/public/{scope}`.
- Production scope is `data`; isolated QA/Test Mode scope is `testData`.
- Firebase Functions source is `functions/`; current function is `parseVoiceDeductions`.

## Safe Development

- Do not write QA data to production.
- Use `?testMode=1` for QA and demo flows.
- On localhost, the app automatically connects to Firebase Auth and Firestore emulators unless `emulators=0` is present.
- Judge workflows are mobile-first. Automated judge tests must use mobile Playwright projects.

## Setup

```powershell
npm install
npx playwright install chromium firefox webkit
cd functions
npm install
cd ..
```

## Local Dev

```powershell
npm run serve
```

Local app:

```text
http://127.0.0.1:5000/?testMode=1
```

## Test Data

Seed isolated local/emulator test scenarios:

```powershell
npm run seed:test
```

Reset/reseed isolated local/emulator scenarios:

```powershell
npm run reset:test
```

Scenario URLs:

```powershell
npm run test:url:qualifying
npm run test:url:bracket
npm run test:url:twin
```

## QA Commands

```powershell
npm run test:unit
npm run test:e2e
npm run test:mobile
npm run test:judge-mobile
npm run test:visual
npm run test:a11y
npm run test:lighthouse
npm run qa:all
```

Artifacts:

- Screenshots: `qa-artifacts/screenshots`
- Playwright HTML report: `qa-artifacts/playwright-report`
- Playwright traces/videos/results: `qa-artifacts/playwright-results`
- Lighthouse output: `qa-artifacts/lighthouse`

## Deploy

Hosting:

```powershell
firebase deploy --only hosting --project prodigy-rc-competitions
```

Voice function:

```powershell
firebase deploy --only functions:parseVoiceDeductions --project prodigy-rc-competitions
```

## Current Modes/Roles To Preserve

Roles:

- Spectator
- Event admin
- Website admin
- Judge 1
- Judge 2
- Judge 3
- Streamer/OBS routes

Competition modes:

- Solo qualifying plus bracket battles
- Team tandem bracket
- Twin Comp triple elimination
- Twin Comp double elimination

Judging modes:

- Average score judging
- Line/Angle/Style category judging

Twin Comp rule:

- Every active team gets one scored run per round.
- Bottom half of the round receives one elimination point.
- Double elimination removes teams at 2 points.
- Triple elimination removes teams at 3 points.
