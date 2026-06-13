# Prodigy RC Comp Security Checklist

Prodigy Event Control uses scoped Firestore schema v2 for production writes. The legacy schema v1/missing monolithic event document is still readable for compatibility, but new production writes for registration, judging, battle votes, bracket state, public aggregates, private config, and stream state live in role-scoped documents.

## Current Schema Map

| Legacy event field / structure | Current reader | Correct writer | Public/private | Scoped v2 home | Compatibility note |
| --- | --- | --- | --- | --- | --- |
| `id`, `name`, `date`, `status`, `schemaVersion` | Public, staff, stream, results | Event admin/owner | Public | `events/{eventId}` | v2 shell only; v1 remains fallback |
| `registrationStatus`, `liveStatus`, `publicFlags` | Public home/register/live | Event admin/owner | Public | `events/{eventId}` | Derived for public display |
| `judgeCount`, `judgingMode`, `competitionMode` | Admin/judge logic | Event admin/owner | Private config | `events/{eventId}/private/config` | Kept in legacy fallback until migrated |
| `roleNames`, `roleAccess`, invite/password data | Staff/admin UI | Owner/admin | Private | `events/{eventId}/private/config` | Not allowed in public shell |
| `venueConfig`, QR/geofence settings | Register/admin | Event admin/owner | Private except public status | `private/config` plus public status | No venue/check-in secrets in public docs |
| `pendingRegistrations[]` | Registration/check-in/admin | Driver for own pending record; admin for approval | Private driver data | `events/{eventId}/registrations/{registrationId}` | Legacy array fallback only |
| Public registration lookup | Public check-in/search | Driver while open; admin anytime | Public-safe | `events/{eventId}/publicRegistrationIndex/{publicId}` | Contains display fields only |
| Approved `drivers[]` | Public standings/bracket/results/admin | Event admin | Public roster | `events/{eventId}/drivers/{driverId}` | Public read remains intentional |
| Driver approval/payment/admin notes | Admin | Event admin | Private/admin | `registrations/{registrationId}` | Driver cannot self-approve or mark paid |
| Driver `scores.j1/j2/j3` | Live/judge/admin | Assigned judge slot | Public score output | `events/{eventId}/judgeSubmissions/{submissionId}` | Legacy nested score writes deprecated |
| `qualifyingFlow` and run order | Live/judge/admin | Event admin | Public state/admin write | `events/{eventId}/qualifyingRuns/{runId}` and aggregates | Judges submit scores only |
| `bracket`, `twinComp`, `formatMode`, `lowerCount` | Bracket/live/stream/admin | Event admin | Public display/admin write | `events/{eventId}/brackets/main` | Judges vote separately |
| Battle votes/scorecards | Judge/admin/bracket | Assigned judge slot | Public vote state as needed | `events/{eventId}/battleVotes/{voteId}` | Admin advances bracket |
| `results` | Results/archive/public | Event admin/owner | Public | `publicAggregates/resultsSummary`, `meta/resultsArchive` | Archive is admin/owner write |
| Debug/recovery/sync internals | Admin/debug | Admin/owner/system | Private/debug | Private config or omitted | Public shell allows only safe timestamps |

## Scoped Firestore Path Map

| Path | Read policy | Write policy |
| --- | --- | --- |
| `artifacts/{appId}/public/data/meta/eventDirectory` | Public | Owner only |
| `artifacts/{appId}/public/data/meta/activeEventSelection` | Public | Owner only |
| `artifacts/{appId}/public/data/meta/resultsArchive` | Public | Event admin can publish; owner can delete |
| `artifacts/{appId}/public/data/access/{uid}` | Owner or matching user | Owner only |
| `artifacts/{appId}/public/data/events/{eventId}` | Public | Event admin only, validated shell fields only |
| `events/{eventId}/private/config` | Event admin only | Event admin only |
| `events/{eventId}/registrations/{registrationId}` | Event admin or owning Firebase UID | Owner driver while registration is open; admin can manage |
| `events/{eventId}/publicRegistrationIndex/{publicId}` | Public | Signed-in driver only while registration is open, or event admin |
| `events/{eventId}/drivers/{driverId}` | Public roster read | Event admin only |
| `events/{eventId}/qualifyingRuns/{runId}` | Public read | Event admin only |
| `events/{eventId}/judgeSubmissions/{submissionId}` | Public read | Matching judge slot only; admin delete |
| `events/{eventId}/battleVotes/{voteId}` | Public read | Matching judge slot only; admin delete |
| `events/{eventId}/brackets/{bracketId}` | Public read | Event admin only |
| `events/{eventId}/publicAggregates/{aggregateId}` | Public read | Event admin/owner only |
| `artifacts/{appId}/public/data/liveStreams/{eventId}` | Public | Stream operator, event admin, or owner |
| `liveStreams/{eventId}/sessions/{sessionId}/viewers/{viewerId}` | Public signaling read | Signed-in viewer/broadcaster signaling fields only |
| `artifacts/{appId}/public/data/demoEvents/{eventId}` | Signed-in demo users | Signed-in demo users; isolated from production events |
| `artifacts/{appId}/public/testData/**` | Public | Owner, or signed-in users only when `appId` matches a test app id |

