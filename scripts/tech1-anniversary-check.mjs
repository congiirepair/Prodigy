#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import admin from "firebase-admin";
import { buildRandomSingleEliminationBracket, applySingleEliminationWinner, getBracketDisplayWindow, getSingleEliminationBracketProjection, getSingleEliminationBracketSize } from "../assets/js/competition/singleElimination.js";
import { TECH1DRIFT_ANNIVERSARY_CONFIG } from "../assets/js/config/specialEvents.js";
import { normalizeCompetitionModeValue, TECH1_ANNIVERSARY_COMPETITION_MODE } from "../assets/js/config/competitionModes.js";
import { normalizeLegacyEventPayload } from "../assets/js/data/schemaV1Adapter.js";
import { buildPrivateEventConfigPayload, buildPublicEventShellPayload } from "../assets/js/data/schemaV2Adapter.js";
import { buildTech1PublicRegistrationIndexDoc, buildTech1RaffleTransactionDoc, buildTech1RegistrationDoc, mergeTech1RegistrationTicketPurchase } from "../assets/js/data/tech1AnniversaryAdapter.js";

const VALID_BRACKET_STATUSES = new Set(["not_generated", "generated", "locked", "in_progress", "complete"]);
const PRIVATE_FIELD_PATTERN = /ownerUid|\bemail\b|\bphone\b|qrToken|checkInToken|checkInSecret|tokenSecret|latitude|longitude|privateNotes|paymentIntent|deviceToken|paidTickets|amountPaid|paymentMethod|staffNotes/i;

function parseArgs(argv) {
  const parsed = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      parsed._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function addCheck(checks, name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail });
}

function buildShellReadiness(shell = null) {
  const checks = [];
  addCheck(checks, "event shell exists", Boolean(shell));
  if (!shell) return checks;
  addCheck(checks, "registrationOpen is boolean", typeof shell.registrationOpen === "boolean", String(shell.registrationOpen));
  addCheck(checks, "raffleTicketPrice is 5", shell.raffleTicketPrice === 5, String(shell.raffleTicketPrice));
  addCheck(checks, "freeTicketsPerRegistration is 1", shell.freeTicketsPerRegistration === 1, String(shell.freeTicketsPerRegistration));
  addCheck(checks, "qualifyingEnabled is false", shell.qualifyingEnabled === false, String(shell.qualifyingEnabled));
  addCheck(checks, "bracketStatus is valid", VALID_BRACKET_STATUSES.has(shell.bracketStatus), String(shell.bracketStatus));
  addCheck(checks, "expectedDrivers is at least 60", Number(shell.expectedDrivers || 0) >= 60, String(shell.expectedDrivers));
  return checks;
}

