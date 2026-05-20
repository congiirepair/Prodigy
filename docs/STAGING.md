# Prodigy Staging And Test Mode

This app now has two safe QA layers:

- **Staging Firebase project**: use a separate Firebase project alias named `staging` when you have one available.
- **Test Mode sandbox**: use `?testMode=1` to route all app data to `artifacts/{appId}/public/testData` instead of production `public/data`.

## Local Staging

1. Install Firebase CLI if needed.
2. Run the local emulator stack:

```bash
npm run serve
```

3. Open:

```text
http://localhost:5000?testMode=1&seedTest=qualifying#/event-admin/registration
```

Localhost automatically uses the Firebase Auth and Firestore emulators.

## Seed Or Reset Test Data

These commands print ready-to-open URLs that reseed the isolated test data namespace:

```bash
npm run test:url:qualifying
npm run test:url:bracket
npm run test:url:twin
```

Opening one of those URLs resets the sandbox to that seeded scenario.

Available scenarios:

- `qualifying`: fake drivers, judges, QR venue check-in, and live mobile judging.
- `bracket`: fake drivers with completed qualifying and an active battle bracket.
- `twin`: fake teams with a Twin Comp triple-elimination round live.

Inside Event Admin, use **Start Demo Event** or **Reset Demo Data** for the same reset/reseed flow.

## Mobile Judging

1. Open the seeded admin URL in Test Mode.
2. Copy a judge role link from Role Access, or use the judge host link while Test Mode is active.
3. The copied link keeps `testMode=1`, so judge submissions write only to `public/testData`.
4. For QR check-in, open the QR display from the test event. Self-registration links also preserve `testMode=1`.

## Staging Firebase Project

`.firebaserc` includes:

```json
"staging": "prodigy-rc-competitions-staging"
```

Replace that project id with your real staging Firebase project if it differs, then deploy with:

```bash
firebase deploy --project staging
```

Production deploys still use:

```bash
firebase deploy --project default
```

## Data Isolation

Production data:

```text
artifacts/{appId}/public/data
```

Test Mode data:

```text
artifacts/{appId}/public/testData
```

Firestore rules now enforce least-privilege writes in `public/data`. Test Mode writes are isolated under `public/testData`, and signed-in test writes are allowed only when the app ID is clearly test-like. Do not use a production app ID containing `test`.

## Twin Comp Simulation

Run:

```bash
npm run simulate:twin
```

The simulator verifies that the lowest three scored active teams receive one elimination point per round, teams are removed at three points, and the event completes when one active team remains.
