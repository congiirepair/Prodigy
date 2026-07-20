import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const filePath = path.join(path.dirname(currentFilePath), "index.html");
const html = fs.readFileSync(filePath, "utf8");

function sourceBetween(startMarker, endMarker) {
  const startIndex = html.indexOf(startMarker);
  const endIndex = html.indexOf(endMarker, startIndex + startMarker.length);
  if (startIndex < 0 || endIndex < 0) return "";
  return html.slice(startIndex, endIndex);
}

const remoteEventApplySource = sourceBetween("function applyRemoteEventState(data)", "function isJudgeEditingScoreInput()");
const directorySnapshotApplySource = sourceBetween("function applyDirectorySnapshotData(data)", "function applyActiveEventSelectionData(data)");
const activeEventSelectionApplySource = sourceBetween("function applyActiveEventSelectionData(data)", "function applyArchivedResultsSnapshotData(data)");
const archivedResultsApplySource = sourceBetween("function applyArchivedResultsSnapshotData(data)", "function subscribeToActiveEvent()");
const activeEventSubscriptionSource = sourceBetween("function subscribeToActiveEvent()", "function publishState()");
const cloudSyncSetupSource = sourceBetween("function setupCloudSync(user)", "// Initialize Database if available");
const onlineRecoverySource = sourceBetween('window.addEventListener("online"', 'window.addEventListener("offline"');
const qualifyingJudgeSubmitSource = sourceBetween("async function syncJudgeSubmission", "async function submitCompetitionJudgeVote");
const qualifyingJudgeFailureSource = sourceBetween('console.error("Judge submission sync failed:", error)', "async function submitCompetitionJudgeVote");
const competitionVoteSubmitSource = sourceBetween("async function submitCompetitionJudgeVote", "async function submitCompetitionJudgeScorecard");
const competitionScorecardSubmitSource = sourceBetween("async function submitCompetitionJudgeScorecard", "async function requestCompetitionDecisionReview");
const judgeRoleClaimSource = sourceBetween("async function syncJudgeRoleClaimSelection", "async function releaseJudgeRoleClaim");
const competitionVoteRenderSource = sourceBetween("function renderCompetitionJudgePanel()", "function getBracketParticipantSecondaryLine");
const competitionVoteClickSource = sourceBetween('competitionJudgePanel?.addEventListener("click"', 'competitionJudgePanel?.addEventListener("change"');
const bracketFormatChangeSource = sourceBetween('bracketModeSelect.addEventListener("change"', 'registrationToQualifyingBtn.addEventListener("click"');
const competitionModeNavigationSource = sourceBetween("function syncCompetitionModeNavigation()", "function updateEventChrome()");
const openCompetitionBracketSource = sourceBetween("function openCompetitionBracket()", 'bracketModeSelect.addEventListener("change"');
const venueConfigFormSource = sourceBetween("function syncVenueConfigForm(options = {})", "function syncSelfRegisterForm()");
const registrationDraftFormSource = sourceBetween("function syncRegistrationDraftForm()", "function syncVenueConfigForm(options = {})");
const registrationSubmitSource = sourceBetween("function submitRegistrationDraft()", "function saveVenueConfigDraft()");
const pendingApprovalSource = sourceBetween("function buildApprovedRosterDrivers", "async function removePendingRegistration");
const renderBracketSource = sourceBetween("function renderBracket()", "function updateCompetitionBracketPage()");
const judgeLaneSource = sourceBetween("function renderJudgeLaneCard", "// Driver Table Rendering");
const testScenarioSeedSource = sourceBetween("async function seedTestDemoScenario", "async function maybeRunPendingTestScenario");
const pendingTestScenarioSource = sourceBetween("async function maybeRunPendingTestScenario", "function renderPublicEventCameraPreview");
const appBootstrapSource = sourceBetween("async function bootstrapApp()", 'if (typeof window !== "undefined" && ["127.0.0.1", "localhost"].includes(window.location.hostname))');
const activeEventStateApplySource = sourceBetween("function applyActiveEventState", "function setActiveEventIdState");
const nativeStreamLayoutSource = sourceBetween("function resolveNativeStreamLayoutKey", "function getNativeStreamPhaseLabel");
const nativeStreamPhaseSource = sourceBetween("function getNativeStreamPhaseLabel", "function getNativeLiveViewerUrl");
const autoBracketSource = sourceBetween("function maybeAutoBuildBracket", "function syncNetworkStatusIndicator");