function runStaticCharacterizationChecks() {
  assert.equal(TECH1DRIFT_ANNIVERSARY_CONFIG.title, "Tech 1 Drift Anniversary Competition");
  assert.equal(TECH1DRIFT_ANNIVERSARY_CONFIG.mode, "tech1-anniversary");
  assert.equal(TECH1DRIFT_ANNIVERSARY_CONFIG.legacySpecialEventMode, "tech1drift-anniversary");
  assert.equal(TECH1DRIFT_ANNIVERSARY_CONFIG.competitionType, "random-single-elimination");
  assert.equal(TECH1DRIFT_ANNIVERSARY_CONFIG.competitionMode, "tech1-anniversary");
  assert.equal(TECH1DRIFT_ANNIVERSARY_CONFIG.raffleTicketPrice, 5);
  assert.equal(TECH1DRIFT_ANNIVERSARY_CONFIG.freeTicketsPerRegistration, 1);
  assert.equal(TECH1DRIFT_ANNIVERSARY_CONFIG.entryFee, 40);
  assert.equal(TECH1DRIFT_ANNIVERSARY_CONFIG.qualifyingEnabled, false);
  assert.equal(TECH1DRIFT_ANNIVERSARY_CONFIG.registrationEnabled, true);
  assert.equal(TECH1DRIFT_ANNIVERSARY_CONFIG.raffleEnabled, true);
  assert.equal(TECH1DRIFT_ANNIVERSARY_CONFIG.bracketGeneration, "randomized-from-competing-drivers");
  assert.equal(TECH1DRIFT_ANNIVERSARY_CONFIG.specialEventId, "tech1drift-anniversary-may-30");
  assert.equal(TECH1DRIFT_ANNIVERSARY_CONFIG.defaultBracketSource, "bracketEligible");
  assert.equal(TECH1DRIFT_ANNIVERSARY_CONFIG.branding.logo, "./assets/tech1drift-vector-transparent.svg");
  assert.equal(TECH1DRIFT_ANNIVERSARY_CONFIG.branding.logoLight, "./assets/tech1drift-vector-transparent-black.svg");
  assert.equal(TECH1DRIFT_ANNIVERSARY_CONFIG.branding.logoDark, "./assets/tech1drift-vector-transparent.svg");

  const registration = buildTech1RegistrationDoc({
    id: "reg-1",
    name: "Driver One",
    teamName: "Team One",
    chassis: "RDX",
    instagram: "driverone",
  }, {
    ownerUid: "driver-uid",
    nowIso: "2026-05-30T10:00:00.000Z",
  });

  assert.equal(registration.freeTickets, 1);
  assert.equal(registration.paidTickets, 0);
  assert.equal(registration.totalTickets, 1);
  assert.equal(registration.amountPaid, 0);
  assert.equal(registration.paymentStatus, "free-only");

  const publicIndex = buildTech1PublicRegistrationIndexDoc(registration);
  assert.deepEqual(Object.keys(publicIndex).sort(), [
    "bracketEligible",
    "bracketSeed",
    "chassis",
    "checkedIn",
    "createdAt",
    "displayName",
    "eventId",
    "instagram",
    "mode",
    "publicId",
    "publicStatus",
    "registrationId",
    "teamName",
    "updatedAt",
  ].sort());
  assert.equal(publicIndex.instagram, "@driverone");
  assert.equal(PRIVATE_FIELD_PATTERN.test(Object.keys(publicIndex).join(" ")), false);

  const transaction = buildTech1RaffleTransactionDoc({
    id: "txn-1",
    registrationId: "reg-1",
    paidTicketsAdded: 4,
    paymentMethod: "cash",
  }, {
    confirmedBy: "staff-uid",
    nowIso: "2026-05-30T11:00:00.000Z",
  });
  const paidRegistration = mergeTech1RegistrationTicketPurchase(registration, transaction);
  assert.equal(transaction.amountPaid, 20);
  assert.equal(paidRegistration.paidTickets, 4);
  assert.equal(paidRegistration.totalTickets, 5);
  assert.equal(paidRegistration.amountPaid, 20);

  assert.equal(getSingleEliminationBracketSize(60), 64);
  assert.equal(getSingleEliminationBracketSize(61), 64);
  assert.equal(getSingleEliminationBracketSize(65), 128);

  [
    [2, 2, 0],
    [3, 4, 1],
    [5, 8, 3],
    [16, 16, 0],
    [17, 32, 15],
    [60, 64, 4],
    [64, 64, 0],
    [65, 128, 63],
    [80, 128, 48],
  ].forEach(([driverCount, bracketSize, byeCount]) => {
    const projection = getSingleEliminationBracketProjection(Array.from({ length: driverCount }, (_, index) => ({
      id: `projection-driver-${index + 1}`,
      name: `Projection Driver ${index + 1}`,
      checkedIn: true,
      bracketEligible: true,
    })), { source: TECH1DRIFT_ANNIVERSARY_CONFIG.defaultBracketSource });
    assert.equal(projection.bracketSize, bracketSize, `${driverCount} driver bracket size`);
    assert.equal(projection.byeCount, byeCount, `${driverCount} driver bye count`);
    assert.equal(projection.blockedReason, "", `${driverCount} driver projection should not be blocked`);
  });

  const registrations = Array.from({ length: 60 }, (_, index) => ({
    id: `driver-${index + 1}`,
    name: `Driver ${index + 1}`,
    checkedIn: true,
    bracketEligible: true,
  }));
  let randomTick = 0;
  const bracket = buildRandomSingleEliminationBracket(registrations, {
    random: () => ((randomTick += 17) % 100) / 100,
    source: TECH1DRIFT_ANNIVERSARY_CONFIG.defaultBracketSource,
    nowIso: "2026-05-30T12:00:00.000Z",
  });
  assert.equal(bracket.status, "generated");
  assert.equal(bracket.driverCount, 60);
  assert.equal(bracket.bracketSize, 64);
  assert.equal(bracket.byes.length, 4);
  assert.equal(bracket.randomizedSeedOrder.length, 60);

  const playableMatch = Object.values(bracket.matches).find((match) => match.driverA && match.driverB && !match.winnerId);
  assert.ok(playableMatch, "expected at least one playable match");
  const advanced = applySingleEliminationWinner(bracket, playableMatch.id, playableMatch.driverA.id, {
    nowIso: "2026-05-30T12:05:00.000Z",
  });
  assert.equal(advanced.matches[playableMatch.id].winnerId, playableMatch.driverA.id);
  assert.equal(advanced.matches[playableMatch.id].resultStatus, "complete");

  const largeRegistrations = Array.from({ length: 80 }, (_, index) => ({
    id: `large-driver-${index + 1}`,
    name: `Large Driver ${index + 1}`,
    checkedIn: true,
    bracketEligible: true,
  }));
  const largeBracket = buildRandomSingleEliminationBracket(largeRegistrations, {
    source: TECH1DRIFT_ANNIVERSARY_CONFIG.defaultBracketSource,
    random: () => 0.42,
    nowIso: "2026-05-30T13:00:00.000Z",
  });
  assert.equal(largeBracket.driverCount, 80);
  assert.equal(largeBracket.bracketSize, 128);
  assert.equal(largeBracket.byes.length, 48);
  const largeSeedOrder = [...largeBracket.randomizedSeedOrder];
  const firstWindow = getBracketDisplayWindow(largeBracket, { pageSize: 32, pageIndex: 0 });
  assert.equal(firstWindow.totalPages, 4);
  assert.equal(firstWindow.startSlot, 1);
  assert.equal(firstWindow.endSlot, 32);
  assert.equal(firstWindow.visibleSlots.length, 32);
  assert.equal(firstWindow.bracketSize, 128);
  assert.equal(firstWindow.byeCount, 48);
  const lastWindow = getBracketDisplayWindow(largeBracket, { pageSize: 32, pageIndex: 3 });
  assert.equal(lastWindow.startSlot, 97);
  assert.equal(lastWindow.endSlot, 128);
  assert.equal(lastWindow.visibleSlots.length, 32);
  getBracketDisplayWindow(largeBracket, { pageSize: 32, pageIndex: 2 });
  assert.deepEqual(largeBracket.randomizedSeedOrder, largeSeedOrder, "display paging must not mutate the stored seed order");
}

