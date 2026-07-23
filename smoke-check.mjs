import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const repoRoot = path.dirname(currentFilePath);
const filePath = path.join(repoRoot, "index.html");
const html = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
const clientConfigSource = fs.readFileSync(path.join(repoRoot, "client-config.js"), "utf8");
const firestoreRulesSource = fs.readFileSync(path.join(repoRoot, "firestore.rules"), "utf8");
const firebaseProjectConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, "firebase.json"), "utf8"));
const backendSource = fs.readFileSync(path.join(repoRoot, "functions", "index.js"), "utf8");
const legacyBackendSource = fs.readFileSync(path.join(repoRoot, "functions", "legacy-http.js"), "utf8");
const legacyClientSource = fs.readFileSync(path.join(repoRoot, "assets", "js", "legacy-client-features.js"), "utf8");
const eventSelectionSyncSource = fs.readFileSync(path.join(repoRoot, "assets", "js", "event-selection-sync.js"), "utf8");
const historicalBracketSource = fs.readFileSync(path.join(repoRoot, "assets", "js", "historical-bracket.js"), "utf8");

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
const activeEventCommitSource = sourceBetween("async function commitActiveEventSnapshot", "function publishState()");
const pdfRecoveryCommitSource = sourceBetween("async function commitRound3PdfRestore", "async function restoreRound3FromPdf");
const pdfRecoverySource = sourceBetween("async function restoreRound3FromPdf", "async function createEventRecord");
const eventDeletionCommitSource = sourceBetween("async function commitEventDeletion", "async function deleteEventById");
const eventDeletionSource = sourceBetween("async function deleteEventById", "function applyRoleChange");
const debouncedPublishSource = sourceBetween("function publishState()", "async function publishStateImmediately(");
const immediatePublishSource = sourceBetween("async function publishStateImmediately(", "async function bootstrapStandaloneDemoSession()");
const activeEventSelectionPublishSource = sourceBetween("async function publishActiveEventSelection()", "function resolveRoleForActiveEventSwitch");
const cloudSyncSetupSource = sourceBetween("function setupCloudSync(user)", "// Initialize Database if available");
const onlineRecoverySource = sourceBetween('window.addEventListener("online"', 'window.addEventListener("offline"');
const firebaseAuthInitSource = sourceBetween("const initAuth = async () =>", "async function ensureCloudAuthReady");
const qualifyingJudgeSubmitSource = sourceBetween("async function syncJudgeSubmission", "async function submitCompetitionJudgeVote");
const qualifyingJudgeFailureSource = sourceBetween('console.error("Judge submission sync failed:", error)', "async function submitCompetitionJudgeVote");
const competitionVoteSubmitSource = sourceBetween("async function submitCompetitionJudgeVote", "async function submitCompetitionJudgeScorecard");
const competitionScorecardSubmitSource = sourceBetween("async function submitCompetitionJudgeScorecard", "async function requestCompetitionDecisionReview");
const competitionDecisionSource = sourceBetween("function cancelCompetitionDecisionCountdown", "function getJudgeSubmitButtonLabel");
const competitionDecisionRenderSource = sourceBetween("function syncCompetitionDecisionCountdown", "function renderCompetitionJudgePanel");
const judgeRoleClaimSource = sourceBetween("async function syncJudgeRoleClaimSelection", "async function releaseJudgeRoleClaim");
const competitionVoteRenderSource = sourceBetween("function renderCompetitionJudgePanel()", "function getBracketParticipantSecondaryLine");
const competitionVoteClickSource = sourceBetween('competitionJudgePanel?.addEventListener("click"', 'competitionJudgePanel?.addEventListener("change"');
const bracketFormatChangeSource = sourceBetween('bracketModeSelect.addEventListener("change"', 'registrationToQualifyingBtn.addEventListener("click"');
const competitionModeNavigationSource = sourceBetween("function syncCompetitionModeNavigation()", "function updateEventChrome()");
const openCompetitionBracketSource = sourceBetween("function openCompetitionBracket()", 'bracketModeSelect.addEventListener("change"');
const venueConfigFormSource = sourceBetween("function syncVenueConfigForm(options = {})", "function syncSelfRegisterForm()");
const registrationDraftFormSource = sourceBetween("function syncRegistrationDraftForm()", "function syncVenueConfigForm(options = {})");
const directRegistrationCommitSource = sourceBetween("async function commitDirectRosterRegistration", "function applyDirectRosterRegistrationResult");
const directRegistrationApplySource = sourceBetween("function applyDirectRosterRegistrationResult", "async function submitRegistrationDraft");
const directRegistrationCloudSource = sourceBetween("async function submitDirectRosterRegistrationToCloud", "async function submitRegistrationDraft");
const registrationSubmitSource = sourceBetween("async function submitRegistrationDraft()", "function saveVenueConfigDraft()");
const selfRegistrationCommitSource = sourceBetween("async function commitSelfRegistrationEntries", "function applySelfRegistrationCommitResult");
const selfRegistrationCloudSource = sourceBetween("async function submitSelfRegistrationEntriesToCloud", "async function submitSelfRegistration()");
const selfRegistrationSubmitSource = sourceBetween("async function submitSelfRegistration()", "function buildApprovedRosterDrivers");
const selfRegistrationDeviceSource = sourceBetween("function getSelfRegisterDeviceId()", "function readLastSelfRegisterSubmitMeta()");
const pendingGroupMutationSource = sourceBetween("async function commitPendingRegistrationGroupMutation", "async function markPendingRegistrationNeedsReview");
const qrArrivalSource = sourceBetween("async function confirmSelfRegistrationQrArrival", "async function checkSelfRegistrationLocation");
const geofenceArrivalSource = sourceBetween("async function checkSelfRegistrationLocation", "async function commitSelfRegistrationEntries");
const pendingApprovalSource = sourceBetween("function buildApprovedRosterDrivers", "async function removePendingRegistration");
const pendingApprovalCommitSource = sourceBetween("async function commitPendingRegistrationApproval", "function applyPendingRegistrationCommitResult");
const pendingApprovalApplySource = sourceBetween("function applyPendingRegistrationCommitResult", "async function approvePendingRegistration");
const approvePendingSource = sourceBetween("async function approvePendingRegistration", "async function togglePendingRegistrationPaid");
const paidPendingSource = sourceBetween("async function togglePendingRegistrationPaid", "async function removePendingRegistration");
const removePendingSource = sourceBetween("async function removePendingRegistration", "function buildEventArchiveMarkup");
const openEventSource = sourceBetween("function openEventById", 'eventSelect.addEventListener("change"');
const renderBracketSource = sourceBetween("function renderBracket()", "function updateCompetitionBracketPage()");
const judgeLaneSource = sourceBetween("function renderJudgeLaneCard", "// Driver Table Rendering");
const testScenarioCommitSource = sourceBetween("async function commitTestDemoScenario", "async function seedTestDemoScenario");
const testScenarioSeedSource = sourceBetween("async function seedTestDemoScenario", "async function maybeRunPendingTestScenario");
const pendingTestScenarioSource = sourceBetween("async function maybeRunPendingTestScenario", "function renderPublicEventCameraPreview");
const appBootstrapSource = sourceBetween("async function bootstrapApp()", 'if (typeof window !== "undefined" && ["127.0.0.1", "localhost"].includes(window.location.hostname))');
const activeEventStateApplySource = sourceBetween("function applyActiveEventState", "function setActiveEventIdState");
const nativeStreamLayoutSource = sourceBetween("function resolveNativeStreamLayoutKey", "function getNativeStreamPhaseLabel");
const nativeStreamPhaseSource = sourceBetween("function getNativeStreamPhaseLabel", "function getNativeLiveViewerUrl");
const autoBracketSource = sourceBetween("function maybeAutoBuildBracket", "function syncNetworkStatusIndicator");
const eventFinalizeSource = sourceBetween("async function finalizeCurrentEventResults()", "function syncSelfRegisterProfileCard()");

