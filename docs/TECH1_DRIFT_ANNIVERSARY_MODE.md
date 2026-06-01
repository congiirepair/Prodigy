# Tech 1 Drift Anniversary Mode

Tech 1 Drift Anniversary is now defined as a Prodigy competition mode inside event control, not as a standalone spectator route. The current implementation keeps the existing `specialEvents/{eventId}` data path for compatibility while event setup can identify the format as `tech1-anniversary`.

The product model is the normal event-control flow with Tech 1-specific behavior: branded setup, desk registration, staff check-in, raffle tracking, randomized single-elimination bracket generation, inherited solo-driver judging flow, final battle completion, and a click-to-reveal final winner. The standalone public Tech 1 page has been retired.

Current event-day operation uses event-day cloud sync. Event setup, Tech 1 desk registrations, raffle totals, bracket generation, winner advancement, and reveal state sync through Firebase so another signed-in browser can resume the desk workflow. Firebase also remains the sync path for judging.

## Event Config

- Event name: Tech 1 Drift Anniversary Competition
- Date: May 30
- Event id: `tech1drift-anniversary-may-30`
- Competition mode: `tech1-anniversary`
- Legacy special-event mode accepted for existing docs: `tech1drift-anniversary`
- Competition type: `random-single-elimination`
- Bracket generation: `randomized-from-competing-drivers`
- Expected drivers: 60+
- Qualifying: disabled
- Registration: enabled
- Raffle: enabled
- Bracket: randomized single-elimination, generated once by staff and stored
- Default bracket source: drivers marked Competing
- Competition entry fee: $40 for every registered driver, or $20 when the desk marks `Tech 1 Driver`; the fee applies whether or not they are marked Competing
- Raffle: 1 free ticket per registration, additional staff-confirmed tickets are $5 each
- Fixed source of truth: `specialEvents/tech1drift-anniversary-may-30`

The central mode definition lives in `assets/js/config/competitionModes.js`. The event-specific compatibility shell lives in `assets/js/config/specialEvents.js`.

## Event-Control Workflow

Create or edit an event and choose `Tech 1 Drift Anniversary` as the competition mode. The admin registration screen switches to the Tech 1 control panel for this mode instead of the normal qualifying-first workflow.

- Staff sees `No qualifying - random bracket from drivers marked Competing.`
- Normal qualifying controls are hidden as the required next step for Tech 1.
- Tech 1 registrations, duplicate hints, check-in controls, Competing controls, raffle totals, and extra-ticket controls are managed from the event-control registration workflow.
- The Tech 1 bracket lives in the normal `Competition` tab, matching solo-driver mode. Staff generate/lock the randomized bracket there, judges vote battles there, and public-safe bracket display uses the normal public competition/results surfaces.
- There is no standalone `/tech1` or `/tech1/register` page. Tech 1 is selected by changing the active event's competition mode.

## Registration Desk Flow

The Tech 1 desk flow is optimized for event staff entering drivers face to face.

1. Event admin enters Name, Team, Chassis, and Instagram.
2. Event admin checks `Competing` when the driver is entering the bracket.
3. Desk registrations are marked Checked In automatically because the driver is present with staff.
4. Event admin can toggle Competing on or off before bracket generation if a driver changes their mind.
5. Every registered driver adds an entry fee to the desk total: $40 standard, or $20 when `Tech 1 Driver` is checked.
6. Every saved driver receives 1 free raffle ticket.
7. Event admin records extra raffle tickets purchased. Extra tickets are $5 each and are staff-confirmed/manual.
8. The desk total is `entry fee + extra raffle tickets * $5`.
9. The registration list shows Competing status, Checked In status, entry fee, extra raffle tickets, total raffle tickets, raffle amount, and total amount collected.
10. Staff can update driver info, check-in status, Competing status, and extra raffle ticket count before the bracket is generated.
11. The `Load Sample Drivers` button adds 25-50 obvious fake drivers with mixed Competing and Tech 1 Driver status so staff can test bracket/judging flow before event day.

## Event-Day Cloud Sync And Firebase Scope

The active event-day Tech 1 workflow is cloud-first:

- The app signs browser sessions in with Firebase Auth.
- Signed-in app sessions can read/write the app data tree for event-day operations.
- Event directory, active event state, Tech 1 desk registrations, raffle totals, bracket state, battle results, and reveal state can sync across computers.
- The older browser-local storage key `rc-drift-tech1-local-state-v1` may still exist in a browser, but it is not the current source of truth while cloud sync mode is enabled.
- Firebase remains available for scoped judge submissions in the normal judging flow.

The fixed special-event path remains the compatibility/source-of-truth path for staging or future cloud sync:

All documents live under the existing public data scope:

- `artifacts/{appId}/public/data/specialEvents/{eventId}`: public shell/config
- `specialEvents/{eventId}/registrations/{registrationId}`: private registration, raffle/payment totals, staff fields
- `specialEvents/{eventId}/publicRegistrationIndex/{registrationId}`: public-safe roster fields only
- `specialEvents/{eventId}/raffleTransactions/{transactionId}`: staff-confirmed paid ticket log
- `specialEvents/{eventId}/brackets/main`: stored randomized bracket
- `specialEvents/{eventId}/battleResults/{matchId}`: staff-recorded battle result log

Normal paths such as `events/{eventId}/judgeSubmissions`, `qualifyingRuns`, `battleVotes`, `brackets`, and `publicAggregates` are not used by the current Tech 1 special-event bracket model.

## Authorization

- Event-day cloud rules intentionally allow signed-in app sessions to read/write the app data tree so the desk can resume from another computer.
- Staff controls are still hidden in the UI unless the browser is unlocked as website/event admin.
- Tech 1 registration is event-admin-first; staff enter drivers at the desk and public users do not manage Competing, paid raffle tickets, or check-in through the UI.
- Event admin/owner can initialize the event shell, check in drivers, record paid raffle transactions, generate/lock the bracket, and record winners.

Do not put real UIDs, role passwords, invite codes, or service account keys in this repo.

## Initialization And Readiness