function runEventModePersistenceChecks() {
  const eventMeta = {
    id: "tech1-test",
    name: "Tech 1 Drift Anniversary Competition",
    date: "2026-05-30",
    judgeCount: 1,
    judgingMode: "average",
    competitionMode: "tech1-anniversary",
    formatMode: "sdc-top-16",
    lowerCount: "8",
    modeSettings: {
      ...TECH1_ANNIVERSARY_COMPETITION_MODE,
    },
  };
  const publicShell = buildPublicEventShellPayload({ eventMeta, activeEventId: eventMeta.id });
  assert.equal(publicShell.judgeCount, 1);
  assert.equal(publicShell.judgingMode, "average");
  assert.equal(publicShell.competitionMode, "tech1-anniversary");
  assert.equal(publicShell.modeSettings?.mode, "tech1-anniversary");
  assert.equal(publicShell.modeSettings?.specialEventId, "tech1drift-anniversary-may-30");
  assert.equal(publicShell.formatMode, "sdc-top-16");
  assert.equal(publicShell.lowerCount, "8");
  const privateConfig = buildPrivateEventConfigPayload({
    eventMeta,
    activeEventId: eventMeta.id,
    competitionMode: normalizeCompetitionModeValue(eventMeta.competitionMode),
  });
  assert.equal(privateConfig.competitionMode, "tech1-anniversary");
  assert.equal(privateConfig.modeSettings?.mode, "tech1-anniversary");
  assert.equal(privateConfig.specialEventId, "tech1drift-anniversary-may-30");
  const normalizedPublicShell = normalizeLegacyEventPayload(publicShell, {
    activeEventId: eventMeta.id,
    normalizeJudgingMode: (value) => value || "average",
    normalizeJudgeCountForMode: (value) => Number(value || 3),
    normalizeCompetitionMode: normalizeCompetitionModeValue,
    normalizeEventBannerSource: (value) => value || null,
    buildDefaultRoleNames: (value) => value || {},
    createDefaultVenueConfig: (value) => value || {},
    normalizeVenueProfileList: (value) => Array.isArray(value) ? value : [],
    normalizePendingRegistrationList: (value) => Array.isArray(value) ? value : [],
    getSanitizedJudgeRoleClaims: () => ({}),
    buildEmptyEventResults: () => ({}),
  });
  assert.equal(normalizedPublicShell.competitionMode, "tech1-anniversary");
  assert.equal(normalizedPublicShell.judgeCount, 1, "public event shell must preserve 1-judge mode for judge devices");
  assert.equal(normalizedPublicShell.judgingMode, "average");
  assert.equal(normalizedPublicShell.modeSettings?.mode, "tech1-anniversary");
  assert.equal(normalizedPublicShell.specialEventId, "tech1drift-anniversary-may-30");
  const normalizedMixedSnapshot = normalizeLegacyEventPayload({
    ...publicShell,
    competitionMode: "solo",
    modeSettings: { mode: "tech1-anniversary", specialEventId: "tech1drift-anniversary-may-30" },
  }, {
    activeEventId: eventMeta.id,
    normalizeJudgingMode: (value) => value || "average",
    normalizeJudgeCountForMode: (value) => Number(value || 3),
    normalizeCompetitionMode: normalizeCompetitionModeValue,
    normalizeEventBannerSource: (value) => value || null,
    buildDefaultRoleNames: (value) => value || {},
    createDefaultVenueConfig: (value) => value || {},
    normalizeVenueProfileList: (value) => Array.isArray(value) ? value : [],
    normalizePendingRegistrationList: (value) => Array.isArray(value) ? value : [],
    getSanitizedJudgeRoleClaims: () => ({}),
    buildEmptyEventResults: () => ({}),
  });
  assert.equal(normalizedMixedSnapshot.competitionMode, "tech1-anniversary", "Tech 1 mode settings must beat a stale solo value");
}

