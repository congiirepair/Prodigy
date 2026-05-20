# Index Refactor Map

`index.html` was the single-page app shell plus the main application module. Before this refactor pass it was about 39,188 lines:

- Lines 1-21: document shell, metadata, external CSS links.
- Lines 22-14,337: primary inline CSS.
- Lines 14,340-14,380: route/product polish inline CSS.
- Lines 14,388-15,797: static HTML views, topbar, registration, qualifying, results, website admin, bracket workspace, and modals.
- Lines 15,827-39,186: main browser module.

## Main Module Responsibilities

| Area | Approximate location | Notes |
| --- | --- | --- |
| Client config merge and host normalization | 15,837-15,915 | Pure config helpers; good first extraction target. |
| Constants/enums/storage keys | 15,937-16,182 | Static app constants, route labels, streamer scene metadata, PDF recovery seed data. |
| Event/state model factories | 16,183-17,600 | Event metadata, registration drafts, drivers, venue config, results, qualifying flow, competition state. |
| Judge scoring and battle voting | 17,600-18,900 | Includes local scoring state plus Firestore transactions/scoped writes. High risk. |
| Score/PDF/results helpers | 18,900-20,900 | Mixed pure formatting plus jsPDF side effects. |
| Cloud sync/local storage/Firebase | 21,053-23,900 | Auth, Firestore refs, schema v1 fallback, schema v2 scoped docs, subscriptions. High risk. |
| Routing/SEO/demo route parsing | 24,800-26,200 | Public routes, noindex/canonical handling, demo query state. Medium risk. |
| Registration/check-in UI | 26,500-32,800 | Public/private registration state, public index, QR/geofence check-in. High risk because of privacy split. |
| Results/archive/admin event directory | 32,900-33,800 | Results cards, archive, role/admin access. |
| Event creation/website admin | 33,100-34,200 | Owner/admin UI, role passwords, global metadata. High risk. |
| Event listeners/routing/view switching | 34,100-35,200 | Keyboard, hash routing, click delegation, view switching. |
| Qualifying UI | 35,150-36,590 | Driver table, judge mobile cards, standings, spectator live panels. |
| Bracket UI | 36,594-39,100 | Bracket normalization, rendering, drag/reorder, podium reveal. |
| Final init | 39,180+ | Theme, cache load, initial route/render. |

## Refactor Pass Result

This pass kept the app as plain static Firebase Hosting with browser-native ES modules. No bundler, framework migration, Firestore path change, claim change, or schema behavior change was introduced.

- `index.html` is now the document shell, inline CSS/static markup, CDN script includes, and one module entry include.
- `assets/js/app.js` contains the extracted main browser module that previously lived inline in `index.html`.
- `assets/js/config/clientConfig.js` contains pure client-config merge and host-route normalization helpers.
- `assets/js/utils/dom.js` contains HTML/attribute escaping helpers.
- `assets/js/utils/format.js` contains date, score, distance, and coordinate formatting helpers.

After extraction, `index.html` is about 14,110 lines and the app entry module is about 21,590 lines.

## Module Strategy

The app is a plain static Firebase Hosting app with native browser ES modules. There is no bundler and no build step. The lowest-risk strategy is to keep the external `assets/js/app.js` entry point behaviorally equivalent to the old inline module, then continue extracting focused modules behind stable imports:

- `assets/js/app.js`
- `assets/js/config/clientConfig.js`
- `assets/js/utils/dom.js`
- `assets/js/utils/format.js`

Deferred extractions:

- Firebase/auth/path helpers: defer until there is a narrow adapter seam, because the current code shares many mutable module-scope variables.
- Schema v2 services: defer until Firestore operations can be moved behind small context objects without changing paths or rules behavior.
- View renderers: defer until pure utility extraction is proven and the render functions can accept explicit dependencies instead of reading broad module state.
- Inline CSS/static HTML: leave in place for now to avoid changing visual behavior and test snapshots in the same pass.

## Slice 2 App Module Map

`assets/js/app.js` is now the SPA entry/runtime orchestrator. Before Slice 2 it is about 21,590 lines. The areas relevant to Firebase/auth/data-service extraction are:

| Area | Approximate location | Refactor stance |
| --- | --- | --- |
| Firebase SDK imports | 1-3 | Safe to wrap/re-export through `assets/js/firebase/init.js`; no SDK version or function behavior change. |
| Client config and route constants | 11-247 | Already partly split; leave dynamic client config in `app.js` for now. |
| Event/schema factories | 278-1740 | Mixed pure factories and app state defaults. Leave in `app.js` until view/data services can take explicit context. |
| Judge scoring UI plus sync entry points | 1750-2440 | High-risk workflow. Only move write-adapter internals; keep scoring state/orchestration in `app.js`. |
| Auth/claim state variables | 5170-5171 | `cloudClaimsSnapshot` and `cloudClaimsLoadedAt` remain app state; pure parsing moves to auth helpers. |
| Firebase app initialization | 5220-5240 and 7910-7955 | Initialization can move behind `initializeProdigyFirebase`; auth state callbacks stay in `app.js`. |
| Custom claim parsing/role permission checks | 5597-5732 | Pure role normalization, claim matching, authorization copy, and permission-denied detection are extraction targets. `roleCanUseProductionWrites` remains in `app.js` because it depends on current event/session state. |
| Active event cache/loading | 6665-6810 | Keep in `app.js`; it mixes localStorage, UI state, schema v1 fallback, and initial render behavior. |
| Firestore path builders | 6839-6940 | Good extraction target through a path-helper factory. Must preserve `artifacts/{appId}/public/{data|testData}/...` exactly. |
| Schema v2 public/private doc builders | 6942-7105 | Keep builders in `app.js` for now because they depend on app state and event semantics. |
| Scoped schema v2 writes | 7107-7240 | Extract write adapters into services while keeping payload construction in `app.js`: event shell/private config, registrations, public registration index, drivers, qualifying runs, judge submissions, battle votes, brackets, and public aggregates. |
| Active event selection/global metadata writes | 7290-7320 | Extract write adapter; keep owner/website admin guard and payload building in `app.js`. |
| Schema v2 scoped listeners/read fallback | 7410-7660 | Keep in `app.js` this slice. It mutates in-memory legacy-compatible driver/bracket state. |
| Legacy monolithic event writes/fallback | 7660-7850 | Keep in `app.js`; do not delete or alter schema v1 compatibility. |
| Auth state handling and ID token refresh | 7840-7955 | Keep callback orchestration in `app.js`; move pure Firebase initialization and claim helpers only. |
| Registration/check-in writes | 16239-17025 | Keep UI workflow in `app.js`; scoped private/public-index write adapter is used underneath. |
| Stream Studio state writes/listeners | 14740-15190 | Extract stream state write adapter only. WebRTC/session/listener behavior remains in `app.js`. |
| Results/archive writes | 6300-6312 | Extract archive write adapter; keep archive record building and cache behavior in `app.js`. |
| Event deletion/admin metadata writes | 17759-17831 | Extract delete/global metadata adapters; keep owner gating and local cleanup in `app.js`. |
| Demo/test isolation checks | 78-99, 6839-6852, 9780-10090 | Keep query-state interpretation in `app.js`; move namespace helper without changing demo/test routing. Demo query params remain UI-only and never grant production write access. |
| Browser globals / QA hooks | 23180-21590 tail | Preserve `window.__PRODIGY_QA_NATIVE_STREAM` and all existing test-facing globals exactly. |