const checks = [
  {
    name: "website admin gate exists",
    test: () => html.includes('id="websiteAdminGate"') && html.includes('id="websiteAdminUnlockBtn"'),
  },
  {
    name: "authentication dialogs and inputs expose accessible names",
    test: () => html.includes('id="passwordModal" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="passwordModalTitle" aria-describedby="passwordModalCopy"')
      && html.includes('id="websiteAdminModal" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="websiteAdminModalTitle" aria-describedby="websiteAdminModalCopy"')
      && html.includes('id="authInviteInput" class="invite-code-input" placeholder="Enter invite code..." aria-label="Role invite code"')
      && html.includes('id="passwordInput" placeholder="Enter password..." aria-label="Role password"')
      && html.includes('id="authConfirmInput" class="hidden" placeholder="Confirm password..." aria-label="Confirm role password"')
      && html.includes('id="websiteAdminPasswordInput" placeholder="Enter website admin password..." aria-label="Website admin password"'),
  },
  {
    name: "mobile full-height dialogs do not overflow padded overlays",
    test: () => html.includes('.modal-overlay {\n        align-items: stretch;\n        padding: 0;')
      && !html.includes('.modal {\n        align-items: stretch;\n        padding: 0;'),
  },
  {
    name: "device cache reset tool exists",
    test: () => html.includes("function clearLocalDeviceCaches()") && html.includes('id="websiteAdminClearCacheBtn"'),
  },
  {
    name: "directory sync publishes deleted event tombstones",
    test: () => html.includes("deletedEventIds: getDeletedEventIdsSnapshot()"),
  },
  {
    name: "deleted events are filtered from merged directory snapshots",
    test: () => html.includes("if (isDeletedEventId(eventId)) return;"),
  },
  {
    name: "delete event removes archived results entry",
    test: () => html.includes("delete archivedResultsDirectory[eventId];"),
  },
  {
    name: "renderQueueView no longer carries the dead legacy branch",
    test: () => !html.includes("function renderQueueView() {\r\n      return renderQueueViewV2();\r\n      if (!publicEventSpotlight")
      && !html.includes("function renderQueueView() {\n      return renderQueueViewV2();\n      if (!publicEventSpotlight"),
  },
  {
    name: "missing venue coordinates cannot become a valid 0,0 geofence",
    test: () => html.includes("function hasConfiguredVenueCoordinates(venueConfig = {})")
      && html.includes('if (latitude === null || latitude === undefined || latitude === "") return false;')
      && html.includes('if (longitude === null || longitude === undefined || longitude === "") return false;')
      && html.includes("&& hasConfiguredVenueCoordinates(venueConfig)")
      && !html.includes("Number.isFinite(Number(venueConfig.latitude)) && Number.isFinite(Number(venueConfig.longitude))"),
  },
  {
    name: "new event venue status cannot inherit the active event qualifying phase",
    test: () => venueConfigFormSource.includes('const isCreatingEvent = createEventModalMode === "create"')
      && venueConfigFormSource.includes("isCreatingEvent ? createEmptyQualifyingFlow() : qualifyingFlow")
      && venueConfigFormSource.includes("isCreatingEvent ? [] : appDrivers"),
  },
  {
    name: "blank placeholder drivers cannot consume registration number one",
    test: () => html.includes("function getNextSignUpPosition(drivers) {\n      return getRegisteredDrivers(drivers).reduce"),
  },
  {
    name: "SDC format selection is stored before publish rerenders controls",
    test: () => bracketFormatChangeSource.includes("setActiveEventFormatState(selectedFormat)")
      && bracketFormatChangeSource.includes("setActiveEventLowerCountState(getRequestedSdcMainBracketSize(selectedFormat) || 0)")
      && bracketFormatChangeSource.indexOf("setActiveEventFormatState(selectedFormat)") < bracketFormatChangeSource.indexOf("publishState()"),
  },
  {
    name: "team modes cannot launch with Solo SDC bracket settings",
    test: () => competitionModeNavigationSource.includes('bracketModeSelect?.closest(".search-field")')
      && competitionModeNavigationSource.includes("bracketFormatControl.hidden = teamCompetitionMode")
      && openCompetitionBracketSource.includes("const selectedFormat = teamTandemMode ? FORMAT_CLASSIC")
      && openCompetitionBracketSource.includes("setActiveEventFormatState(selectedFormat)")
      && openCompetitionBracketSource.includes("normalizePreferredFormat(selectedFormat)"),
  },
  {
    name: "Twin Triple registration captures one scored 2-3 driver team",
    test: () => registrationDraftFormSource.includes("const teamMode = isTeamCompetitionMode()")
      && registrationDraftFormSource.includes('twinTripleMode ? "Twin Comp" : "Team Tandem"')
      && registrationSubmitSource.includes("if (isTeamCompetitionMode())")
      && registrationSubmitSource.includes("isTwinTripleMode()")
      && registrationSubmitSource.includes("buildTwinCompRosterDriver(validatedTeam")
      && pendingApprovalSource.includes("if (isTwinTripleMode())")
      && pendingApprovalSource.includes("buildTwinCompRosterDriver({")
      && html.includes("function buildTwinCompRosterDriver(validatedTeam, signUpPosition, source = {})")
      && html.includes("nextDriver.tandemMembers = memberNames")
      && html.includes("index < TEAM_TANDEM_MAX_DRIVERS")
      && html.includes("if (optionalMember) continue;"),
  },
  {
    name: "Twin Triple setup exposes its round controls",
    test: () => html.includes(".battle-flow-panel.twin-comp-flow { display: block !important; }")
      && renderBracketSource.includes('classList.toggle("twin-comp-flow", twinTripleMode)')
      && html.includes('data-action="twin-start-round"'),
  },
  {
    name: "Twin Triple judge lanes identify the team before its members",
    test: () => judgeLaneSource.includes("const twinTripleMode = isTwinTripleMode(activeEventMeta)")
      && judgeLaneSource.includes("twinTripleMode ? driver.name")
      && judgeLaneSource.includes('driver.tandemMembers.join(", ")')
      && judgeLaneSource.includes("twinTripleMode ? nextDriver.name"),
  },
  {
    name: "Twin Comp cannot inherit a Solo bracket or streamer battle layout",
    test: () => activeEventStateApplySource.includes("const resolvedBracket = isTwinTripleMode(resolvedMeta)")
      && activeEventStateApplySource.includes("? null")
      && autoBracketSource.includes("if (isTeamCompetitionMode()) return false;")
      && nativeStreamLayoutSource.includes("if (isTwinTripleMode(eventMeta))")
      && nativeStreamLayoutSource.indexOf("if (isTwinTripleMode(eventMeta))") < nativeStreamLayoutSource.indexOf("getCompetitionFlowEntriesForState(state)")
      && nativeStreamPhaseSource.includes('qualifying: isTwinTripleMode(activeEventMeta) ? "Twin Comp Live" : "Qualifying Live"')
      && !html.includes("QA createTournamentState")
      && !html.includes("new Error().stack"),
  },
  {
    name: "event snapshots are not rejected using cross-device client clocks",
    test: () => remoteEventApplySource.includes("Firestore's document listener is authoritative; always apply its snapshot.")
      && !remoteEventApplySource.includes("nextSyncStamp < lastRemoteEventSyncStamp")
      && activeEventSubscriptionSource.includes("eventDocUnsubscribe = onSnapshot(eventDoc")
      && !activeEventSubscriptionSource.includes("getDoc(eventDoc)"),
  },
  {
    name: "directory and results listeners are authoritative across devices",
    test: () => !directorySnapshotApplySource.includes("nextSyncStamp < lastLocalPush")
      && !directorySnapshotApplySource.includes("nextSyncStamp < lastRemoteDirectorySyncStamp")
      && !activeEventSelectionApplySource.includes("nextSyncStamp < lastLocalPush")
      && !activeEventSelectionApplySource.includes("nextSyncStamp < lastRemoteActiveEventSyncStamp")
      && !archivedResultsApplySource.includes("nextSyncStamp < lastRemoteArchivedResultsSyncStamp")
      && cloudSyncSetupSource.includes("onSnapshot(getDirectoryDocRef()")
      && cloudSyncSetupSource.includes("onSnapshot(getActiveEventSelectionDocRef()")
      && cloudSyncSetupSource.includes("onSnapshot(getArchivedResultsDocRef()")
      && !cloudSyncSetupSource.includes("getDoc(getDirectoryDocRef())")
      && !cloudSyncSetupSource.includes("getDoc(getActiveEventSelectionDocRef())")
      && !cloudSyncSetupSource.includes("getDoc(getArchivedResultsDocRef())")
      && !cloudSyncSetupSource.includes("publishStateImmediately().catch")
      && cloudSyncSetupSource.includes('recoveryNotice?.classList.remove("hidden")')
      && html.includes('id="syncRecoveryNotice" class="sync-recovery-notice hidden" role="status" aria-live="polite"')
      && html.includes('id="dismissSyncRecoveryNoticeBtn"')
      && !html.includes('window.alert("The connection became ready after your last change.')
      && !onlineRecoverySource.includes("publishStateImmediately()"),
  },
  {
    name: "judge transactions cannot overwrite the shared event directory",
    test: () => !html.includes("transaction.set(getDirectoryDocRef(), {\n              events: getPersistableDirectorySnapshot")
      && !qualifyingJudgeSubmitSource.includes("deletedEventIds: getDeletedEventIdsSnapshot()")
      && !competitionVoteSubmitSource.includes("deletedEventIds: getDeletedEventIdsSnapshot()")
      && !competitionScorecardSubmitSource.includes("deletedEventIds: getDeletedEventIdsSnapshot()")
      && qualifyingJudgeSubmitSource.includes("[activeEventId]: cloneEventMeta(updatedMeta)")
      && qualifyingJudgeSubmitSource.includes("if (!eventSnap.exists())")
      && competitionVoteSubmitSource.includes("if (!eventSnap.exists())")
      && competitionScorecardSubmitSource.includes("if (!eventSnap.exists())")
      && judgeRoleClaimSource.includes("missingEvent: true")
      && judgeRoleClaimSource.indexOf("if (!eventSnap.exists())") < judgeRoleClaimSource.indexOf("transaction.set(eventRef"),
  },
  {
    name: "mobile competition votes show immediate feedback and report failures",
    test: () => competitionVoteRenderSource.includes('class="judge-lane-note competition-vote-feedback"')
      && competitionVoteRenderSource.includes("voteSubmissionInFlight")
      && competitionVoteRenderSource.includes("Loading the latest battle...")
      && competitionVoteClickSource.includes("pendingCompetitionVote = {")
      && competitionVoteClickSource.includes("await submitCompetitionJudgeVote")
      && competitionVoteClickSource.includes("pendingCompetitionVote = null")
      && competitionVoteClickSource.indexOf("pendingCompetitionVote = {") < competitionVoteClickSource.indexOf("await submitCompetitionJudgeVote")
      && competitionVoteClickSource.indexOf("pendingCompetitionVote = null") > competitionVoteClickSource.indexOf("await submitCompetitionJudgeVote")
      && competitionVoteClickSource.includes('button.setAttribute("aria-busy", "true")')
      && competitionVoteClickSource.includes("window.alert(voteResult.message)")
      && competitionVoteSubmitSource.includes("setJudgeSubmissionInFlightState(true)")
      && !competitionVoteSubmitSource.includes("judgeSubmissionInFlight = true")
      && competitionVoteSubmitSource.includes("remoteEntryKey !== expectedEntryKey")
      && competitionVoteClickSource.includes("submitCompetitionJudgeVote(voteButton.dataset.side, currentRole, expectedEntryKey)")
      && competitionVoteSubmitSource.includes("applyRemoteEventState(latestRemotePayload)")
      && competitionVoteSubmitSource.includes("This vote was superseded because the battle advanced or voting closed.")
      && !competitionVoteSubmitSource.includes('console.error("Competition judge vote sync failed:", error);\n        return applyLocalVote();'),
  },
  {
    name: "transactional judge submissions fail safely without full-state fallback writes",
    test: () => qualifyingJudgeSubmitSource.includes("remoteRevisionAtSubmit")
      && qualifyingJudgeSubmitSource.includes("applyRemoteEventState(latestRemotePayload)")
      && qualifyingJudgeFailureSource.includes("restoreJudgeSubmissionRollback(rollbackState, remoteRevisionAtSubmit)")
      && !qualifyingJudgeFailureSource.includes("applyRemoteEventState(latestRemotePayload)")
      && qualifyingJudgeSubmitSource.includes("setJudgeSubmissionInFlightState(false)")
      && !qualifyingJudgeSubmitSource.includes('console.error("Judge submission sync failed:", error);\n        publishState();')
      && competitionScorecardSubmitSource.includes("blockedScorecardMessage")
      && competitionScorecardSubmitSource.includes("remoteEntryKey !== expectedEntryKey")
      && competitionVoteClickSource.includes("submitCompetitionJudgeScorecard({ side, score }, currentRole, expectedEntryKey)")
      && competitionScorecardSubmitSource.includes("Your Team Tandem score could not reach the event server")
      && !competitionScorecardSubmitSource.includes("return applyLocalScorecard();\n      } finally")
      && competitionVoteRenderSource.includes("const competitionSubmissionInFlight = judgeSubmissionInFlight")
      && competitionVoteRenderSource.includes('competitionSubmissionInFlight ? \'aria-busy="true"\'')
      && competitionVoteRenderSource.includes('competitionSubmissionInFlight ? "Saving Team Score..."')
      && competitionVoteClickSource.includes('scorecardButton.setAttribute("aria-busy", "true")')
      && competitionVoteClickSource.includes('scorecardButton.textContent = "Saving Team Score..."')
      && competitionVoteClickSource.includes("await submitCompetitionJudgeScorecard"),
  },
  {
    name: "results banner refresh does not call a missing renderer",
    test: () => html.includes("async function saveUpcomingEventBanner(dataUrl)")
      && html.includes("renderEventDirectory();\n      renderLandingView();\n      updateEventChrome();")
      && !html.includes("renderResults();"),
  },
  {
    name: "seeded test scenarios keep their intended route",
    test: () => appBootstrapSource.includes("const seededTestScenario = await maybeRunPendingTestScenario()")
      && appBootstrapSource.includes("Boolean(initialExplicitRoute) && !seededTestScenario")
      && appBootstrapSource.includes("initialExplicitRoute && !seededTestScenario"),
  },
  {
    name: "seeded test scenarios authenticate once and cannot reseed on reload",
    test: () => testScenarioSeedSource.includes("await ensureCloudAuthReady()")
      && testScenarioSeedSource.indexOf("await ensureCloudAuthReady()") < testScenarioSeedSource.indexOf("await publishStateImmediately()")
      && testScenarioSeedSource.includes('nextUrl.searchParams.delete("seedTest")')
      && testScenarioSeedSource.includes("window.history.replaceState")
      && pendingTestScenarioSource.includes("if (seeded) consumeSeedTestQueryParameter()")
      && pendingTestScenarioSource.includes("return seeded;"),
  },
  {
    name: "seeded test scenarios replace stale demo directories atomically",
    test: () => testScenarioSeedSource.includes("testScenarioSeedInFlight = true")
      && testScenarioSeedSource.includes("staleTestEventIds")
      && testScenarioSeedSource.includes("deletedEventIds = new Set([...deletedEventIds, ...staleTestEventIds])")
      && testScenarioSeedSource.includes("lastRemoteDirectoryEvents = {}")
      && testScenarioSeedSource.includes("testScenarioSeedInFlight = false")
      && testScenarioSeedSource.includes("setupCloudSync(auth.currentUser)")
      && activeEventSubscriptionSource.includes("if (testScenarioSeedInFlight) return;")
      && cloudSyncSetupSource.match(/if \(testScenarioSeedInFlight\) return;/g)?.length === 3,
  },
  {
    name: "test mode badge cannot cover admin or spectator content",
    test: () => html.includes('body[data-test-mode="true"][data-role^="j"]::after')
      && !html.includes('body[data-test-mode="true"]::after')
      && html.includes('top: max(6px, env(safe-area-inset-top));'),
  },
  {
    name: "Twin Comp standings keep status and roster text on separate rows",
    test: () => html.includes('class="qualifying-results-simple twin-comp-standings"')
      && html.includes('.twin-comp-standings li {\n      display: block;')
      && html.includes('grid-template-columns: 36px minmax(0, 1fr) auto;')
      && html.includes('.twin-comp-standings .helper-text {'),
  },
];

const failed = checks.filter((check) => !check.test());

if (failed.length) {
  console.error("Smoke check failed:");
  failed.forEach((check) => console.error(`- ${check.name}`));
  process.exit(1);
}

console.log(`Smoke check passed (${checks.length} checks).`);