The event shell can still be initialized for staging/cloud compatibility. Use Application Default Credentials or `GOOGLE_APPLICATION_CREDENTIALS`; never commit service account JSON files.

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
npm run tech1:dry-run -- 50
npm run tech1:dry-run -- 60
```

Staging write dry run, only for a staging/test Firebase target:

```bash
node scripts/tech1-dry-run.mjs --project <stagingProjectId> --app-id <stagingAppId> --event tech1drift-anniversary-may-30 --driver-count 5 --write --yes
node scripts/tech1-dry-run.mjs --project <stagingProjectId> --app-id <stagingAppId> --event tech1drift-anniversary-may-30 --driver-count 50 --write --yes
node scripts/tech1-dry-run.mjs --project <stagingProjectId> --app-id <stagingAppId> --event tech1drift-anniversary-may-30 --driver-count 60 --write --yes
```

Cleanup fake dry-run docs from staging:

```bash
node scripts/tech1-dry-run.mjs --project <stagingProjectId> --app-id <stagingAppId> --event tech1drift-anniversary-may-30 --driver-count 60 --dry-run-id tech1-dryrun-60 --write --yes --cleanup
```

The init script merges only the `specialEvents/{eventId}` shell. It does not overwrite registrations, public index docs, raffle transactions, bracket docs, or battle results. If the shell already says the bracket is generated, locked, in progress, or complete, the init flow preserves that shell status.

## Manual Raffle Payment Flow

- Public registration includes 1 free raffle ticket.
- Every Tech 1 desk registration adds an entry fee: $40 standard, or $30 for drivers marked `Tech 1 Driver`.
- Additional raffle tickets are $5 each and are purchased from event staff.
- Public users cannot add paid tickets themselves.
- Staff should collect payment before recording paid tickets in the app.
- Staff-confirmed ticket entries create raffle transaction records and update private registration totals.
- PDF export creates `Tech 1 Drift Anniversary Raffle Report` with driver name, team, chassis, Instagram, entry fee, extra raffle tickets purchased, total tickets, raffle amount, and total collected.
- The event-admin UI exposes PDF export for event-day reconciliation. The older CSV helper remains in code but is not currently exposed as a Tech 1 desk button.
- Without a payment processor, the app is the event ledger, not proof that money moved.

## Bracket Safeguards

- Default bracket source is drivers marked Competing.
- Non-competing drivers stay in the raffle/report list but do not enter the bracket.
- Staff should verify registered count, Competing count, selected source, bracket size, and first-round byes before generating and locking the bracket.
- Fewer than 2 eligible drivers blocks generation.
- Regenerating a generated, locked, in-progress, or complete bracket prompts for confirmation.
- Randomized seed order is stored in Firestore. Refreshing the page does not reshuffle the bracket.
- Raffle ticket count does not affect seeding.

Projection examples:

- 2 drivers -> 2 slots, 0 byes
- 3 drivers -> 4 slots, 1 bye
- 5 drivers -> 8 slots, 3 byes
- 16 drivers -> 16 slots, 0 byes
- 17 drivers -> 32 slots, 15 byes
- 50 drivers -> 64 slots, 14 byes
- 60 drivers -> 64 slots, 4 byes
- 64 drivers -> 64 slots, 0 byes
- 65 drivers -> 128 slots, 63 byes
- 80 drivers -> 128 slots, 48 byes

For the 50-driver event-admin dry run, every fake driver uses the desk model, is marked Competing, receives 1 free raffle ticket, and buys 6-15 extra raffle tickets. Expected totals are 50 free tickets, 525 extra tickets, 575 total raffle tickets, $2,000 in entry fees, $2,625 in raffle tickets, and $4,625 total collected. A separate non-competing variant verifies that 55 registrations with 5 non-competing drivers collects $2,200 in entry fees while still generating a 50-driver bracket.

## PDF Export

The exposed event-day staff PDF export includes:

- Name
- Team Name
- Chassis
- Instagram
- Entry Fee
- Checked In
- Bracket Eligible
- Bracket Seed
- Free Tickets
- Extra Raffle Tickets Purchased
- Total Tickets
- Raffle Amount Paid
- Total Amount Collected
- Payment Status
- Payment Method
- Staff Notes

Public users cannot access the staff export controls.

The PDF report includes:

- Driver name
- Team
- Chassis
- Instagram
- Entry fee
- Extra raffle tickets purchased
- Total raffle tickets
- Raffle amount
- Total amount collected
- Summary totals for registrations, entry fees, free tickets, extra tickets, total tickets, raffle amount, and total amount collected

## Operational Notes

- Staff should create/select the Tech 1 event mode before opening the registration desk.
- The default bracket generator uses drivers marked Competing.
- Regenerating a stored or locked bracket prompts for confirmation.
- Raffle ticket count is intentionally independent from bracket seeding.
- Bracket randomization is stored in Firestore and does not reshuffle on refresh.
- No payment processor is connected in this pass; paid tickets are staff-confirmed records.
- Tech 1 hero/header visuals use a black/white light/dark treatment. Do not use a red hero background; red may appear only inside brand artwork if needed.
- Tech 1 battle judging now inherits the solo-driver Lead/Chase/OMT vote flow: J1, J2, and J3 see the active Tech 1 battle, submit one vote each, and the majority winner advances through the stored randomized bracket.
- OMT/tie outcomes reset the same Tech 1 match for another judge cycle.
- Event-admin manual winner buttons remain as an emergency override, but the intended flow is mobile judge voting.
- The final winner remains hidden after the final battle completes until event admin clicks `Reveal Final Winner`. The normal public competition/results surfaces should only show the winner after that reveal state is stored.
- In the current event-day cloud sync mode, Tech 1 judge vote state and bracket state can be shared through Firebase between event-admin and judge devices.

## Event-Day Checklist

### Before Event

- Deploy the latest site and Firestore rules.
- Prove CI/rules tests with JDK 21 if available.
- Initialize the Tech 1 event shell.
- Open registration intentionally.
- Unlock the website/event admin browser before opening staff tools.
- Run the 5-driver dry-run simulation.
- Run the 50-driver event-admin dry-run simulation.
- Run the 60-driver dry-run simulation.
- Test one event-admin desk registration.
- Test one staff paid-ticket entry and PDF export.
- Test CSV export.
- Test bracket generation with sample data in staging.
- Confirm public users cannot see staff raffle/export/bracket controls on normal public routes.

### During Event

- Monitor registrations and possible duplicate-looking entries.
- Check in drivers as they arrive.
- Collect payment before recording paid raffle tickets.
- Use Competing drivers for bracket generation by default.
- Verify driver count, bracket size, and byes before locking.
- Lock the bracket before battles start.
- Advance winners from staff controls.
- Export raffle totals as CSV and PDF before the drawing.
- Complete the final battle, then click `Reveal Final Winner` when ready to show the result publicly.

### After Event

- Close registration.
- Export the final PDF.
- Export or record bracket results.
- Close registration and clear any event-day browser unlocks as needed.
- Archive event data according to the production deployment runbook.
- Document manual corrections.

### Emergency Notes

- Duplicate registration: keep the clearest/current entry, mark the duplicate in staff notes if used, and reconcile raffle tickets before export.
- Driver no-show: toggle Competing off before bracket generation. If the bracket was already generated, regenerate only with staff confirmation before battles start.
- Wrong paid-ticket entry: add a correcting staff note and, if necessary, create a compensating transaction/manual reconciliation entry in the exported ledger.
- Bracket generated too early: regenerate only after confirming the current status and driver count. Once battles start, avoid reshuffling and handle no-shows manually.
- Internet instability: pause new paid-ticket entries, keep a paper backup for raffle purchases, and reconcile into the app/export once connectivity returns.

## Manual Staging Test Plan

- 5-driver test: expect 5 registrations, 5 free tickets, bracket size 8, 3 byes, stable randomized seed order, CSV totals present.
- 50-driver event-admin test: expect 50 registrations, 50 free tickets, 525 extra tickets, 575 total tickets, $2,000 entry fees, $2,625 raffle amount, $4,625 total collected, bracket size 64, 14 byes, hidden final winner until reveal.
- 60-driver test: expect 60 registrations, 60 free tickets, bracket size 64, 4 byes, stable randomized seed order, and usable bracket display.
- Public registration test: confirm the form is enabled only after the event shell exists and registration is open.
- Paid ticket test: record one staff-confirmed purchase after collecting payment and confirm totals update.
- Winner advancement test: generate and lock the bracket, advance matches through the final, confirm the stored bracket does not reshuffle on reload, confirm the final winner stays hidden until the event-admin reveal click.
- PDF export test: confirm the export contains reconciliation fields and totals, and that public users cannot access export controls.