### Slice 2 Invariants

- Firestore rules are not modified.
- Schema v2 paths remain unchanged.
- `testData` and `demoEvents` selection remains controlled by the existing `TEST_MODE_ENABLED` / `STANDALONE_DEMO_MODE` state, not by role claims.
- Custom claim names remain `owner`, `websiteAdmin`, `eventAdmin`, `admin`, `judge`, `j1`, `j2`, `j3`, `stream`, `streamer`, and `streamOperator`.
- Frontend role/demo/query state remains a UI affordance only; production writes still require Firebase Auth claims and Firestore rules.

## Slice 2 Refactor Result

Slice 2 extracted focused Firebase/auth/service helpers without changing rule behavior, claim names, schema v2 paths, or legacy fallback:

- `assets/js/firebase/init.js`: Firebase SDK imports, Firebase app/auth/firestore initialization, emulator connection, and SDK function re-exports used by `app.js`.
- `assets/js/firebase/paths.js`: dependency-injected Firestore path helper factory for global metadata, event shells, private config, registrations, public registration index, drivers, qualifying runs, judge submissions, battle votes, brackets, public aggregates, and live stream/session docs.
- `assets/js/firebase/schema.js`: data namespace and event collection selection helpers. `testData` remains driven by test mode; `demoEvents` remains driven by standalone demo mode.
- `assets/js/firebase/errors.js`: permission-denied error detection.
- `assets/js/auth/claims.js`: custom-claim role normalization, global/event-scoped role matching, and authorization message copy.
- `assets/js/auth/session.js`: ID-token claim refresh helper; `app.js` still owns UI side effects after refresh.
- `assets/js/services/firestoreWriteService.js`: write adapters for event shell/private config, registration/private-public index writes, driver docs, bracket/public aggregates, judge submissions, battle votes, stream state, archive metadata, active event metadata, and event deletion.
- `smoke-check.mjs`: now scans `index.html`, `assets/js/app.js`, and all `assets/js/**/*.js` modules so extracted code remains covered by characterization checks.

`assets/js/app.js` remains the runtime orchestrator for route/view rendering, local state mutation, legacy schema fallback, subscriptions, demo state, and QA hooks. Before Slice 2 it was about 21,590 lines; after Slice 2 it is about 21,500 lines, with Firebase/auth/path/write responsibilities moved into modules.

Deferred from Slice 2:

- Full read/listener service extraction, because schema v1 fallback and schema v2 listeners still mutate shared in-memory event state.
- Registration, judge, admin, stream, and results view extraction.
- Backend aggregation for public aggregates.
- Inline CSS/static HTML movement.

## Slice 3 Read/Listener Map

Before Slice 3, `assets/js/app.js` owned all raw Firestore reads and subscriptions:

| Area | Previous location | Behavior/invariant |
| --- | --- | --- |
| Active event shell / legacy event doc | `subscribeToActiveEvent`, around 7470-7505 | Listen to `events/{eventId}` or `demoEvents/{eventId}` depending on demo mode. Apply schema v2 public shell or schema v1 legacy payload through `applyRemoteEventState`. |
| Standalone demo bootstrap read | `bootstrapStandaloneDemoSession`, around 7700 | One-shot event doc read; if missing, publishes current demo state. |
| Event directory metadata | `setupCloudSync`, around 7730 | Listen and one-shot read `meta/eventDirectory`; applies tombstone filtering and local directory merge. |
| Active event selection metadata | `setupCloudSync`, around 7748 | Listen and one-shot read `meta/activeEventSelection`; may switch active event when authoritative selection changes. |
| Results archive metadata | `setupCloudSync`, around 7765 | Listen and one-shot read `meta/resultsArchive`; applies public archive snapshot. |
| Public registration index | `subscribeToScopedEventModel`, around 7450 | Schema v2 collection listener for public-safe registration index only; updates pending registration display data without exposing private fields. |
| Scoped drivers | `subscribeToScopedEventModel`, around 7454 | Schema v2 `drivers` collection listener; merges approved roster docs into local driver state. |
| Scoped judge submissions | `subscribeToScopedEventModel`, around 7458 | Schema v2 `judgeSubmissions` collection listener; applies submitted scores back into local driver score fields. |
| Scoped bracket | `subscribeToScopedEventModel`, around 7462 | Schema v2 `brackets/main` listener; upgrades stored tournament state and preserves legacy-compatible UI state. |
| Public aggregates | `subscribeToScopedEventModel`, around 7468 | Schema v2 `publicAggregates` collection listener; currently only triggers render refresh because app-generated state remains authoritative in this frontend pass. |
| Native stream state | `subscribeToNativeLiveStream`, around 15060 | Listen and one-shot read `liveStreams/{eventId}`; spectator live view connects or disconnects viewer peer based on freshness. |
| Native stream viewer requests | `listenForNativeStreamViewers`, around 14795 | Broadcaster listens to `liveStreams/{eventId}/sessions/{sessionId}/viewers` doc changes. Removal closes peer connections. |
| Native stream viewer doc | `startNativeViewerConnection`, around 15020 | Spectator listens to its viewer signaling doc for offer and broadcaster ICE. |
| Listener cleanup | scattered unsubscribe vars plus `stopScopedEventSubscriptions` | Event-level scoped listeners are stopped before subscribing to another active event. Global metadata listeners are replaced in `setupCloudSync`. Stream listener cleanup remains tied to stream lifecycle. |
| Error handling | listener callbacks | Sync errors mark the topbar status; scoped listener errors log and preserve current UI state; stream errors log or mark stream connection state. |