const checks = [
  {
    name: "completed historical recovery never fabricates a competition bracket",
    test: () => historicalBracketSource.includes('HISTORICAL_BRACKET_UNAVAILABLE = "unavailable"')
      && historicalBracketSource.includes("completedWithoutBracketEvidence")
      && historicalBracketSource.includes("shouldPreserveUnavailableHistoricalBracket")
      && html.includes('id="historicalBracketState"')
      && html.includes("Historical battle bracket unavailable")
      && backendSource.includes('if (action === "repairHistoricalBracketUnavailable")')
      && backendSource.includes("const verifyOnly = data.verifyOnly === true;")
      && backendSource.includes("verify: verification")
      && backendSource.includes("transaction.create(auditDocument")
      && backendSource.includes("bracket: FieldValue.delete()"),
  },
  {
    name: "historical unavailable events block synthetic battle regeneration and stale live battle UI",
    test: () => activeEventStateApplySource.includes("shouldPreserveUnavailableHistoricalBracket(resolvedMeta)")
      && activeEventStateApplySource.includes("? null")
      && autoBracketSource.includes("shouldPreserveUnavailableHistoricalBracket(activeEventMeta)")
      && renderBracketSource.includes("shouldPreserveUnavailableHistoricalBracket(activeEventMeta)")
      && html.includes("const historicalBracketUnavailable = shouldPreserveUnavailableHistoricalBracket(activeEventMeta);")
      && html.includes("if (!historicalBracketUnavailable && tournamentState?.mainBracket?.rounds?.length)")
      && html.includes("getCompetitionFlowEntriesForState(null)")
      && html.includes("Historical bracket details are unavailable for this completed event."),
  },
  {
    name: "browser bundles contain no privileged role credentials",
    test: () => !clientConfigSource.includes("legacyPasswords")
      && !clientConfigSource.includes("CLIENT_SECURITY")
      && !clientConfigSource.includes("passwordHash")
      && !html.includes("function hashSecret")
      && !html.includes("legacyPasswords"),
  },
  {
    name: "production mutations route through the callable authorization backend",
    test: () => html.includes("getFunctions") && html.includes("connectFunctionsEmulator") && html.includes("httpsCallable")
      && activeEventCommitSource.includes('callProdigyAction("commitEventSnapshot"')
      && qualifyingJudgeSubmitSource.includes('callProdigyAction("submitJudgeQualifying"')
      && competitionVoteSubmitSource.includes('callProdigyAction("submitJudgeVote"')
      && competitionScorecardSubmitSource.includes('callProdigyAction("submitJudgeScorecard"')
      && competitionDecisionSource.includes('callProdigyAction("adminCompetitionDecision"')
      && directRegistrationCommitSource.includes('callProdigyAction("adminRegistration"')
      && selfRegistrationCommitSource.includes('callProdigyAction("submitSelfRegistration"')
      && pendingGroupMutationSource.includes('callProdigyAction("adminRegistration"'),
  },
  {
    name: "backend enforces owner, event-admin, and scoped judge claims",
    test: () => backendSource.includes("function requireOwner(request)")
      && backendSource.includes("function requireEventAdmin(request, eventId)")
      && backendSource.includes("function requireJudge(request, eventId, role)")
      && backendSource.includes("MAX_CUSTOM_CLAIMS_BYTES")
      && backendSource.includes("ownerExpiresAt")
      && backendSource.includes("eventRoleVersions")
      && backendSource.includes("assertRoleGrantCurrent")
      && backendSource.includes("candidate.roleAccess = publicRoleAccess(remote.roleAccess || {})")
      && !backendSource.includes('roles.has("owner")')
      && !backendSource.includes('global.has("admin")')
      && backendSource.includes("nextServerSyncStamp")
      && backendSource.includes("upgradeLegacyRoleCredential")
      && backendSource.includes("assertRegistrationShape")
      && backendSource.includes("validateArrivalProof")
      && backendSource.includes("distanceMetersBetween")
      && backendSource.includes("function requireRegistrationDeviceToken(value)")
      && backendSource.includes("deviceToken.length < 8")
      && backendSource.match(/requireRegistrationDeviceToken\(data\.deviceToken\)/g)?.length === 2
      && selfRegistrationDeviceSource.includes("globalThis.crypto?.randomUUID?.()")
      && !backendSource.includes('const source = data.source === "geofence" ? "geofence" : "qr"')
      && backendSource.includes('checkedInAt: null')
      && backendSource.includes("createRolePasswordCredential")
      && backendSource.includes('algorithm: "scrypt-v1"')
      && backendSource.includes('if (action === "commitEventSnapshot")')
      && backendSource.includes('if (action === "submitJudgeVote")')
      && backendSource.includes('if (action === "adminCompetitionDecision")')
      && backendSource.includes('if (action === "submitSelfRegistration")'),
  },
  {
    name: "post-battle decisions use guarded manual and server-deadline timeout transitions",
    test: () => backendSource.includes("async function adminCompetitionDecision(request)")
      && backendSource.includes("requireEventAdmin(request, eventId)")
      && backendSource.includes('data.decision === "timeout"')
      && backendSource.includes("requireAuth(request)")
      && backendSource.includes("expectedAttemptId")
      && backendSource.includes("The competition decision contest window has not expired.")
      && backendSource.includes('if (control.status !== "admin_decision")')
      && backendSource.includes("continueDecision(eventData.bracket")
      && backendSource.includes("reviewDecision(eventData.bracket")
      && competitionDecisionSource.includes("competitionDecisionActionInFlight")
      && competitionDecisionSource.includes("cancelCompetitionDecisionCountdown();")
      && competitionDecisionSource.includes('decision === "timeout"')
      && competitionDecisionSource.includes('decision === "continue" || decision === "timeout"')
      && competitionDecisionRenderSource.includes("competitionDecisionCountdownKey")
      && competitionDecisionRenderSource.includes('performCompetitionDecision("timeout", expectedControl)')
      && competitionVoteSubmitSource.includes("Your first vote is still saving")
      && competitionVoteRenderSource.includes('votingLocked || Boolean(myVote)'),
  },
  {
    name: "winner and OMT reveals expose the 15-second contest window and explicit actions",
    test: () => html.includes("const COMPETITION_RESULT_REVIEW_MS = 15_000;")
      && competitionDecisionRenderSource.includes('decisionType === "omt"')
      && competitionDecisionRenderSource.includes('class="competition-result-reveal')
      && competitionDecisionRenderSource.includes("Contest / Review Result")
      && competitionDecisionRenderSource.includes("Continue Now")
      && competitionDecisionRenderSource.includes('isOmt ? "is-omt" : "is-winner"'),
  },
  {
    name: "Firestore denies direct production-state writes and private reads",
    test: () => firestoreRulesSource.includes("match /artifacts/{appId}/public/data/events/{eventId}")
      && firestoreRulesSource.includes("allow write: if false;")
      && firestoreRulesSource.includes("Role secrets, rate-limit records, and all unrecognized paths are server-only.")
      && firestoreRulesSource.includes("allow read, write: if false;")
      && firestoreRulesSource.includes("viewerId == request.auth.uid")
      && firestoreRulesSource.includes("allow read: if isStreamOperator(appId, eventId)")
      && firestoreRulesSource.includes("ownerExpiresAt")
      && !firestoreRulesSource.includes("request.auth.token.get('role', '') == 'owner'")
      && firestoreRulesSource.includes("hasCurrentScopedRole"),
  },
  {
    name: "Firebase project config includes the Node 22 authorization backend",
    test: () => firebaseProjectConfig.functions?.source === "functions"
      && firebaseProjectConfig.functions?.runtime === "nodejs22",
  },
  {
    name: "Firebase Hosting excludes backend, rules, logs, and local safety backups",
    test: () => {
      const ignored = new Set(firebaseProjectConfig.hosting?.ignore || []);
      return [
        "firestore.rules",
        "firestore-debug.log",
        "functions/**",
        "client-config.backup.*",
        "client-config.revert-safety.*",
        "index.backup.*",
        "index.revert-safety.*",
      ].every((entry) => ignored.has(entry));
    },
  },
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
    name: "atomic event deletion publishes deleted event tombstones",
    test: () => eventDeletionCommitSource.includes("deletedEventIds: nextDeletedEventIds")
      && eventDeletionCommitSource.includes("normalizeDeletedEventIds([...remoteDeletedEventIds, eventId])"),
  },
  {
    name: "deleted events are filtered from merged directory snapshots",
    test: () => html.includes("if (isDeletedEventId(eventId)) return;"),
  },
  {
    name: "delete event removes archived results entry",
    test: () => html.includes("delete archivedResultsDirectory[eventId];")
      && eventDeletionCommitSource.includes("[eventId]: deleteField()"),
  },
  {
    name: "event deletion is atomic, cloud-first, and concurrency safe",
    test: () => eventDeletionCommitSource.includes("await runTransaction(db")
      && eventDeletionCommitSource.includes("transaction.get(directoryRef)")
      && eventDeletionCommitSource.includes("transaction.get(selectionRef)")
      && eventDeletionCommitSource.includes("transaction.delete(getEventDocRef(eventId))")
      && eventDeletionCommitSource.match(/\[eventId\]: deleteField\(\)/g)?.length === 2
      && eventDeletionCommitSource.includes("normalizeDeletedEventIds([...remoteDeletedEventIds, eventId])")
      && eventDeletionCommitSource.includes("remoteSelection?.activeEventId === eventId")
      && eventDeletionCommitSource.includes("if (remoteEvents[eventId] && remainingEventIds.length === 0)")
      && eventDeletionSource.indexOf("await commitEventDeletion") < eventDeletionSource.indexOf("delete eventDirectory[eventId]")
      && eventDeletionSource.includes("!activeEventServerReady || !hasLoadedRemoteDirectory")
      && eventDeletionSource.includes("eventDeletionInFlight.has(eventId)")
      && eventDeletionSource.includes("eventDeletionInFlight.delete(eventId)")
      && eventDeletionSource.includes("Nothing was removed; check the connection and try again.")
      && eventDeletionSource.includes("The event was deleted from the cloud, but this browser could not finish refreshing.")
      && !eventDeletionSource.includes("Promise.all(syncTasks)")
      && !eventDeletionSource.includes("setDoc(getDirectoryDocRef(), directoryPayload)"),
  },
  {
    name: "archived results persist per event without replacing concurrent archives",
    test: () => activeEventCommitSource.includes("archivedResultsChanged || archivedResultRecord !== undefined")
      && activeEventCommitSource.includes("[eventId]: archivedResultsChanged")
      && activeEventCommitSource.includes("? deleteField()")
      && activeEventCommitSource.includes(": normalizeArchivedResultsRecord(archivedResultRecord, eventId)")
      && immediatePublishSource.includes("{ archivedResultRecord = undefined } = {}")
      && immediatePublishSource.includes("archivedResultRecord,")
      && html.includes("publishStateImmediately({ archivedResultRecord: archivedRecord })")
      && !html.includes("async function persistArchivedResultsDirectory()")
      && !html.includes("async function persistArchivedResultRecord(")
      && !html.includes("events: getArchivedResultsSnapshot(),\n          syncStamp:"),
  },
  {
    name: "PDF recovery commits scoped event, directory, and archive updates atomically",
    test: () => pdfRecoveryCommitSource.includes("await runTransaction(db")
      && pdfRecoveryCommitSource.includes("transaction.set(getEventDocRef(eventId)")
      && pdfRecoveryCommitSource.includes("transaction.set(getDirectoryDocRef()")
      && pdfRecoveryCommitSource.includes("[eventId]: cloneEventMeta(eventMeta)")
      && pdfRecoveryCommitSource.includes("[eventId]: deleteField()")
      && pdfRecoveryCommitSource.includes("transaction.set(getArchivedResultsDocRef()")
      && pdfRecoveryCommitSource.includes("[eventId]: normalizeArchivedResultsRecord(archivedRecord, eventId)")
      && pdfRecoveryCommitSource.match(/\{ merge: true \}/g)?.length === 2
      && !pdfRecoveryCommitSource.includes("getActiveEventSelectionDocRef")
      && pdfRecoverySource.includes("!activeEventServerReady || !hasLoadedRemoteDirectory")
      && pdfRecoverySource.indexOf("await commitRound3PdfRestore") < pdfRecoverySource.indexOf("setActiveDriversState(restoredDrivers)")
      && pdfRecoverySource.includes("Nothing was changed in this browser; check the connection and try again.")
      && !pdfRecoverySource.includes("Promise.all([")
      && !pdfRecoverySource.includes("setDoc(getDirectoryDocRef(), directoryPayload)"),
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
      && pendingApprovalSource.includes("if (isTwinTripleMode(eventMeta))")
      && pendingApprovalSource.includes("buildTwinCompRosterDriver({")
      && html.includes("function buildTwinCompRosterDriver(validatedTeam, signUpPosition, source = {})")
      && html.includes("nextDriver.tandemMembers = memberNames")
      && html.includes("index < TEAM_TANDEM_MAX_DRIVERS")
      && html.includes("if (optionalMember) continue;"),
  },
  {
    name: "pending roster approvals merge concurrent authoritative registrations atomically",
    test: () => pendingApprovalCommitSource.includes("await runTransaction(db")
      && pendingApprovalCommitSource.includes("transaction.get(eventRef)")
      && pendingApprovalCommitSource.includes("normalizePendingRegistrationList(remotePayload.pendingRegistrations || [])")
      && pendingApprovalCommitSource.includes("sanitizeLoadedDrivers(remotePayload.drivers || [])")
      && pendingApprovalCommitSource.includes("getPendingRegistrationGroupEntries(entryId, remoteMetaWithPending)")
      && pendingApprovalCommitSource.includes('status: "missing-entry"')
      && pendingApprovalCommitSource.includes("findDuplicateDriverEntry(entry.name")
      && pendingApprovalCommitSource.includes("drivers: remoteDrivers")
      && pendingApprovalCommitSource.includes("nextPendingEntries = remotePendingEntries.filter")
      && pendingApprovalCommitSource.includes("transaction.set(eventRef, eventUpdates, { merge: true })")
      && pendingApprovalCommitSource.includes("transaction.set(getDirectoryDocRef()")
      && pendingApprovalCommitSource.includes("[eventId]: cloneEventMeta(extractEventMeta(nextEventPayload, eventId))")
      && pendingApprovalApplySource.includes("applyRemoteEventState(result.eventPayload)")
      && approvePendingSource.includes("!auth?.currentUser || !activeEventServerReady")
      && approvePendingSource.indexOf("await commitPendingRegistrationApproval(entryId)") < approvePendingSource.indexOf("setActiveDriversState")
      && paidPendingSource.includes("!auth?.currentUser || !activeEventServerReady")
      && paidPendingSource.indexOf("await commitPendingRegistrationApproval(entryId, { markPaid: true })") < paidPendingSource.indexOf("setActiveDriversState")
      && approvePendingSource.includes("Nothing was changed; check the connection and try again.")
      && paidPendingSource.includes("Nothing was changed; check the connection and try again."),
  },
  {
    name: "direct roster registration merges concurrent front-desk submissions atomically",
    test: () => directRegistrationCommitSource.includes("await runTransaction(db")
      && directRegistrationCommitSource.includes("transaction.get(eventRef)")
      && directRegistrationCommitSource.includes("sanitizeLoadedDrivers(remotePayload.drivers || [])")
      && directRegistrationCommitSource.includes("normalizePendingRegistrationList(remotePayload.pendingRegistrations || [])")
      && directRegistrationCommitSource.includes("driver.tandemMembers")
      && directRegistrationCommitSource.includes("findDuplicateDriverEntry(candidateName")
      && directRegistrationCommitSource.includes("drivers: remoteDrivers")
      && directRegistrationCommitSource.includes("const nextPosition = getNextSignUpPosition(remoteDrivers)")
      && directRegistrationCommitSource.includes("transaction.set(eventRef, eventUpdates, { merge: true })")
      && directRegistrationCommitSource.includes("transaction.set(getDirectoryDocRef()")
      && directRegistrationApplySource.includes("applyRemoteEventState(result.eventPayload)")
      && directRegistrationCloudSource.includes("registrationSubmissionInFlight")
      && directRegistrationCloudSource.includes("!auth?.currentUser || !activeEventServerReady")
      && directRegistrationCloudSource.includes("await commitDirectRosterRegistration(candidateDrivers)")
      && directRegistrationCloudSource.includes("if (activeEventId !== submissionEventId) return true")
      && directRegistrationCloudSource.includes("finally")
      && directRegistrationCloudSource.includes("Nothing was changed; check the connection and submit again.")
      && registrationSubmitSource.match(/await submitDirectRosterRegistrationToCloud/g)?.length === 2
      && registrationSubmitSource.indexOf("await submitDirectRosterRegistrationToCloud(nextDrivers)") < registrationSubmitSource.indexOf("setActiveDriversState")
      && registrationDraftFormSource.includes("registrationCanEdit() && !registrationSubmissionInFlight")
      && registrationDraftFormSource.match(/registrationSubmissionInFlight \? "Saving\.\.\."/g)?.length === 2
      && html.includes('registrationEntryForm?.addEventListener("submit", async (e) =>')
      && html.includes("await submitRegistrationDraft()"),
  },
  {
    name: "self-registration merges concurrent phones without replacing pending entries",
    test: () => selfRegistrationCommitSource.includes("await runTransaction(db")
      && selfRegistrationCommitSource.includes("transaction.get(eventRef)")
      && selfRegistrationCommitSource.includes("sanitizeLoadedDrivers(remotePayload.drivers || [])")
      && selfRegistrationCommitSource.includes("normalizePendingRegistrationList(remotePayload.pendingRegistrations || [])")
      && selfRegistrationCommitSource.includes("hasValidVenueConfig(remoteMetaWithPending)")
      && selfRegistrationCommitSource.includes("getSelfRegistrationCloseReason(")
      && selfRegistrationCommitSource.includes("conflictingDeviceEntry")
      && selfRegistrationCommitSource.includes("isTwinTripleMode(remoteMetaWithPending)")
      && selfRegistrationCommitSource.includes("findDuplicateDriverEntry(candidateName")
      && selfRegistrationCommitSource.includes("remotePendingEntries.filter((entry) => !replacementIds.has(entry.id))")
      && selfRegistrationCommitSource.includes("transaction.set(eventRef, eventUpdates, { merge: true })")
      && selfRegistrationCommitSource.includes("transaction.set(getDirectoryDocRef()")
      && selfRegistrationCloudSource.includes("!auth?.currentUser || !activeEventServerReady")
      && selfRegistrationCloudSource.includes("if (selfRegistrationSubmissionInFlight) return false")
      && selfRegistrationCloudSource.includes("selfRegistrationSubmissionInFlight = true")
      && selfRegistrationCloudSource.includes("finally")
      && selfRegistrationCloudSource.includes("Your form is still here; check the connection and submit again.")
      && selfRegistrationSubmitSource.match(/await submitSelfRegistrationEntriesToCloud/g)?.length === 2
      && selfRegistrationSubmitSource.match(/if \(activeEventId !== submissionEventId\) return true/g)?.length === 2
      && !selfRegistrationSubmitSource.includes("await publishStateImmediately()")
      && selfRegistrationSubmitSource.indexOf("await submitSelfRegistrationEntriesToCloud(nextPendingEntries") < selfRegistrationSubmitSource.indexOf("selfRegistrationDraft = createEmptyRegistrationDraft()")
      && html.includes("hasDraftName && !selfRegistrationSubmissionInFlight")
      && html.includes('selfRegistrationSubmissionInFlight\n          ? "Saving..."'),
  },
  {
    name: "pending registration updates merge item-scoped staff and arrival actions atomically",
    test: () => pendingGroupMutationSource.includes("await runTransaction(db")
      && pendingGroupMutationSource.includes("transaction.get(eventRef)")
      && pendingGroupMutationSource.includes("normalizePendingRegistrationList(remotePayload.pendingRegistrations || [])")
      && pendingGroupMutationSource.includes("getPendingRegistrationGroupEntries(entryId, remoteMetaWithPending)")
      && pendingGroupMutationSource.includes('status: "missing-entry"')
      && pendingGroupMutationSource.includes("remotePendingEntries.filter((entry) => !entryIds.has(entry.id))")
      && pendingGroupMutationSource.includes("transaction.set(eventRef, eventUpdates, { merge: true })")
      && pendingGroupMutationSource.includes("transaction.set(getDirectoryDocRef()")
      && pendingGroupMutationSource.includes("applyRemoteEventState(result.eventPayload)")
      && qrArrivalSource.includes("await commitPendingRegistrationGroupMutation(leader.id")
      && qrArrivalSource.includes("if (activeEventId !== arrivalEventId) return true")
      && qrArrivalSource.indexOf("await commitPendingRegistrationGroupMutation(leader.id") < qrArrivalSource.indexOf("setActiveEventMetaState({")
      && geofenceArrivalSource.includes("await commitPendingRegistrationGroupMutation(pendingEntry.id")
      && geofenceArrivalSource.includes("if (activeEventId !== locationEventId)")
      && geofenceArrivalSource.includes("Nothing was changed; check the connection and try again.")
      && removePendingSource.includes("commitPendingRegistrationGroupMutation(entryId, { remove: true })"),
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
      && activeEventSubscriptionSource.includes("createSelectedEventSubscriptionController({")
      && activeEventSubscriptionSource.includes("activeEventSubscriptionController.select(activeEventId, { force: true })")
      && !activeEventSubscriptionSource.includes("getDoc(getEventDocRef"),
  },
  {
    name: "full-state publishes block stale overwrites without ordering client clocks",
    test: () => activeEventCommitSource.includes("await runTransaction(db")
      && activeEventCommitSource.includes("remoteSyncStamp !== Number(expectedSyncStamp || 0)")
      && !activeEventCommitSource.includes("remoteSyncStamp <")
      && activeEventCommitSource.includes("showSyncRecoveryNotice()")
      && activeEventCommitSource.includes("lastRemoteEventSyncStamp = publishSyncStamp")
      && activeEventCommitSource.includes("[eventId]: cloneEventMeta(eventMeta)")
      && activeEventCommitSource.includes("{ merge: true }")
      && debouncedPublishSource.includes("const expectedSyncStamp = lastRemoteEventSyncStamp")
      && debouncedPublishSource.includes("await commitActiveEventSnapshot({")
      && immediatePublishSource.includes("const expectedSyncStamp = lastRemoteEventSyncStamp")
      && immediatePublishSource.includes("return await commitActiveEventSnapshot({")
      && !immediatePublishSource.includes("getActiveEventSelectionDocRef()")
      && immediatePublishSource.includes("if (!db) return true")
      && !html.includes("await publishStateImmediately();")
      && activeEventSubscriptionSource.includes("lastRemoteEventSyncStamp = 0")
      && activeEventSubscriptionSource.includes("clearTimeout(syncTimeout)")
      && activeEventSelectionPublishSource.includes("await runTransaction(db")
      && activeEventSelectionPublishSource.includes("transaction.get(directoryRef)")
      && activeEventSelectionPublishSource.includes("remoteDeletedEventIds.has(selectedEventId)")
      && activeEventSelectionPublishSource.includes("activeEventSelectionPublishQueue.then(executeSelectionPublish)")
      && activeEventSelectionPublishSource.includes("activeEventSelectionPublishQueue = queuedPublish.catch(() => false)")
      && activeEventSelectionPublishSource.includes("requestRevision !== activeEventSelectionRequestRevision")
      && activeEventSelectionPublishSource.includes("if (superseded) return")
      && activeEventSelectionPublishSource.includes("transaction.set(getActiveEventSelectionDocRef()")
      && activeEventSelectionPublishSource.includes("transaction.set(directoryRef")
      && activeEventSelectionPublishSource.includes("activeEventId: selectedEventId")
      && activeEventSelectionPublishSource.includes("lastKnownRemoteActiveEventSelection = normalizeActiveEventSelectionSnapshot(activeEventPayload)")
      && activeEventSelectionPublishSource.indexOf("await runTransaction(db") < activeEventSelectionPublishSource.indexOf("lastKnownRemoteActiveEventSelection =")
      && !activeEventSelectionPublishSource.includes("events: {")
      && !activeEventSelectionPublishSource.includes("Promise.all(["),
  },
  {
    name: "directory and results listeners are authoritative across devices",
    test: () => !directorySnapshotApplySource.includes("nextSyncStamp < lastLocalPush")
      && !directorySnapshotApplySource.includes("nextSyncStamp < lastRemoteDirectorySyncStamp")
      && !activeEventSelectionApplySource.includes("nextSyncStamp < lastLocalPush")
      && !activeEventSelectionApplySource.includes("nextSyncStamp < lastRemoteActiveEventSyncStamp")
      && activeEventSelectionApplySource.includes("isDeletedEventId(nextActiveEventId)")
      && activeEventSelectionApplySource.includes("hasLoadedRemoteDirectory")
      && activeEventSelectionApplySource.includes("!lastRemoteDirectoryEvents[nextActiveEventId]")
      && activeEventSelectionApplySource.indexOf("selectionIsDeleted || selectionMissingFromAuthoritativeDirectory") < activeEventSelectionApplySource.indexOf("eventDirectory[nextActiveEventId] = cloneEventMeta")
      && activeEventSelectionApplySource.includes("saveCachedActiveEventSelection(null)")
      && !archivedResultsApplySource.includes("nextSyncStamp < lastRemoteArchivedResultsSyncStamp")
      && cloudSyncSetupSource.includes("onSnapshot(getDirectoryDocRef()")
      && cloudSyncSetupSource.includes("onSnapshot(getActiveEventSelectionDocRef()")
      && cloudSyncSetupSource.includes("onSnapshot(getArchivedResultsDocRef()")
      && !cloudSyncSetupSource.includes("getDoc(getDirectoryDocRef())")
      && !cloudSyncSetupSource.includes("getDoc(getActiveEventSelectionDocRef())")
      && !cloudSyncSetupSource.includes("getDoc(getArchivedResultsDocRef())")
      && !cloudSyncSetupSource.includes("publishStateImmediately().catch")
      && activeEventSubscriptionSource.includes("if (activeEventServerReady && pendingCloudBootstrapSync)")
      && activeEventSubscriptionSource.includes("showSyncRecoveryNotice()")
      && html.includes('id="syncRecoveryNotice" class="sync-recovery-notice hidden" role="status" aria-live="polite"')
      && html.includes('id="dismissSyncRecoveryNoticeBtn"')
      && !html.includes('window.alert("The connection became ready after your last change.')
      && !onlineRecoverySource.includes("publishStateImmediately()"),
  },
  {
    name: "active-event selection keeps one live pointer and event-scoped metadata",
    test: () => activeEventSelectionApplySource.includes("saveCachedActiveEventSelection(normalizedSelection, { authoritative: true })")
      && activeEventSelectionApplySource.includes("lastRemoteDirectoryEvents[nextActiveEventId]")
      && !directorySnapshotApplySource.includes("saveCachedActiveEventSelection")
      && eventSelectionSyncSource.includes("authoritativeDirectoryLoaded")
      && eventSelectionSyncSource.includes("embeddedEventId === normalizedEventId")
      && eventSelectionSyncSource.includes("subscribedRevision !== revision")
      && backendSource.includes("function activeSelectionPayload(eventId, eventData, syncStamp)")
      && backendSource.includes("if (action === \"restoreMissingEvent\") return restoreMissingEvent(request)")
      && backendSource.includes("transaction.set(selectionRef(appId), activeSelectionPayload(eventId, eventData, syncStamp))"),
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
      && qualifyingJudgeSubmitSource.includes("if (!auth?.currentUser || !activeEventServerReady)")
      && qualifyingJudgeSubmitSource.includes("restoreJudgeSubmissionRollback(rollbackState)")
      && qualifyingJudgeSubmitSource.includes("Cloud sync is not connected yet.")
      && competitionVoteSubmitSource.includes("if (!auth?.currentUser || !activeEventServerReady)")
      && competitionVoteSubmitSource.includes("Wait for Sync Online, then tap again on the latest battle.")
      && competitionScorecardSubmitSource.includes("if (!auth?.currentUser || !activeEventServerReady)")
      && competitionScorecardSubmitSource.includes("Wait for Sync Online, then submit the Team Tandem score again")
      && activeEventSubscriptionSource.includes("activeEventServerReady = false")
      && activeEventSubscriptionSource.includes("includeMetadataChanges: true")
      && activeEventSubscriptionSource.includes("snap.metadata?.fromCache === false")
      && onlineRecoverySource.includes("activeEventServerReady = false")
      && html.includes('statusEl.textContent = "Sync Connecting"')
      && firebaseAuthInitSource.includes('statusEl.textContent = isOfflineMode() ? "Offline Protected" : "Sync Error"')
      && firebaseAuthInitSource.includes('console.error("Firebase auth initialization failed:", error)')
      && judgeRoleClaimSource.includes("if (!auth?.currentUser || !activeEventServerReady)")
      && judgeRoleClaimSource.includes("Wait for Sync Online, then choose your judge assignment again.")
      && judgeRoleClaimSource.includes("if (!options.silent) window.alert(message)")
      && judgeRoleClaimSource.includes("Your judge assignment could not reach the event server")
      && html.includes("syncJudgeRoleClaimSelection(claimedRole, { silent: true })")
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
    name: "website admin event switching preserves the control-room route",
    test: () => openEventSource.includes("const originatingRoute = parseRouteFromLocation()")
      && openEventSource.includes('originatingRoute?.kind === "website-admin"')
      && openEventSource.includes('switchView("website-admin")')
      && openEventSource.indexOf("if (nextView)") < openEventSource.indexOf('originatingRoute?.kind === "website-admin"')
      && openEventSource.includes("const selectionRequestRevision = activeEventSelectionRequestRevision")
      && openEventSource.includes("selectionRequestRevision !== activeEventSelectionRequestRevision")
      && openEventSource.includes("activeEventId !== nextId")
      && openEventSource.includes("setLocalEventPreviewModeState(true)")
      && openEventSource.includes("renderWebsiteAdminSyncDiagnostics()"),
  },
  {
    name: "seeded test scenarios authenticate once and cannot reseed on reload",
    test: () => testScenarioSeedSource.includes("await ensureCloudAuthReady()")
      && testScenarioSeedSource.indexOf("await ensureCloudAuthReady()") < testScenarioSeedSource.indexOf("await commitTestDemoScenario(demo)")
      && !testScenarioSeedSource.includes("publishStateImmediately()")
      && !testScenarioSeedSource.includes("publishActiveEventSelection()")
      && testScenarioSeedSource.includes('nextUrl.searchParams.delete("seedTest")')
      && testScenarioSeedSource.includes("window.history.replaceState")
      && pendingTestScenarioSource.includes("if (seeded) consumeSeedTestQueryParameter()")
      && pendingTestScenarioSource.includes("return seeded;"),
  },
  {
    name: "seeded test scenarios replace stale demo directories atomically",
    test: () => testScenarioCommitSource.includes("await runTransaction(db")
      && testScenarioCommitSource.includes("transaction.get(directoryRef)")
      && testScenarioCommitSource.includes("Object.keys(getRecoveredDirectorySnapshot())")
      && testScenarioCommitSource.includes("new Set([...remoteEventIds, ...locallyRecoveredEventIds])")
      && testScenarioCommitSource.includes("staleEventIds.forEach((eventId) => transaction.delete(getEventDocRef(eventId)))")
      && testScenarioCommitSource.includes("events: seededDirectory")
      && testScenarioCommitSource.includes("transaction.set(getActiveEventSelectionDocRef()")
      && testScenarioCommitSource.includes("transaction.set(getArchivedResultsDocRef()")
      && html.includes('id: "demo-bracket-current"')
      && html.includes('id: "demo-twin-current"')
      && html.includes('id: "demo-qualifying-current"')
      && testScenarioSeedSource.includes("testScenarioSeedInFlight = true")
      && testScenarioSeedSource.includes("const seeded = await commitTestDemoScenario(demo)")
      && testScenarioSeedSource.includes("lastRemoteDirectoryEvents = mergeDirectoryMaps(seeded.directory)")
      && testScenarioSeedSource.includes("testScenarioSeedInFlight = false")
      && testScenarioSeedSource.includes("setupCloudSync(auth.currentUser)")
      && activeEventSubscriptionSource.includes("if (testScenarioSeedInFlight || !snap.exists()) return;")
      && cloudSyncSetupSource.match(/if \(testScenarioSeedInFlight\) return;/g)?.length === 3,
  },
  {
    name: "test mode badge cannot cover admin or spectator content",
    test: () => html.includes('body[data-test-mode="true"][data-role^="j"]::after')
      && !html.includes('body[data-test-mode="true"]::after')
      && html.includes('top: max(6px, env(safe-area-inset-top));'),
  },
  {
    name: "isolated test fixtures unlock judge lanes without weakening production claims",
    test: () => html.includes('if (!TEST_MODE_ENABLED && !STANDALONE_DEMO_MODE) {\n        return cloudClaimsIncludeRole(role, eventId);\n      }')
      && html.includes('if (TEST_MODE_ENABLED) return true;')
      && html.includes("return TEST_MODE_ENABLED ? 'testData' : 'data';"),
  },
  {
    name: "test mode covers Solo, every supported SDC size, Team Tandem, and Twin Comp",
    test: () => html.includes('<option value="sdc8">SDC Top 8 battle test</option>')
      && html.includes('<option value="sdc16">SDC Top 16 battle test</option>')
      && html.includes('<option value="sdc32">SDC Top 32 battle test</option>')
      && html.includes('<option value="team">Team Tandem battle test</option>')
      && html.includes('sdc8: { format: FORMAT_SDC_TOP_8, count: 8')
      && html.includes('sdc16: { format: FORMAT_SDC_TOP_16, count: 16')
      && html.includes('sdc32: { format: FORMAT_SDC_TOP_32, count: 32')
      && html.includes('function buildDemoTeamTandemDrivers(teamCount = 8)'),
  },
  {
    name: "Twin Comp standings keep status and roster text on separate rows",
    test: () => html.includes('class="qualifying-results-simple twin-comp-standings"')
      && html.includes('.twin-comp-standings li {\n      display: block;')
      && html.includes('grid-template-columns: 36px minmax(0, 1fr) auto;')
      && html.includes('.twin-comp-standings .helper-text {'),
  },
  {
    name: "mobile bracket slots can shrink without clipping participant text",
    test: () => html.includes('.slot-button {\n      width: 100%;\n      min-width: 0;')
      && html.includes('.slot-name {\n      display: block;\n      width: 100%;')
      && html.includes('fitTextToAvailableWidth(element, minimumPx);'),
  },
  {
    name: "incomplete historical result summaries render missing scores safely",
    test: () => html.includes('function formatScore(score) {\n      const numericScore = Number(score);\n      return Number.isFinite(numericScore) ? numericScore.toFixed(1) : "-";\n    }')
      && html.includes('Avg field ${formatScore(results.averageBestScore)}'),
  },
  {
    name: "legacy production HTTPS functions remain managed under their existing IDs",
    test: () => backendSource.includes("exports.parseVoiceDeductions = parseVoiceDeductions")
      && backendSource.includes("exports.emailEventResultsSummary = emailEventResultsSummary")
      && legacyBackendSource.includes('defineSecret("GEMINI_API_KEY")')
      && legacyBackendSource.includes('defineSecret("RESEND_API_KEY")')
      && firebaseProjectConfig.hosting.rewrites[0]?.function?.functionId === "parseVoiceDeductions"
      && firebaseProjectConfig.hosting.rewrites[1]?.function?.functionId === "emailEventResultsSummary",
  },
  {
    name: "voice and results email clients retain fallback and non-blocking failure handling",
    test: () => clientConfigSource.includes('endpoint: "/api/parse-voice-deductions"')
      && clientConfigSource.includes('endpoint: "/api/email-event-results"')
      && legacyClientSource.includes("return parseLocally();")
      && html.includes("parseVoiceCommandsWithFallback({")
      && eventFinalizeSource.includes("await emailResultsSummaryForFinalizedEvent(activeEventId)")
      && eventFinalizeSource.includes('console.warn("Results summary email failed to send", error)')
      && eventFinalizeSource.indexOf("await emailResultsSummaryForFinalizedEvent(activeEventId)") < eventFinalizeSource.indexOf('window.alert("Current event results were finalized and saved to the Results tab.")'),
  },
];

const failed = checks.filter((check) => !check.test());

if (failed.length) {
  console.error("Smoke check failed:");
  failed.forEach((check) => console.error(`- ${check.name}`));
  process.exit(1);
}

console.log(`Smoke check passed (${checks.length} checks).`);
