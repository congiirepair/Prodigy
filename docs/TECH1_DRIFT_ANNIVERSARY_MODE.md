# Tech 1 Drift Anniversary Mode

This special mode is isolated from normal Prodigy RC Comp event scoring, qualifying, bracket, Stream Studio, archive, and schema v2 competition paths.

## Event Config

- Event name: Tech 1 Drift Anniversary Competition
- Date: May 30
- Event id: `tech1drift-anniversary-may-30`
- Mode: `tech1drift-anniversary`
- Expected drivers: 60+
- Qualifying: disabled
- Bracket: randomized single-elimination, generated once by staff and stored
- Default bracket source: checked-in drivers
- Raffle: 1 free ticket per registration, additional staff-confirmed tickets are $5 each

The central browser config lives in `assets/js/config/specialEvents.js`.

## Firestore Paths

All documents live under the existing public data scope:

- `artifacts/{appId}/public/data/specialEvents/{eventId}`: public shell/config
- `specialEvents/{eventId}/registrations/{registrationId}`: private registration, raffle/payment totals, staff fields
- `specialEvents/{eventId}/publicRegistrationIndex/{registrationId}`: public-safe roster fields only
- `specialEvents/{eventId}/raffleTransactions/{transactionId}`: staff-confirmed paid ticket log
- `specialEvents/{eventId}/brackets/main`: stored randomized bracket
- `specialEvents/{eventId}/battleResults/{matchId}`: staff-recorded battle result log

Normal paths such as `events/{eventId}/judgeSubmissions`, `qualifyingRuns`, `battleVotes`, `brackets`, and `publicAggregates` are not used by this mode.

## Authorization

- Public users can read the event shell, public registration index, stored bracket, and battle results.
- Signed-in anonymous guests can create their own registration with exactly 1 free raffle ticket and no paid-ticket fields.
- Public users cannot self-report paid raffle tickets, self-check-in, set bracket eligibility, or set bracket seeds.
- Event admin/owner can initialize the event shell, check in drivers, record paid raffle transactions, generate/lock the bracket, and record winners.
- Judge and stream roles do not grant raffle/bracket management permissions for this special mode.

Custom claims should be provisioned for the special event id when staff need production write access. Do not put real UIDs, role passwords, invite codes, or service account keys in this repo.

```bash
npm run claims:list -- --uid <uid> --project <projectId>
npm run claims:set -- --uid <uid> --role eventAdmin --event tech1drift-anniversary-may-30 --project <projectId> --yes
npm run claims:set -- --uid <uid> --role owner --project <projectId> --yes
npm run claims:revoke -- --uid <uid> --role eventAdmin --event tech1drift-anniversary-may-30 --project <projectId> --yes
```

After claims are changed, the staff browser session must refresh its ID token. The simplest event-day instruction is to sign out/sign in or use the app's refresh-session control before opening staff tools.

## Initialization And Readiness

The event shell must exist before public live registrations can write. Use Application Default Credentials or `GOOGLE_APPLICATION_CREDENTIALS`; never commit service account JSON files.

Dry run:

```bash
npm run tech1:init -- --project <projectId> --app-id <appId> --event tech1drift-anniversary-may-30 --registration-open true
```

Write after reviewing the printed target path and payload:

```bash
npm run tech1:init -- --project <projectId> --app-id <appId> --event tech1drift-anniversary-may-30 --registration-open true --yes
```

Readiness check:

```bash
npm run tech1:check -- --project <projectId> --app-id <appId> --event tech1drift-anniversary-may-30
```

Local dry-run simulations:

```bash
npm run tech1:dry-run -- 5
npm run tech1:dry-run -- 60
```

Staging write dry run, only for a staging/test Firebase target:

```bash
node scripts/tech1-dry-run.mjs --project <stagingProjectId> --app-id <stagingAppId> --event tech1drift-anniversary-may-30 --driver-count 5 --write --yes
node scripts/tech1-dry-run.mjs --project <stagingProjectId> --app-id <stagingAppId> --event tech1drift-anniversary-may-30 --driver-count 60 --write --yes
```

Cleanup fake dry-run docs from staging:

```bash
node scripts/tech1-dry-run.mjs --project <stagingProjectId> --app-id <stagingAppId> --event tech1drift-anniversary-may-30 --driver-count 60 --dry-run-id tech1-dryrun-60 --write --yes --cleanup
```

The init script merges only the `specialEvents/{eventId}` shell. It does not overwrite registrations, public index docs, raffle transactions, bracket docs, or battle results. If the shell already says the bracket is generated, locked, in progress, or complete, the init flow preserves that shell status.

