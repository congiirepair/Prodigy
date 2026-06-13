# Prodigy Event Control Schema v2

Schema v1 is the legacy monolithic event document. Schema v2 keeps the public event shell at `events/{eventId}` and moves role-owned writes into scoped documents.

## Event Creation

New events are created with `schemaVersion: 2`. The public shell contains only safe public fields: event identity, date, lifecycle status, registration status, live status, public flags, timestamps, and sync stamp.

Private event settings live at:

```text
artifacts/{appId}/public/data/events/{eventId}/private/config
```

That document stores judging mode, competition mode, role names/access, venue config, venue profiles, and judge role claims.

## Scoped Writes

- Full driver preregistration/check-in: `events/{eventId}/registrations/{registrationId}`
- Public-safe registration lookup: `events/{eventId}/publicRegistrationIndex/{publicId}`
- Approved roster: `events/{eventId}/drivers/{driverId}`
- Qualifying run metadata: `events/{eventId}/qualifyingRuns/{runId}`
- Judge score submission: `events/{eventId}/judgeSubmissions/{driverId_runKey_judgeSlot}`
- Battle vote/scorecard: `events/{eventId}/battleVotes/{battleId_judgeSlot}`
- Bracket state: `events/{eventId}/brackets/main`
- Public output: `events/{eventId}/publicAggregates/{aggregateId}`

Full registration docs are private to the owning Firebase UID and event admins. The public registration index exists only for roster/check-in search and contains display-safe fields. It must not contain email, phone, precise location, QR secrets, device tokens, `ownerUid`, private notes, or approval/payment internals.

## Public Aggregates

The frontend currently publishes aggregates from trusted event admin/owner sessions:

- `liveSummary`
- `qualifyingStandings`
- `bracketDisplay`
- `resultsSummary`

A backend function can replace this publisher later. Public clients should treat aggregate docs as display output, not as writable truth.

## Claims And Roles

Production writes are enforced by Firebase Auth custom claims:

- Global owner/website admin: `role: "owner"`, `roles: ["owner"]`, `role: "websiteAdmin"`, or `owner: true`
- Event admin: `eventRoles.{eventId}: ["eventAdmin"]` or an equivalent global admin claim
- Judges: `eventRoles.{eventId}: ["j1"]`, `["j2"]`, `["j3"]`, or `["judge"]`
- Stream operator: `eventRoles.{eventId}: ["streamOperator"]`, `["stream"]`, or `["streamer"]`

Local passwords and demo query parameters are UI state only. They do not grant production Firestore writes.

## Backward Compatibility

Existing events with missing `schemaVersion` or `schemaVersion: 1` still render from the legacy event document. The app does not delete legacy fields. Migration should:

1. Read the legacy event document.
2. Write the v2 public shell.
3. Write private config.
4. Expand pending registrations, drivers, judge scores, battle votes, bracket state, and public aggregates into scoped docs.
5. Mark the event migrated without deleting the original legacy document.
6. Verify public, judge, admin, stream, and archive views before removing legacy fallback.

No migration helper should delete the legacy document. A safe helper should default to dry-run, print the scoped docs it would create, and require `--write --yes` for any mutation.

## Rules Tests

Use `npm run test:rules` after installing JDK 21 or newer. Java 8 cannot run the current Firebase emulator.
