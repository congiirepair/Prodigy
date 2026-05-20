# Prodigy Event Control Production Deployment Runbook

This runbook is for production Firestore rules, schema v2 event data, and Firebase Auth custom claims.

## Requirements

- Node.js: use the project-supported Node version for npm scripts. Verify with `node --version`.
- Java/JDK: JDK 21 or newer is required for Firebase Firestore emulator rules tests. Verify with `java -version`.
- Firebase CLI: use the local/installed `firebase` command available to the project.
- Firebase project: pass `--project <projectId>` explicitly for deploy and test commands.

If this machine reports Java 8, install JDK 21 and put its `bin` directory first on `PATH` before running `npm run test:rules`.

## What Not To Commit

Never commit service account JSON files, `.env` secrets, Firebase private keys, invite codes, role passwords, production driver data, QR/check-in secrets, or venue geofence secrets.

## Test Commands

Run before deployment:

```bash
npm run preflight
npm run test:unit
npm run test:e2e
npm run test:mobile
npm run test:rules
firebase deploy --only firestore:rules --dry-run --project <projectId>
```

`npm run test:rules` requires JDK 21+. If e2e/mobile are not suitable for CI, document the reason and run them locally before release.

## Deploy Firestore Rules

1. Confirm the active project:
   ```bash
   firebase projects:list
   ```
2. Compile rules without deploying:
   ```bash
   firebase deploy --only firestore:rules --dry-run --project <projectId>
   ```
3. Deploy rules:
   ```bash
   firebase deploy --only firestore:rules --project <projectId>
   ```
4. Re-run a smoke check against production with a public browser session, an anonymous registration session, and provisioned staff accounts.

## Claim Provisioning

Custom claims are server/admin-only. Client code cannot grant production roles to itself.

Authenticate with Application Default Credentials or set `GOOGLE_APPLICATION_CREDENTIALS` to a service account JSON path outside the repo:

```bash
set GOOGLE_APPLICATION_CREDENTIALS=C:\secure\firebase-admin-service-account.json
```

List current claims:

```bash
npm run claims:list -- --uid <uid> --project <projectId>
```

Dry-run a role change:

```bash
npm run claims:set -- --uid <uid> --role judge1 --event <eventId> --project <projectId>
```

Apply with explicit confirmation:

```bash
npm run claims:set -- --uid <uid> --role owner --project <projectId> --yes
npm run claims:set -- --uid <uid> --role websiteAdmin --project <projectId> --yes
npm run claims:set -- --uid <uid> --role eventAdmin --event <eventId> --project <projectId> --yes
npm run claims:set -- --uid <uid> --role j1 --event <eventId> --project <projectId> --yes
npm run claims:set -- --uid <uid> --role j2 --event <eventId> --project <projectId> --yes
npm run claims:set -- --uid <uid> --role j3 --event <eventId> --project <projectId> --yes
npm run claims:set -- --uid <uid> --role streamOperator --event <eventId> --project <projectId> --yes
npm run claims:set -- --uid <uid> --role judge1 --event <eventId> --project <projectId> --yes
```

Revoke after the event:

```bash
npm run claims:revoke -- --uid <uid> --role j1 --event <eventId> --project <projectId> --yes
npm run claims:revoke -- --uid <uid> --role j2 --event <eventId> --project <projectId> --yes
npm run claims:revoke -- --uid <uid> --role j3 --event <eventId> --project <projectId> --yes
npm run claims:revoke -- --uid <uid> --role judge1 --event <eventId> --project <projectId> --yes
npm run claims:revoke -- --uid <uid> --role eventAdmin --event <eventId> --project <projectId> --yes
npm run claims:revoke -- --uid <uid> --role streamOperator --event <eventId> --project <projectId> --yes
npm run claims:revoke -- --uid <uid> --role websiteAdmin --project <projectId> --yes
```

After claims change, the user must refresh their ID token. In the app, use the refresh-session action when shown, or sign out/sign in.

The claims script refuses to run without an explicit `--project`, refuses writes without `--yes`, supports only known role names, and uses Application Default Credentials or `GOOGLE_APPLICATION_CREDENTIALS`. Do not place service account JSON files inside this repository.

## Create A Schema v2 Event

New events created by the app should have `schemaVersion: 2`. Verify:

- `events/{eventId}` contains only the public event shell.
- `events/{eventId}/private/config` contains staff/private config.
- Registration writes create private `registrations/{registrationId}` docs and public-safe `publicRegistrationIndex/{publicId}` docs.
- Judge scores write to `judgeSubmissions/{submissionId}`.
- Battle votes write to `battleVotes/{voteId}`.
- Bracket/admin state writes to `brackets/main`.
- Public displays read `publicAggregates/*`.

## Demo And Test Data

Demo query parameters such as `demoRole`, `demoScenario`, `demoSession`, and `demoView` must never grant production write access. Demo data belongs under `demoEvents/{eventId}` or test-only app IDs. Do not use a production app ID containing `test`, because `testData/**` rules intentionally allow signed-in writes only for test-like app IDs.

## Registration Privacy Verification

Before opening registration:

- Confirm public users can read `publicRegistrationIndex`.
- Confirm public users cannot read full `registrations`.
- Confirm public index docs do not contain email, phone, precise location, QR/check-in token, device token, `ownerUid`, private notes, or payment/approval internals.
- Confirm drivers cannot set `approvedAt`, `paidAt`, `approvedDriverIds`, admin notes, judge scores, bracket state, or config.

## Aggregate Trust Model

Current aggregates are published by trusted event admin/owner clients. This means a compromised admin can alter public standings, bracket display, live summary, or results archive. Judges, drivers, stream operators, demo users, and public spectators cannot publish aggregates. The next production hardening step is a backend aggregation function that computes public standings/results from scoped submissions and battle votes.

## Rollback

If rules deployment blocks normal event operation:

1. Pause new registrations and staff write actions.
2. Identify the denied path from browser console/Firebase logs.
3. Revert only the rules change that caused the regression.
4. Run `firebase deploy --only firestore:rules --dry-run --project <projectId>`.
5. Deploy the corrected rules.
6. Re-test public read, registration, judge submission, admin bracket, stream state, and archive publish.

Do not delete legacy event documents during rollback. Schema v1/missing fallback remains a read compatibility path.
