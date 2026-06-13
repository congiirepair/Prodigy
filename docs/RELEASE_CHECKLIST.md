# Release Verification Checklist

Use this checklist for every staging event rehearsal and production release.

## Automated Gate

- [ ] `npm ci` completes from a clean checkout.
- [ ] `npm run preflight` passes on a machine with JDK 21+.
- [ ] `npm run test:unit` passes.
- [ ] `npm run test:rules` passes with JDK 21+.
- [ ] `npm run test:e2e` passes.
- [ ] `npm run test:mobile` passes.
- [ ] `firebase deploy --only firestore:rules --dry-run --project <projectId>` passes.
- [ ] `npm audit` findings are reviewed against [DEPENDENCY_AUDIT.md](./DEPENDENCY_AUDIT.md).
- [ ] GitHub Actions `Production Verification` has passed after pushing the branch.

## Staging Firebase Setup

- [ ] Select the staging Firebase project and confirm it is not a production project.
- [ ] Confirm the staging project/app ID does not contain `test` if it will mimic production rules behavior.
- [ ] Deploy Firestore rules to staging.
- [ ] Create a schema v2 event.
- [ ] Provision owner claim.
- [ ] Provision websiteAdmin claim if a separate website admin operator is used.
- [ ] Provision eventAdmin claim for the event.
- [ ] Provision judge claims: `j1`, `j2`, `j3`.
- [ ] Provision streamOperator claim.

## Public And Driver Checks

- [ ] Unauthenticated public spectator can view `/`, `/live`, `/register`, `/results`, and public event displays only.
- [ ] Public spectator cannot see judge inputs, admin controls, recovery tools, invite codes, role passwords, or sync diagnostics on `/`.
- [ ] Anonymous driver can preregister only when registration is open.
- [ ] Anonymous driver cannot preregister when registration is closed.
- [ ] Anonymous driver cannot approve themselves, mark paid, write admin notes, edit scores, advance brackets, or change config.
- [ ] Full private registration fields are not public-readable.
- [ ] Public registration index contains only display-safe fields.
- [ ] Public cannot write public aggregates.

## Staff Role Checks

- [ ] Unauthorized judge route shows: “Your account is not authorized for this event role. Ask the event owner to assign access, then refresh your session.”
- [ ] Unauthorized admin route does not show destructive controls and shows the same access message.
- [ ] Unauthorized Stream Studio does not show start/stop controls and offers a refresh-session action.
- [ ] Refresh-session button refreshes the ID token after a claim assignment.
- [ ] Judge 1 can submit Judge 1 qualifying scores only.
- [ ] Judge 1 cannot submit Judge 2 or Judge 3 scores.
- [ ] Judge cannot advance brackets or edit event config.
- [ ] Stream operator can update stream status/layout only.
- [ ] Stream operator cannot edit scores, registrations, brackets, event config, or archives.
- [ ] Event admin can approve/check in drivers.
- [ ] Event admin can manage qualifying/bracket state.
- [ ] Event admin can publish public aggregates.
- [ ] Website owner can update active event selection and global event directory.

## Demo, Legacy, And Migration Checks

- [ ] Demo query params such as `demoRole`, `demoScenario`, `demoSession`, and `demoView` do not grant production write access.
- [ ] Demo/test data does not appear in production event paths.
- [ ] No production data appears in demo/test paths.
- [ ] Legacy schema v1/missing event still renders.
- [ ] Admin documentation/status identifies legacy events before migration.
- [ ] Schema v2 event writes registrations, drivers, judge submissions, battle votes, brackets, public aggregates, and private config to scoped docs.
- [ ] Legacy event document is not deleted.

## Release And Rollback

- [ ] No service account JSON files, `.env` secrets, role passwords, invite codes, QR secrets, or production driver data are staged.
- [ ] Claim revocation works after the staging event.
- [ ] Rollback procedure in [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) is reviewed.
- [ ] Production deployment uses explicit `--project <projectId>`.
- [ ] Post-deploy smoke checks are run as public, driver, judge, stream operator, event admin, and owner.