## Slice 3 Refactor Result

Slice 3 moved low-level read/listener mechanics into focused services while preserving all state application and fallback decisions in `app.js`:

- `assets/js/services/firestoreReadService.js`: central `getDoc`/`onSnapshot` wrapper. Normalizes document snapshots to `{ id, exists, data, snapshot }` and collection snapshots to `{ id, data, snapshot }[]`.
- `assets/js/services/eventReadService.js`: event, directory, active selection, results archive, scoped registration index, scoped drivers, judge submissions, bracket, and public aggregate read/subscription entry points.
- `assets/js/services/streamReadService.js`: native stream state, viewer request collection, and viewer signaling doc subscriptions.
- `assets/js/services/subscriptionRegistry.js`: named subscription replacement/cleanup helper used for scoped event subscriptions.
- `app.js` now calls read/listener services instead of raw `getDoc()` / `onSnapshot()` and keeps applying data through the existing `apply*` functions.

Slice 3 intentionally did not move:

- `applyRemoteEventState`, because it owns schema v1 fallback and schema v2 compatibility merge behavior.
- `applyScopedRegistrationDocs`, `applyScopedDriverDocs`, `applyScopedJudgeSubmissionDocs`, and `applyScopedBracketDoc`, because they mutate shared UI/event state.
- Native WebRTC signaling write behavior.
- Global metadata listener variables; they still preserve the existing one-listener-per-auth-session behavior.

## Slice 4 Data Shaping Map

Before Slice 4, `assets/js/app.js` still owned most data normalization and payload construction. The major areas were:

| Area | Previous location | Behavior/invariant |
| --- | --- | --- |
| Global app state shape | top-level constants/state, around 32-1100 and 5120-5250 | Remains in `app.js`; too tied to UI state and event handlers for this slice. |
| Active event state shape | `createActiveEventState`, `extractEventMeta`, cache load/apply helpers | Schema v1 fallback remains in `app.js`; extraction deferred to avoid changing legacy merge semantics. |
| Schema v1 legacy event normalization | `extractEventMeta`, `applyRemoteEventState`, cache loading | Remains in `app.js`; preserves monolithic event fallback and localStorage compatibility. |
| Schema v2 public shell construction | `buildPublicEventShell` | Extracted pure payload builder while app.js still supplies lifecycle, registration, stream, and bracket context. |
| Schema v2 private config construction | `buildPrivateEventConfig` | Extracted pure payload builder while app.js still supplies normalized roles, venue config, profiles, and judge claim state. |
| Private registration doc construction | `buildScopedRegistrationDoc` | Extracted to registration adapter. Keeps private registration fields only in private scoped docs. |
| Public registration index construction | `buildPublicRegistrationIndexDoc` | Extracted to registration adapter. Keeps public-safe fields: display name, number, team, chassis, team linkage, status, checked-in flag. |
| Public registration index merge | `applyScopedRegistrationDocs` | Public-index-to-pending-registration display mapping extracted; app.js still applies merged state. |
| Driver scoped doc construction | `buildScopedDriverDoc` | Extracted to schema v2 adapter; app.js still owns driver sanitization and roster merge behavior. |
| Scoped driver merge | `applyScopedDriverDocs` | Remains in `app.js`; it uses app-specific driver sanitization and resequencing. |
| Judge submission merge | `applyScopedJudgeSubmissionDocs` | Extracted pure deep-copy score merge helper; app.js still applies state when changed. |
| Battle vote normalization | `publishScopedBattleVote` payload | Remains in `app.js`; close to live battle voting flow and WebRTC-independent but still event-control-sensitive. |
| Bracket state normalization | `applyScopedBracketDoc`, bracket render helpers | Remains in `app.js`; bracket advancement/display rules are complex and UI-coupled. |
| Stream state normalization | `buildNativeStreamStatePayload`, `applyNativeLiveStreamData` | Remains in `app.js`; tied to native WebRTC lifecycle/signaling. |
| Results/archive normalization | `normalizeArchivedResultsRecord`, `buildArchivedResultsRecord` | Remains in `app.js`; tied to event lifecycle and manual result overrides. |
| Public aggregate construction | `buildPublicAggregates` | Payload shape extracted to pure aggregate calculator; app.js still calculates ranked drivers and event results and still controls publishing authority. |
| Qualifying standings calculation | `rankDrivers`, score helpers | Remains in `app.js`; scoring/ranking rules are broad and heavily reused by renderers. Aggregate payload mapping is extracted. |
| Public-safe filtering | public registration index and public aggregates | Registration privacy filtering extracted; aggregate payload builder keeps only display fields for standings. |
| Route/view state mutations | many event handlers/renderers | Remain in `app.js`; view extraction is a later slice. |