## Claim And Role Map

Custom claims are assigned only by a server/admin process. Local role passwords, session storage, and demo query params unlock UI flows, but they do not grant production Firestore writes.

| Claim | Allowed values / shape | Role | Scope | Protected paths |
| --- | --- | --- | --- | --- |
| `role` | `owner`, `websiteAdmin`, `eventAdmin`, `admin`, `judge`, `j1`, `j2`, `j3`, `streamOperator`, `stream`, `streamer` | Single global role | Global | Depends on value |
| `roles` | List of the same values | Multiple global roles | Global | Depends on values |
| `owner: true` | Boolean | Website/admin owner | Global | Global metadata, access docs, cleanup, testData |
| `eventRoles.{eventId}` | List: `eventAdmin`, `admin`, `judge`, `j1`, `j2`, `j3`, `streamOperator`, `stream`, `streamer` | Event staff | Event-scoped | Matching event paths only |
| `demoRole`, `demoScenario`, `demoSession`, `demoView` | Any/query-style state | Demo UI only | None for production | No production write access |

Assignment/revocation is owner/admin operational work through `scripts/manage-claims.mjs` or the Firebase Admin SDK. Client code must never set its own claims. After a claim change, users must refresh their ID token or sign out/in.

## Authorization Matrix

| Audience / role | Production read | Production write |
| --- | --- | --- |
| Public spectator | Public shell, event directory, active selection, results archive, roster/standings/bracket aggregates, stream status, public registration index | None |
| Anonymous preregistering driver | Public reads plus own private registration doc | Own pending registration and public-safe index while registration is open |
| Checked-in driver | Same | Own validated check-in fields only |
| Judge 1/2/3 | Public event/roster/run/bracket reads | Own `judgeSubmissions` and own `battleVotes` only |
| Stream operator | Public reads | `liveStreams/{eventId}` status/layout and signaling only |
| Event admin | Event-scoped public/private reads | Event shell, private config, registrations, drivers, qualifying runs, brackets, public aggregates, archive publish |
| Website/admin owner | All public/admin metadata | Global directory, active event, archive cleanup, access docs, testData |
| Demo/sandbox user | Demo paths | `demoEvents/{eventId}` only |

## Registration Privacy

Full registration records are private to the owning Firebase UID and event admins. The public registration index is the only broadly readable registration lookup surface and must not include email, phone, legal/private notes, precise location, QR secrets/tokens, device tokens, `ownerUid`, approval notes, or internal admin fields.

Current public-safe fields are display name, driver number, team name, chassis, team registration metadata, public status, checked-in boolean, and `updatedAt`. Public index writes are allowed only for signed-in users while registration is open, or for event admins.

## Public Aggregate Trust Model

The app currently trusts event admin/owner clients to publish:

- `publicAggregates/liveSummary`
- `publicAggregates/qualifyingStandings`
- `publicAggregates/bracketDisplay`
- `publicAggregates/resultsSummary`
- `meta/resultsArchive`

Public, driver, judge, and stream roles cannot publish aggregate truth. A malicious or compromised admin can alter aggregates, brackets, and results. The next production hardening step is a backend aggregation function that computes standings/results from scoped judge submissions and battle votes.

## Rules Tests

Run:

```bash
npm run test:rules
```

This executes `firebase emulators:exec --only firestore "node tests/security/firestore-rules.test.mjs"`. Current Firebase emulators require JDK 21 or newer. If `java -version` reports Java 8, tests will not run locally.

Dry-run rules compile:

```bash
firebase deploy --only firestore:rules --dry-run --project prodigy-rc-competitions
```

## Migration And Compatibility

- Schema v1 or missing `schemaVersion`: legacy monolithic event document, readable fallback only.
- Schema v2: public event shell plus scoped subcollections.
- New events are created as schema v2.
- Legacy event data is not deleted.
- Before removing legacy fallback, migrate pending registrations, drivers, judge scores, battle votes, brackets, private config, and public aggregates into scoped docs and verify public, register, judge, admin, stream, and results views.

## Remaining Risks

- Custom claims must be provisioned and revoked operationally for each event.
- Aggregate correctness is admin-client trusted until a backend aggregation function exists.
- Legacy fallback still exists and must remain restricted by rules.
- `testData/**` remains writable only under test-like app IDs or by owners; do not use a production app ID containing `test`.
