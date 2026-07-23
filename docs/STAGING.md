# Prodigy Staging And Local QA

Use a separate Firebase project for staging and Firebase emulators for local
automated and manual QA. The browser application has no Test Mode and always
uses its configured `public/data/events` collection.

## Local development

Run the local emulator stack:

```bash
npm run serve
```

Open the local application normally. Localhost deliberately connects to the
Firebase emulators; `?emulators=1` is also supported for an explicit opt-in.

## Staging Firebase project

`.firebaserc` includes a `staging` alias for the staging project. Replace its
project ID if needed, then deploy explicitly with:

```bash
firebase deploy --project staging
```

Production deployments must be explicitly scoped to the intended services.

## Automated fixtures

Test fixtures belong only in the repository test suites and emulator-backed
tests. They are not exposed through browser routes or production Firestore
paths.

## Twin Comp simulation

```bash
npm run simulate:twin
```

The simulator verifies the triple-elimination lifecycle without changing
Firebase data.