## Slice 4 Refactor Result

Slice 4 extracted pure data helpers while preserving runtime orchestration:

- `assets/js/data/schemaV2Adapter.js`: builds schema v2 public event shell payloads, private config payloads, and scoped driver docs.
- `assets/js/data/registrationAdapter.js`: builds private scoped registration docs, public-safe registration index docs, and maps public index docs back into display-safe pending registration records.
- `assets/js/data/judgingAdapter.js`: applies scoped judge submission docs to a copied driver list and reports whether anything changed.
- `assets/js/data/aggregateCalculators.js`: builds public aggregate payloads for live summary, qualifying standings, bracket display, and results summary from values supplied by `app.js`.

`app.js` still owns:

- schema v1 fallback and event-meta extraction,
- listener/write orchestration,
- shared mutable app state,
- UI rendering and route handling,
- native WebRTC lifecycle/signaling,
- score/ranking/bracket advancement rules,
- aggregate publishing authority.

Slice 4 invariants:

- Public registration index helpers do not include private fields such as owner UID, precise location, QR/check-in tokens, private notes, email, or phone.
- Public aggregates remain admin/owner client-generated; only payload construction moved.
- Schema v2 paths, Firestore rules, claim semantics, demo/test behavior, and legacy fallback behavior are unchanged.

## Slice 5 Competition Logic Map

Before Slice 5, `assets/js/app.js` still owned core competition calculations as inline helpers:

| Area | Previous location | Behavior/invariant |
| --- | --- | --- |
| Schema v1 legacy meta normalization | `extractEventMeta` | Converts monolithic event docs into the active event meta shape, including judge mode/count, role names, venue config, pending registrations, role access, judge role claims, and saved results. |
| Qualifying run averages | `getRunAverage`, `getLiveRunAverage` | Uses only active judge roles; completed averages require all active judge submissions, live averages use submitted values so far; category judging sums instead of averaging. Run flags force a zero. |
| Best/secondary score calculation | `getBestScore`, `getSecondaryScore` | Best is max of completed run averages; secondary is second-highest completed run average for tie-breaking. |
| Driver ranking | `rankDrivers` | Normalizes driver state, calculates run 1/run 2/runoff, sorts by best score, secondary score, sign-up position, then original order, and assigns seeds. |
| Bracket seed helpers | `nextPowerOfTwo`, `previousPowerOfTwo`, `getRoundName`, `getBracketSeedOrder` | Produces bracket sizes, labels, and standard seeded order used by classic, SDC, and lower-bracket setup. |
| Battle vote resolution | `getCompetitionDecisionResolution` | Counts judge votes for left/right/OMT, resolves OMT majorities/ties, and in Team Tandem mode totals judge scorecards plus team-size bonus. |
| Battle/bracket mutation | `recordCompetitionJudgeVote`, `recordCompetitionJudgeScorecard`, `handleCompetitionVoteResolution`, `normalizeBracketState` | Remains in `app.js`; these functions mutate tournament state and are coupled to control flow, timers, and rendering. |
| Results baseline and archive shaping | `buildEmptyEventResults`, `normalizeArchivedResultsRecord`, `getArchivedResultsSnapshot`, `buildArchivedResultsRecord`, `sortArchivedResultsForDisplay` | Shapes event result records and public archive sorting while preserving completed/archived ordering. |
| Live result calculation | `buildEventResults` | Remains in `app.js`; it coordinates current app state, Twin Comp state, bracket winners, manual overrides, and lifecycle timestamps. |
| Twin Comp/triple elimination | `normalizeTwinCompState`, `getTwinCompPointCandidates`, `getTwinCompStandings`, `getTwinCompPodiumTeams`, round finalization helpers | Remains in `app.js`; these still mix pure calculations with admin state mutation and UI prompts. |
| Bracket display construction | `getMainBattleFlowEntries`, `getLowerBattleFlowEntries`, render helpers | Flow-entry calculation remains in `app.js` for now because it feeds view rendering and judge-control state. |

## Slice 5 Refactor Result

Slice 5 extracted pure competition helpers while keeping `app.js` as the orchestration and mutation layer:

- `assets/js/data/schemaV1Adapter.js`: normalizes legacy schema v1/missing event payloads into the current event meta shape through dependency injection for local policy helpers.
- `assets/js/competition/scoring.js`: run-key normalization, completed/live run average calculation, best/secondary score helpers, and qualifying ranking/tie-break ordering.
- `assets/js/competition/brackets.js`: bracket power-of-two helpers, round labels, and seeded bracket order.
- `assets/js/competition/battles.js`: battle vote and Team Tandem scorecard resolution.
- `assets/js/competition/results.js`: empty results payload, tournament battle stats, archive record normalization, archive snapshot construction, archive record payload construction, and archive display sorting.

`app.js` still owns:

- schema v1 state application and legacy localStorage fallback,
- route/view rendering,
- shared mutable competition state,
- bracket advancement mutations,
- Twin Comp round mutation and admin confirmation prompts,
- live result calculation from current app state,
- public aggregate publishing authority,
- native WebRTC signaling and overlays,
- QA/global hooks.

Slice 5 invariants:

- Scoring/ranking/tie-break behavior is preserved through wrapper functions with the same call-site names.
- Battle decision resolution still uses active judge roles, OMT majority behavior, and Team Tandem bonus scoring exactly as before.
- Archive display ordering and completed/archived result normalization are preserved.
- No Firestore rules, schema v2 paths, claim names, role semantics, registration privacy behavior, aggregate publishing authority, or WebRTC signaling behavior changed.

## Slice 6 Public Rendering Map

Before Slice 6, low-risk public rendering in `assets/js/app.js` was split between static HTML in `index.html` and DOM/string builders in `app.js`:

