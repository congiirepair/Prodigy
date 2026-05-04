# Prodigy Test / Demo Mode

Use Test Mode when you need to QA judging, qualifying, brackets, Twin Comp double/triple elimination, spectator sync, or streamer layouts without touching live production event data.

## Launch Test Mode

Open the app with:

```text
https://prodigy-rc-competitions.web.app?testMode=1
```

The app stores this flag on the device, so role links copied from Test Mode keep `testMode=1`.

To leave Test Mode on a device:

```text
https://prodigy-rc-competitions.web.app?testMode=0
```

Event admins can also click `Exit Test Mode` in the Test Mode panel.

## Data Isolation

Production data uses:

```text
artifacts/{appId}/public/data
```

Test Mode uses:

```text
artifacts/{appId}/public/testData
```

All event directory, active-event selection, event documents, result archives, and live-stream placeholder documents are routed through `testData` while Test Mode is enabled.

## Start A Demo Event

1. Open Event Admin in Test Mode.
2. In Race Control, choose a scenario:
   - `Qualifying test`
   - `Bracket battle test`
   - `Twin comp triple elimination`
   - `Twin comp double elimination`
3. Click `Start Demo Event`.

If you click `Start Demo Event` before Test Mode is active, the app turns on `testMode=1`, reloads once, then seeds the selected scenario.

## Reset Demo Data

Click `Reset Demo Data` in Race Control. This wipes the current isolated test state and re-seeds the selected scenario.

## Judge / Spectator / Streamer Testing

Copy role links while Test Mode is enabled. The copied route includes `testMode=1`, so judge, spectator, and streamer windows stay on isolated test data.

Use the `Debug` toggle in Race Control to inspect:

- active event id
- role and view
- current driver/team
- qualifying flow
- judge submissions
- bracket and Twin Comp state

## Seeded Coverage

The demo scenarios include:

- 16-driver qualifying event with live judge scoring
- 16-driver bracket event with qualifying complete and partial bracket progress
- 8-team Twin Comp triple- or double-elimination event with a live round and existing elimination points
- a completed reference event in the test archive

These are intended for rapid repeat QA, not production event records.