## Manual Raffle Payment Flow

- Public registration includes 1 free raffle ticket.
- Additional raffle tickets are $5 each and are purchased from event staff.
- Public users cannot add paid tickets themselves.
- Staff should collect payment before recording paid tickets in the app.
- Staff-confirmed ticket entries create raffle transaction records and update private registration totals.
- CSV export totals are for reconciliation against the cash/card/comped ticket log.
- Without a payment processor, the app is the event ledger, not proof that money moved.

## Bracket Safeguards

- Default bracket source is checked-in drivers.
- The all-registered option is available only to staff and should be used carefully because it can include no-shows.
- Staff should verify driver count, bracket size, and byes before generating and locking the bracket.
- Fewer than 2 eligible drivers blocks generation.
- Regenerating a generated, locked, in-progress, or complete bracket prompts for confirmation.
- Randomized seed order is stored in Firestore. Refreshing the page does not reshuffle the bracket.
- Raffle ticket count does not affect seeding.

## CSV Export

Staff export includes:

- Name
- Team Name
- Chassis
- Instagram
- Checked In
- Bracket Eligible
- Bracket Seed
- Free Tickets
- Paid Tickets
- Total Tickets
- Amount Paid
- Payment Status
- Payment Method
- Staff Notes

The export also includes a summary section for total registrations, checked-in count, bracket eligible count, bracket size, free tickets issued, paid tickets sold, total raffle tickets, and total money collected. Public users cannot access the staff export control.

## Operational Notes

- Staff should initialize the Tech 1 event before guests begin live self-registration.
- The default bracket generator uses checked-in drivers. The all-registered option is available for staff if needed.
- Regenerating a stored or locked bracket prompts for confirmation.
- Raffle ticket count is intentionally independent from bracket seeding.
- Bracket randomization is stored in Firestore and does not reshuffle on refresh.
- No payment processor is connected in this pass; paid tickets are staff-confirmed records.

## Event-Day Checklist

### Before Event

- Deploy the latest site and Firestore rules.
- Prove CI/rules tests with JDK 21 if available.
- Initialize the Tech 1 event shell.
- Open registration intentionally.
- Provision owner/event-admin staff claims for `tech1drift-anniversary-may-30`.
- Refresh staff sessions after claim assignment.
- Run the 5-driver dry-run simulation.
- Run the 60-driver dry-run simulation.
- Test one public registration.
- Test one staff paid-ticket entry.
- Test CSV export.
- Test bracket generation with sample data in staging.
- Confirm public users cannot see staff raffle/export/bracket controls.

### During Event

- Monitor registrations and possible duplicate-looking entries.
- Check in drivers as they arrive.
- Collect payment before recording paid raffle tickets.
- Use checked-in drivers for bracket generation by default.
- Verify driver count, bracket size, and byes before locking.
- Lock the bracket before battles start.
- Advance winners from staff controls.
- Export raffle totals before the drawing.
- Record the final winner.

### After Event

- Close registration.
- Export the final CSV.
- Export or record bracket results.
- Revoke temporary staff claims.
- Archive event data according to the production deployment runbook.
- Document manual corrections.

### Emergency Notes

- Duplicate registration: keep the clearest/current entry, mark the duplicate in staff notes if used, and reconcile raffle tickets before export.
- Driver no-show: use checked-in drivers for bracket generation. If the bracket was already generated, regenerate only with staff confirmation before battles start.
- Wrong paid-ticket entry: add a correcting staff note and, if necessary, create a compensating transaction/manual reconciliation entry in the exported ledger.
- Bracket generated too early: regenerate only after confirming the current status and driver count. Once battles start, avoid reshuffling and handle no-shows manually.
- Internet instability: pause new paid-ticket entries, keep a paper backup for raffle purchases, and reconcile into the app/export once connectivity returns.

## Manual Staging Test Plan

- 5-driver test: expect 5 registrations, 5 free tickets, bracket size 8, 3 byes, stable randomized seed order, CSV totals present.
- 60-driver test: expect 60 registrations, 60 free tickets, bracket size 64, 4 byes, stable randomized seed order, and usable bracket display.
- Public registration test: confirm the form is enabled only after the event shell exists and registration is open.
- Paid ticket test: record one staff-confirmed purchase after collecting payment and confirm totals update.
- Winner advancement test: generate and lock the bracket, advance one match, then confirm the stored bracket does not reshuffle on reload.
- CSV export test: confirm the export contains reconciliation fields and totals, and that public users cannot access the export control.