function runRepoReadinessChecks() {
  const checks = [];
  const rules = fs.readFileSync("firestore.rules", "utf8");
  const docsExists = fs.existsSync("docs/TECH1_DRIFT_ANNIVERSARY_MODE.md");
  const modeSource = fs.readFileSync("assets/js/config/competitionModes.js", "utf8");
  const adapterSource = fs.readFileSync("assets/js/data/tech1AnniversaryAdapter.js", "utf8");
  const appSource = fs.readFileSync("assets/js/app.js", "utf8");
  const indexSource = fs.readFileSync("index.html", "utf8");
  const routesSource = fs.readFileSync("assets/js/routing/routes.js", "utf8");
  const packageSource = fs.readFileSync("package.json", "utf8");
  const e2eSource = fs.existsSync("tests/e2e/tech1-anniversary.spec.js") ? fs.readFileSync("tests/e2e/tech1-anniversary.spec.js", "utf8") : "";
  addCheck(checks, "standalone public Tech 1 route is removed", !routesSource.includes('tech1: "/tech1"') && !indexSource.includes('data-target="tech1"') && !indexSource.includes('id="view-tech1"') && e2eSource.includes("does not expose a standalone public Tech 1 page"));
  addCheck(checks, "event-day runbook exists", docsExists);
  addCheck(checks, "init package script exists", packageSource.includes('"tech1:init"'));
  addCheck(checks, "readiness package script exists", packageSource.includes('"tech1:check"'));
  addCheck(checks, "dry-run package script exists", packageSource.includes('"tech1:dry-run"'));
  const tech1ViewSource = fs.readFileSync("assets/js/views/tech1DriftView.js", "utf8");
  addCheck(checks, "Tech 1 competition mode definition exists", modeSource.includes('mode: COMPETITION_MODE_TECH1_ANNIVERSARY') && modeSource.includes('bracketGeneration: "randomized-from-competing-drivers"') && modeSource.includes('defaultBracketSource: "bracketEligible"') && modeSource.includes('specialEventId: "tech1drift-anniversary-may-30"'));
  addCheck(checks, "Tech 1 branding asset is wired for event-control mode", fs.existsSync("assets/tech1drift-vector-transparent.svg") && fs.existsSync("assets/tech1drift-vector-transparent-black.svg") && appSource.includes("renderTech1EventControlWorkflow") && tech1ViewSource.includes("tech1-brand-mark"));
  addCheck(checks, "event setup exposes Tech 1 as a competition mode", indexSource.includes('value="tech1-anniversary"') && appSource.includes("getCompetitionModeSettings"));
  addCheck(
    checks,
    "app module cache bust is current",
    /app\.js\?v=20\d{6}-tech1-vs-fix-v\d+/i.test(indexSource),
  );
  addCheck(checks, "hosting does not pin local JS for one year", fs.readFileSync("firebase.json", "utf8").includes('"source": "**/*.js"') && !fs.readFileSync("firebase.json", "utf8").includes('css|js|woff'));
  addCheck(checks, "event-control Tech 1 registration desk exists", indexSource.includes("tech1EventControlPanel") && appSource.includes("renderTech1EventControlWorkflow") && appSource.includes("registerTech1DriverAtDesk") && tech1ViewSource.includes("Tech 1 Drift Anniversary Registration Desk"));
  addCheck(checks, "browser-unlocked event admin can manage Tech 1 desk", appSource.includes("if (isEventAdminBrowserUnlocked()) return true") && appSource.includes("upsertTech1EntryById"));
  addCheck(checks, "event-admin browser unlock persists across event changes", appSource.includes("EVENT_ADMIN_BROWSER_UNLOCK_KEY") && appSource.includes("isEventAdminBrowserUnlocked") && appSource.includes("setEventAdminBrowserUnlocked(true)") && appSource.includes("isBrowserPersistentEventAdminRole(role) && isEventAdminBrowserUnlocked()"));
  addCheck(checks, "legacy per-event admin unlock hydrates browser unlock", appSource.includes("hydrateEventAdminBrowserUnlockFromExistingSessions") && appSource.includes("hasAnyStoredEventAdminUnlock") && appSource.includes("hydrateEventAdminBrowserUnlockFromExistingSessions();"));
  addCheck(checks, "browser-unlocked event admin suppresses stale role alerts", appSource.includes('statusEl.textContent = "Event Admin Unlocked"') && appSource.includes("if (locallyUnlocked)") && appSource.includes("return;"));
  addCheck(checks, "Tech 1 hides normal competition format selector", appSource.includes("showBracketFormatSelector = !tech1Mode") && appSource.includes("bracketModeField.hidden") && appSource.includes("bracketModeToolbar.hidden"));
  addCheck(checks, "Tech 1 desk save supports click and Enter", appSource.includes('action === "save-desk-driver"') && appSource.includes('event.key !== "Enter"') && tech1ViewSource.includes('data-tech1-action="save-desk-driver"'));
  addCheck(checks, "event data cloud sync is enabled for event-day multi-device use", appSource.includes("const LOCAL_EVENT_DATA_MODE = false") && appSource.includes("const TECH1_LOCAL_FIRST_MODE = false") && appSource.includes('scopedEventSubscriptions.replace("judgeSubmissions"'));
  addCheck(checks, "browser-unlocked event admin can use production writes", appSource.includes("isBrowserPersistentEventAdminRole(role) && isEventAdminBrowserUnlocked()"));
  addCheck(checks, "Tech 1 bracket display pager exists", appSource.includes("setTech1BracketDisplayPage") && tech1ViewSource.includes("getBracketDisplayWindow") && indexSource.includes("tech1-bracket-pager"));
  addCheck(checks, "Tech 1 final winner reveal is gated", appSource.includes("function revealTech1Winner()") && tech1ViewSource.includes("Reveal Final Winner") && tech1ViewSource.includes("Winner reveal is pending") && rules.includes("'winnerRevealStatus'"));
  addCheck(checks, "50-driver event-admin dry run is covered", fs.readFileSync("scripts/tech1-dry-run.mjs", "utf8").includes("driverCount === 50") && e2eSource.includes("simulates 50 event-admin desk drivers"));
  addCheck(checks, "rules contain specialEvents protections", rules.includes("/specialEvents/{eventId}") && rules.includes("validTech1PublicRegistrationCreate"));
  addCheck(checks, "event-day cloud rules allow signed-in app sessions", rules.includes("function eventDayOpenAccess()") && rules.includes("match /artifacts/{appId}/public/data/{document=**}") && rules.includes("allow read, write: if eventDayOpenAccess();"));
  addCheck(checks, "rules accept current and legacy Tech 1 mode ids", rules.includes("isTech1AnniversaryMode") && rules.includes("'tech1-anniversary'") && rules.includes("'tech1drift-anniversary'"));
  addCheck(checks, "rules allow public event shell mode metadata", rules.includes("'competitionMode'") && rules.includes("'modeSettings'") && rules.includes("'specialEventId'") && rules.includes("'judgeCount'") && rules.includes("'judgingMode'") && rules.includes("request.resource.data.modeSettings.specialEventId == 'tech1drift-anniversary-may-30'"));
  const publicIndexFunction = adapterSource.slice(
    adapterSource.indexOf("export function buildTech1PublicRegistrationIndexDoc"),
    adapterSource.indexOf("export function buildTech1RaffleTransactionDoc"),
  );
  addCheck(checks, "public registration index excludes private payment fields", !PRIVATE_FIELD_PATTERN.test(publicIndexFunction));
  addCheck(checks, "public route regression test confirms Tech 1 controls are not exposed", e2eSource.includes("does not expose a standalone public Tech 1 page") && e2eSource.includes("#tech1RaffleForm") && e2eSource.includes("toHaveCount(0)"));
  addCheck(checks, "staff export function exists", appSource.includes("function exportTech1Csv()"));
  addCheck(checks, "staff PDF export function exists", (appSource.includes("function exportTech1Pdf()") || appSource.includes("async function exportTech1Pdf()")) && tech1ViewSource.includes("Export Raffle PDF"));
  addCheck(checks, "staff export includes reconciliation fields", ["Bracket Eligible", "Payment Method", "Staff Notes", "Total money collected"].every((field) => appSource.includes(field)));
  addCheck(checks, "Tech 1 registration is managed through the event-admin desk", appSource.includes("registerTech1DriverAtDesk") && tech1ViewSource.includes("Save Driver At Desk"));
  addCheck(checks, "event-day cloud sync mode is documented", docsExists && fs.readFileSync("docs/TECH1_DRIFT_ANNIVERSARY_MODE.md", "utf8").includes("event-day cloud sync"));
  return checks;
}