| Area | Previous location | Behavior/invariant |
| --- | --- | --- |
| Public homepage DOM updates | `renderLandingView` | Mutates pre-existing landing DOM nodes for hero copy, active event panel, feature cards, Stream Studio sales card, public competition teaser, latest podium, and quick links. Uses only public-safe event state and public route buttons. |
| Public homepage active event panel | `renderLandingView` | Shows active event name/date/registration/live/results status and Live/Register/Results buttons; polished empty state when no active event is active. |
| Public feature cards | `renderLandingView` | Shows Registration & QR Check-In, Live Judging & Qualifying, Competition Brackets, Auto-Switching Stream Layouts, and Results Archive. |
| Public results/archive cards | `buildResultsArchiveMarkup` | Builds public-safe completed/archived result cards with podium snapshot, top qualifier, average best, entries, and public view buttons. |
| Admin/event archive cards | `buildEventArchiveMarkup` | Remains in `app.js`; includes admin-only controls and active event management actions. |
| Privacy page | static `#view-privacy` markup in `index.html` | Contains public privacy notice copy and footer link. No runtime render helper existed before this slice. |
| Public registration/check-in | `renderRegistrationForms`, `renderPendingRegistrationForms`, self-registration helpers | Left in `app.js`; the rendering is intertwined with admin edit permissions, form IDs/selectors, pending approval actions, QR/check-in status, and handler-owned mutable state. |
| Public live view | race-control/native live renderers | Left in `app.js`; tied to native WebRTC state, stream overlays, and live route orchestration. |
| SEO/noindex metadata | `syncSeoMetadata`, descriptor helpers | Left in `app.js`; route metadata is already centralized and touches routing/search-state logic. |
| Route-to-view selection | `switchView`, route parsers | Left in `app.js`; still owns role normalization, protected-route redirects, SEO sync, and QA route behavior. |

Slice 6 extraction plan:

- Move pure landing HTML chunk construction into `assets/js/views/publicHomeView.js`.
- Move privacy page HTML construction into `assets/js/views/privacyView.js` and hydrate the existing privacy container.
- Move public results/archive card construction into `assets/js/views/resultsView.js`.
- Keep event-handler attachment, route orchestration, public live/WebRTC, and public registration/check-in form handling in `app.js`.

## Slice 6 Refactor Result

Slice 6 extracted low-risk public rendering while preserving route orchestration and handlers in `app.js`:

- `assets/js/views/publicHomeView.js`: builds public homepage copy, active event/empty-state panel, feature cards, Stream Studio selling card, public competition teaser, latest podium/empty state, and quick-link buttons.
- `assets/js/views/privacyView.js`: builds the public privacy notice markup used to hydrate `#view-privacy`.
- `assets/js/views/resultsView.js`: builds public results/archive cards with podium snapshot, top qualifier, average best, entries, and public archive navigation actions.
- `smoke-check.mjs`: now checks that the public view modules are present and that homepage/results render helpers do not reference sensitive registration fields.

`app.js` still owns:

- switching routes and syncing SEO/noindex metadata,
- event-handler attachment for public buttons and archive navigation,
- public registration/check-in rendering and submissions,
- protected judge/admin/stream rendering,
- public live/native WebRTC rendering,
- admin archive/event-directory cards,
- schema v1/v2 state application and write orchestration.

Public registration/check-in was intentionally not extracted in Slice 6. Its markup depends on shared form IDs, admin edit permissions, pending approval actions, QR/check-in state, payment/review/rejection status, and submit handlers. Keeping it in `app.js` avoids accidentally exposing private registration fields or breaking mobile check-in behavior during this low-risk public-view slice.

Slice 6 invariants:

- Public homepage still renders only public-safe product/event state and hides role switching, judge inputs, admin controls, Stream Studio controls, diagnostics, and recovery tools.
- Public results/archive cards still render only public result fields and preserve archive ordering supplied by `app.js`.
- Privacy copy is unchanged in substance.
- SEO/noindex helpers remain centralized and unchanged.
- No Firestore rules, schema v2 paths, claim semantics, registration privacy behavior, aggregate publishing authority, scoring/bracket rules, or WebRTC signaling behavior changed.

## Slice 7 SEO/Noindex Map

Before Slice 7, SEO metadata behavior was centralized in `assets/js/app.js`:

| Area | Current behavior |
| --- | --- |
| Public indexable views | `home`, `live`, `self-register` (`/register`), `qualifying`, `bracket` (`/competition`), `results`, and `privacy` are indexable when loaded as clean public/spectator routes with no internal/demo/test query state. |
| Internal noindex views | `registration`, `website-admin`, `self-register-display`, `streamer-dashboard`, `streamer-library`, `streamer-demo`, and `streamer-scene` are noindex. |
| Internal routes | Internal path routes such as `/admin`, `/judge`, `/stream-studio`, `/demo`, `/debug`, and role routes for non-spectators are noindex. |
| Demo/test query state | Search params including `admin`, `streamer`, `testMode`, `seedTest`, `testScenario`, `demoRole`, `demoScenario`, `demoSession`, `demoView`, `demoWindow`, `debug`, and `qaOffline` force noindex. Standalone demo mode and test mode also force noindex. |
| Canonical URLs | Clean public pages canonicalize to `https://{public spectator host}{clean public path}`. Public event-path spectator routes canonicalize to `/events/{eventId}/spectator/...`. Noindex states canonicalize back to the clean public path for the active view. |
| Metadata descriptors | Public views set route-specific title/description for landing, live, register, qualifying, bracket, results, and privacy. Unknown views fall back to the homepage descriptor. |
| DOM metadata mutations | `syncSeoMetadata` sets `document.title`, `meta[name="description"]`, `meta[name="robots"]`, `link[rel="canonical"]`, Open Graph title/description/url, and Twitter title/description. |
| Dependencies | SEO helpers depend on the already-resolved route object, active view name, search params/internal-state detection, production origin, clean public path builder, and event route path builder. They do not read Firestore, auth claims, stream/WebRTC state, registration private fields, or protected view state. |

Slice 7 extraction plan:

- Move metadata descriptors, robots/noindex decision logic, canonical URL construction, and DOM meta setters into `assets/js/routing/seo.js`.
- Keep route parsing, history mutation, clean public path selection, event path construction, role normalization, redirects, and protected view handling in `app.js`.
- Keep `app.js` wrapper function names where useful so existing call sites remain behaviorally stable.

## Slice 7 Refactor Result

Slice 7 extracted metadata-only routing helpers into `assets/js/routing/seo.js`:

- `setMetaContent(doc, nameOrProperty, value)` and `setCanonicalHref(doc, href)` own DOM metadata mutation.
- `getSeoDescriptor(input)` owns public route titles/descriptions.
- `isInternalRouteForSeo(input)` owns the noindex decision once `app.js` has already resolved route/search/demo state.
- `buildSeoCanonicalUrl(input)` owns canonical URL construction from injected production origin and path builders.
- `syncSeoMetadataForRoute(input)` applies title, description, robots, canonical, Open Graph, and Twitter metadata.

`app.js` still owns route parsing, current search param reading, internal query detection, clean public path selection, event path construction, role normalization, redirects, browser history/path mutation, and protected route handling. The old `app.js` helper names remain as thin wrappers so existing call sites and QA hooks keep the same surface.

Slice 7 invariants:

- Public clean routes still receive indexable metadata and clean canonicals.
- Demo/test/internal/protected route states still receive `noindex, nofollow`.
- No Firestore rules, schema v2 paths, claim semantics, registration privacy behavior, aggregate publishing authority, scoring/bracket rules, or WebRTC signaling behavior changed.

## Slice 8 Route-Shell Helper Map

Before Slice 8, route-shell helpers were clustered in `assets/js/app.js` around the routing constants and path builders:

| Area | Current location | Slice 8 decision |
| --- | --- | --- |
| Role route slugs | `ROLE_ROUTE_SLUGS`, `ROLE_ROUTE_LOOKUP` | Pure constants; safe to move to a browser-native routing module. |
| Event route role slugs | `EVENT_ROUTE_ROLE_SLUGS` | Pure constants; safe to move. |
| Public/event route aliases | `EVENT_ROUTE_VIEW_ALIASES` | Pure route alias map; safe to move. |
| Routable public/admin view set | `ROUTABLE_VIEWS` | Pure view-name set used by app route normalization; safe to export as a set. |
| Event route view segment normalization | `normalizeEventRouteViewSegment` | Pure helper; safe to move while keeping an `app.js` wrapper/call surface. |
| Event route path building | `buildEventRoutePath` | Near-pure builder that depends on default-view and role-view normalization. Safe to move behind dependency injection; `app.js` still supplies `activeEventId`, current role, defaults, and role normalization. |
| Clean public path building | `getCleanPublicPathForView` | Pure public-view path map; safe to move. |
| Role route hash building | `buildRoleRouteHash` | Pure-ish, but coupled to role/default-view normalization and direct role links; leave in `app.js` for this slice. |
| Event/role absolute URL builders | `buildEventRouteUrl`, `buildRoleRouteUrl`, `copyRoleRoute`, streamer route URL helpers | Read `window`, configured hosts, test-mode state, and role context; leave in `app.js`. |
| Host-aware routing | `getForcedHostRouteContext`, `HOST_ROUTE_CONTEXTS`, `PUBLIC_ROLE_HOSTNAMES`, `getCanonicalEventHost` | Reads configured host state and/or `window`; leave in `app.js` except constants needed for configured context construction. |
| Route parsing and redirects | `parseRouteFromLocation`, `syncRouteWithState`, route redirect branches | Read location/search/hash, mutate browser URL/history, and make protected-route decisions; leave in `app.js`. |
| Demo/test path helpers | standalone demo route parsing and demo query interpretation | Query/session behavior affects demo isolation; leave in `app.js`. |
| SEO/noindex influence | `syncSeoMetadata` now calls `assets/js/routing/seo.js`; clean path and event path builders feed SEO canonicals. | Keep metadata decisions in `seo.js`; route-shell module only builds paths/normalizes aliases. |

Slice 8 extraction plan:

- Create `assets/js/routing/routes.js` for pure route constants, alias normalization, clean public path mapping, and dependency-injected event path construction.
- Keep `app.js` as the owner of route parsing, redirects, browser history/path mutation, role normalization, protected routing, demo query interpretation, and view rendering.
- Keep existing `app.js` function names as wrappers so current call sites and QA route behavior remain stable.

## Slice 8 Refactor Result

Slice 8 extracted route-shell helpers into `assets/js/routing/routes.js`:

- role/direct-route slug constants: `ROLE_ROUTE_SLUGS`, `ROLE_ROUTE_LOOKUP`,
- event route role slug constants,
- public/event route aliases,
- the routable view set,
- `normalizeEventRouteViewSegment(segment)`,
- `getCleanPublicPathForView(viewName)`,
- small public route label/classification helpers for future slices,
- dependency-injected `buildEventRoutePath(input)`.

`app.js` still owns the route behavior that can affect runtime access or browser state:

- `parseRouteFromLocation`,
- `syncRouteWithState`,
- `getCurrentPageSearchParams`,
- browser history and path mutation,
- redirects,
- role/default-view normalization,
- protected-route decisions,
- demo query interpretation,
- auth/session decisions,
- view rendering and handler wiring.

The `app.js` wrappers for `buildEventRoutePath`, `getCleanPublicPathForView`, and `normalizeEventRouteViewSegment` preserve the old call signatures while delegating the pure work to `routes.js`.

Slice 8 invariants:

- Route parsing, redirects, protected access, demo/query interpretation, and SEO/noindex behavior remain owned by `app.js`.
- Event route paths and clean public paths preserve their existing shapes.
- No Firestore rules, schema v2 paths, claim semantics, registration privacy behavior, aggregate publishing authority, scoring/bracket rules, or WebRTC signaling behavior changed.

## Slice 9 Privacy Rendering Map

Before Slice 9, privacy rendering was already mostly extracted:

| Area | Current location | Behavior/invariant |
| --- | --- | --- |
| Privacy render function | `assets/js/views/privacyView.js` | Returns the public Privacy Notice HTML string. No Firestore, auth, route, SEO, handler, or global state access. |
| Privacy hydration | `renderPrivacyPage` in `assets/js/app.js` | Looks up `#view-privacy` and sets `innerHTML = renderPrivacyView()`. Route/view selection remains in `app.js`. |
| Static privacy markup | `index.html` inside `#view-privacy` | Duplicated the same copy already produced by the module. |
| CSS selectors/classes | `hero hero-simple spectator-only`, `hero-copy-block`, `hero-logo-shell`, `hero-logo`, `eyebrow`, `hero-copy`, `privacy-layout`, `privacy-copy-card`, `public-footer` | Preserved; styles remain in `index.html`. |
| Link wiring | `<a href="/" data-public-route="home">Back to Prodigy RC Comp</a>` | Preserved for existing public-route click handling in `app.js`. |
| Test selectors/text | E2E checks the `Privacy Notice` heading and `body[data-active-view="privacy"]`. | Preserved. |

Privacy copy/sections:

- `Privacy Notice` hero and summary paragraph.
- `Driver And Event Information`.
- `Location For Venue Check-In`.
- `Saved Profiles And Access`.
- `Removal And Archives`.
- footer link back to Prodigy RC Comp.

Slice 9 extraction plan:

- Keep route selection, SEO sync, navigation wiring, and render invocation in `app.js`.
- Keep privacy CSS in `index.html`.
- Leave `#view-privacy` as an empty mount in `index.html` so `assets/js/views/privacyView.js` is the single runtime rendering source.
- Preserve privacy copy exactly apart from extraction whitespace.

## Slice 9 Refactor Result

Slice 9 made `assets/js/views/privacyView.js` the single Privacy page rendering source:

- `renderPrivacyView(options = {})` returns the same Privacy Notice sections and footer link.
- `index.html` now keeps only `<div id="view-privacy" class="view-section"></div>` as the privacy mount.
- `app.js` still owns `renderPrivacyPage`, route-to-view selection, SEO/noindex sync calls, navigation handling, global state, auth/session logic, and all protected views.
- `smoke-check.mjs` now checks that privacy rendering remains isolated/static and does not reference Firestore, auth, claims, DOM globals, or browser globals.

Slice 9 invariants:

- Privacy copy and public route link are preserved.
- The `/privacy` route continues to render through the existing route/view flow.
- SEO/noindex behavior remains unchanged.
- No Firestore rules, schema v2 paths, claim semantics, registration privacy behavior, aggregate publishing authority, scoring/bracket rules, WebRTC behavior, or legacy fallback changed.

## Slice 10 Public Empty-State Map

Before Slice 10, public empty-state rendering was spread across `assets/js/app.js`, public view modules, and static HTML:

| Empty state | Current location | Behavior/coupling |
| --- | --- | --- |
| No active event | `assets/js/views/publicHomeView.js` inside `renderActiveEventPanel` | Static public-safe card; no Firestore/auth/handler coupling once the view model decides there is no active public event. Safe to extract. |
| No latest results/podium | `assets/js/views/publicHomeView.js` inside `renderLatestPodium` | Static public-safe `<div class="empty-state">`; safe to extract. |
| Public live roster empty | `assets/js/app.js` in public event rendering | Static public-safe `<div class="empty-state">No drivers have joined this event yet.</div>` after app state decides the roster is empty. Safe to extract as a render helper. |
| Public live standings empty | `assets/js/app.js` in public event rendering | Static public-safe `<div class="empty-state">Standings will populate after the first scores come in.</div>` after app state decides standings are empty. Safe to extract as a render helper. |
| Public results archive empty | `renderEventDirectory` in `assets/js/app.js` and static `index.html` text | Uses existing container `textContent` plus `empty-state` class. Left in `app.js` to avoid changing container semantics during this slice. |
| Current results showcase empty | `renderCurrentResultsShowcase` in `assets/js/app.js` | Uses existing container `textContent` plus `empty-state` class. Left in `app.js`. |
| Stream offline/not started | Static `index.html` and live WebRTC update logic in `assets/js/app.js` | Coupled to native stream freshness/connection state and text node updates. Left in `app.js`/HTML. |
| Registration unavailable/closed/check-in disabled | `assets/js/app.js` registration/check-in rendering | Coupled to venue config, QR mode, closed-by-qualifying state, pending entries, and form disabling. Left in `app.js`. |
| Public qualifying empty | `renderQualifyingOrder` in `assets/js/app.js` | Mutates DOM nodes, tie panel, and team-tandem branch state. Left in `app.js`. |
| Public bracket empty | Static `#emptyBracketState` in `index.html` plus bracket renderer logic | Coupled to bracket page/admin controls and hidden state. Left in `app.js`/HTML. |

Tests depend on public empty-state text through route smoke/visual coverage rather than narrow selectors. The `/privacy` and public landing tests also verify public pages do not expose protected controls.

Slice 10 extraction plan:

- Create `assets/js/views/publicEmptyStates.js` for render-only public placeholders.
- Extract only static/public-safe snippets that return HTML strings and do not read app state, Firestore, auth, route, SEO, WebRTC, or handlers.
- Keep app/view functions responsible for deciding which empty state to show.

## Slice 10 Refactor Result