async function runRemoteReadinessChecks(args) {
  const projectId = String(args.project || "").trim();
  const appId = String(args["app-id"] || args.appId || "").trim();
  const eventId = String(args.event || TECH1DRIFT_ANNIVERSARY_CONFIG.eventId).trim();
  if (!projectId || !appId) return [];
  if (eventId !== TECH1DRIFT_ANNIVERSARY_CONFIG.eventId) {
    throw new Error(`Wrong --event. Expected ${TECH1DRIFT_ANNIVERSARY_CONFIG.eventId}.`);
  }
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  });
  const db = admin.firestore();
  const basePath = `artifacts/${appId}/public/data/specialEvents/${eventId}`;
  const shellSnap = await db.doc(basePath).get();
  const checks = buildShellReadiness(shellSnap.exists ? shellSnap.data() : null);
  const publicIndexSnap = await db.collection(`${basePath}/publicRegistrationIndex`).limit(5).get();
  const bracketSnap = await db.doc(`${basePath}/brackets/main`).get();
  addCheck(checks, "publicRegistrationIndex can be read", !publicIndexSnap.empty || publicIndexSnap.empty, `${publicIndexSnap.size} sample docs`);
  publicIndexSnap.docs.forEach((docSnap) => {
    addCheck(checks, `public index ${docSnap.id} has no private fields`, !PRIVATE_FIELD_PATTERN.test(Object.keys(docSnap.data()).join(" ")));
  });
  addCheck(checks, "bracket status reported", true, bracketSnap.exists ? String(bracketSnap.data()?.status || "unknown") : "not created");
  return checks;
}

function printChecks(checks) {
  checks.forEach((check) => {
    const prefix = check.pass ? "[OK]" : "[FAIL]";
    console.log(`${prefix} ${check.name}${check.detail ? ` - ${check.detail}` : ""}`);
  });
  const failed = checks.filter((check) => !check.pass);
  if (failed.length) {
    throw new Error(`${failed.length} Tech 1 readiness check(s) failed`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  runStaticCharacterizationChecks();
  runEventModePersistenceChecks();
  const checks = [
    ...buildShellReadiness({
      ...TECH1DRIFT_ANNIVERSARY_CONFIG,
      bracketStatus: "not_generated",
      registrationOpen: true,
    }),
    ...buildShellReadiness(null).map((check) => ({ ...check, name: `missing-shell fixture: ${check.name}`, pass: check.name === "event shell exists" ? !check.pass : check.pass })),
    ...runRepoReadinessChecks(),
    ...await runRemoteReadinessChecks(args),
  ];
  printChecks(checks);
  console.log("Tech 1 anniversary checks passed.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