Slice 10 extracted repeated public-safe placeholders into `assets/js/views/publicEmptyStates.js`:

- `renderPublicEmptyState(options)`,
- `renderNoActiveEventState()`,
- `renderNoResultsState(options)`,
- `renderNoDriversState(options)`,
- `renderNoStandingsState(options)`,
- small unused-but-ready helpers for stream offline, registration unavailable, and no bracket states.

Current usage:

- `assets/js/views/publicHomeView.js` delegates the no-active-event card and latest-results empty state to `publicEmptyStates.js`.
- `assets/js/app.js` delegates public live roster and standings empty HTML to `publicEmptyStates.js`.

Left in `app.js` intentionally:

- route/view decisions that choose when an empty state appears,
- registration/check-in closed/disabled messages,
- results directory container `textContent` empty states,
- stream/WebRTC connection text updates,
- public qualifying DOM mutation empty states,
- bracket empty state visibility and admin/protected control state.

Slice 10 invariants:

- Empty-state copy is preserved for moved snippets.
- Public empty-state helpers do not read Firestore, auth, route, SEO, WebRTC, browser globals, or app state.
- No Firestore rules, schema v2 paths, claim semantics, registration privacy behavior, aggregate publishing authority, scoring/bracket rules, WebRTC behavior, or legacy fallback changed.

## Slice 11 Public Homepage Map

Before Slice 11, the public homepage was already mostly delegated to `assets/js/views/publicHomeView.js`, but `assets/js/app.js` still called the older `renderPublicHomeViewModel` API name and kept an unreachable legacy inline homepage branch after the active render path returned.

| Homepage area | Current owner after Slice 11 | Behavior/coupling |
| --- | --- | --- |
| Route/view decision | `renderLandingView` in `assets/js/app.js` | Still decides when the home route is rendered. No route parsing, redirect, URL, history, SEO, auth, or role behavior moved. |
| Home data model | `renderLandingView` in `assets/js/app.js` | Still chooses active event, registration/live/results status, driver counts, current battle/driver labels, latest podium data, and public route URLs from current app state. |
| Hero copy | `renderPublicHomeView` in `assets/js/views/publicHomeView.js` | Returns the public-safe eyebrow, headline, and subheadline used to hydrate existing `index.html` nodes. |
| Active event panel | `renderPublicHomeView` in `assets/js/views/publicHomeView.js` | Renders active-event status cards and Live/Register/Results CTAs from the public-safe model, or delegates to `renderNoActiveEventState`. |
| Feature cards | `renderPublicHomeView` in `assets/js/views/publicHomeView.js` | Renders Registration & QR Check-In, Live Judging & Qualifying, Competition Brackets, Auto-Switching Stream Layouts, and Results Archive. |
| Stream Studio sales card | `renderPublicHomeView` in `assets/js/views/publicHomeView.js` | Static marketing/render-only card; no stream controls or WebRTC behavior moved. |
| Competition teaser | `renderPublicHomeView` in `assets/js/views/publicHomeView.js` | Renders public-safe live/current-driver/current-battle/driver-count display from app-provided values only. |
| Latest podium summary | `renderPublicHomeView` in `assets/js/views/publicHomeView.js` | Renders latest public result summary if present, otherwise delegates to `renderNoResultsState`. Results/archive page rendering remains in `app.js`/results modules. |
| Quick links and CTAs | `renderPublicHomeView` in `assets/js/views/publicHomeView.js` | Renders existing public-safe link targets and data attributes. Navigation/event handlers remain in `app.js`. |
| Public-home mount nodes | `index.html` | Existing nodes remain: `landingHeroEyebrow`, `landingHeroTitle`, `landingHeroCopy`, `landingUpcomingEvent`, `landingWhyFeatures`, `landingLiveSnapshot`, `landingFeaturedDrivers`, `landingLatestPodium`, and `landingQuickLinks`. |

Selectors/text to preserve:

- `Run RC drift competitions from registration to podium.`
- `View Live Event`
- `Register Driver`
- `Event Staff Login`
- Public tests continue to verify protected controls such as `.role-switcher`, `#websiteAdminBtn`, `#testModePanel`, score inputs, raw `0 Drivers`, and `Date TBD` are not the homepage impression.

Handlers intentionally left in `app.js`:

- `[data-landing-jump]` smooth-scroll handling.
- `[data-action="open-staff-login"]` staff-login navigation.
- `[data-action="copy-public-event-link"]` public-event link copying.
- all route selection, URL/history mutation, SEO/noindex sync, auth/session checks, and protected-view decisions.

## Slice 11 Refactor Result

Slice 11 finalized the homepage render API without changing runtime behavior:

- `assets/js/views/publicHomeView.js` now exports `renderPublicHomeView(model = {})` as the primary public-home render API.
- `renderPublicHomeViewModel` remains as a compatibility alias to avoid breaking any tests or future imports that still reference the older name.
- `assets/js/app.js` imports and calls `renderPublicHomeView`, while still owning the homepage data model, DOM hydration, route decisions, handlers, SEO calls, Firestore subscriptions, auth/session logic, protected views, and WebRTC UI.
- The unreachable legacy inline homepage block after the current render path was removed from `assets/js/app.js`; it was dead code and was not part of the executed route behavior.
- `smoke-check.mjs` now verifies the new homepage view API, the compatibility alias, and that `app.js` no longer calls the older model-name function.

Slice 11 invariants:

- Homepage copy, CTA destinations, data attributes, and public-safe empty states are preserved.
- Public home still hides admin, judge, stream, recovery, sync, invite/password, and score-editing controls.
- Public home view code does not read Firestore, mutate routes/history, inspect auth/claims, or touch WebRTC.
- No Firestore rules, schema v2 paths, claim semantics, registration privacy behavior, aggregate publishing authority, scoring/bracket rules, SEO/noindex behavior, WebRTC behavior, or legacy fallback changed.
