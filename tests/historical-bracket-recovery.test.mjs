import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  HISTORICAL_BRACKET_UNAVAILABLE,
  HISTORICAL_BRACKET_AVAILABLE,
  isHistoricalBracketUnavailable,
  resolveRecoveredBracket,
  shouldPreserveUnavailableHistoricalBracket,
} from "../assets/js/historical-bracket.js";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const {
  ROUND3_EVENT_ID,
  ROUND3_SYNTHETIC_BRACKET_CREATED_AT,
  ROUND3_SYNTHETIC_BRACKET_HASH,
  bracketHash,
  buildRound3RepairVerification,
  collectRound3BracketDiagnostics,
  inspectRound3SyntheticBracket,
  normalizeCanonicalValue,
  normalizeTimestamp,
  rawBracketHash,
  repairFingerprintMatches,
} = require("../functions/historical-bracket.js");
const publicRestBracket = JSON.parse(fs.readFileSync(`${repoRoot}tests/fixtures/round3-public-rest-bracket.json`, "utf8"));
const html = fs.readFileSync(`${repoRoot}index.html`, "utf8");
const backend = fs.readFileSync(`${repoRoot}functions/index.js`, "utf8");
const historicalBackend = fs.readFileSync(`${repoRoot}functions/historical-bracket.js`, "utf8");

const unavailable = resolveRecoveredBracket({
  eventStatus: "completed",
  hasVerifiedQualifying: true,
  hasVerifiedResults: true,
  createBracket: () => { throw new Error("A completed historical event must not synthesize a bracket."); },
});
assert.equal(unavailable.bracket, null);
assert.equal(unavailable.historicalBracketStatus, HISTORICAL_BRACKET_UNAVAILABLE);
assert.equal(shouldPreserveUnavailableHistoricalBracket({ status: "completed", historicalBracketStatus: "unavailable" }), true);
assert.equal(shouldPreserveUnavailableHistoricalBracket({ status: "completed", historicalBracketStatus: "available" }), false);
assert.equal(shouldPreserveUnavailableHistoricalBracket({ status: "active", historicalBracketStatus: "unavailable" }), false);
assert.equal(isHistoricalBracketUnavailable({ status: "completed", historicalBracketStatus: "unavailable" }, null), true);

let activeBracketBuilds = 0;
const active = resolveRecoveredBracket({
  eventStatus: "active",
  hasVerifiedQualifying: true,
  hasVerifiedResults: false,
  createBracket: () => { activeBracketBuilds += 1; return { mainBracket: { rounds: [] } }; },
});
assert.equal(activeBracketBuilds, 1);
assert.deepEqual(active.bracket, { mainBracket: { rounds: [] } });
assert.equal(active.historicalBracketStatus, null);

const validatedBracket = { version: 12, mainBracket: { rounds: [{ matches: [{ winner: { name: "Verified" } }] }] } };
const validated = resolveRecoveredBracket({
  eventStatus: "completed",
  hasVerifiedQualifying: true,
  hasVerifiedResults: true,
  validatedBracket,
});
assert.deepEqual(validated.bracket, validatedBracket);
assert.notEqual(validated.bracket, validatedBracket);
assert.equal(validated.historicalBracketStatus, HISTORICAL_BRACKET_AVAILABLE);

function resolveClientBracketForEvent(meta, previousBracket, nextBracket = undefined, { twinComp = false } = {}) {
  const requestedBracket = nextBracket !== undefined ? nextBracket : previousBracket;
  return twinComp || shouldPreserveUnavailableHistoricalBracket(meta)
    ? null
    : requestedBracket;
}

const activeBracketState = { mainBracket: { rounds: [{ matches: [{ left: { name: "A" }, right: { name: "B" }, winner: null }] }] } };
const historicalUnavailableMeta = { status: "completed", historicalBracketStatus: "unavailable" };
const activeMeta = { status: "active", historicalBracketStatus: null };
const completedHistoricalWithBracketMeta = { status: "completed", historicalBracketStatus: "available" };
assert.equal(resolveClientBracketForEvent(historicalUnavailableMeta, activeBracketState), null);
assert.equal(resolveClientBracketForEvent(historicalUnavailableMeta, activeBracketState, activeBracketState), null);
assert.deepEqual(resolveClientBracketForEvent(activeMeta, null, activeBracketState), activeBracketState);
assert.deepEqual(resolveClientBracketForEvent(completedHistoricalWithBracketMeta, null, validatedBracket), validatedBracket);
assert.deepEqual(resolveClientBracketForEvent(activeMeta, activeBracketState), activeBracketState);

const syntheticBracket = {
  version: 9,
  createdAt: ROUND3_SYNTHETIC_BRACKET_CREATED_AT,
  plan: { resolvedFormat: "sdc", preferredFormat: "sdc-top-16", qualifiedCount: 25 },
  lowerBracket: { rounds: [{ matches: [{ left: { name: "A" }, right: { name: "B" }, winner: null }] }] },
  mainBracket: { rounds: [{ matches: [{ left: { name: "C" }, right: null, winner: null }] }] },
};
const syntheticEvent = {
  status: "completed",
  bracket: syntheticBracket,
  results: { totalBattles: 0, completedBattles: 0 },
};
const syntheticExpected = {
  bracketHash: bracketHash(syntheticBracket),
  createdAt: ROUND3_SYNTHETIC_BRACKET_CREATED_AT,
};
const inspection = inspectRound3SyntheticBracket(ROUND3_EVENT_ID, syntheticEvent, syntheticExpected);
assert.equal(inspection.valid, true);
assert.equal(inspection.alreadyRepaired, false);
assert.equal(inspection.bracketHash, bracketHash(syntheticBracket));
assert.equal(inspectRound3SyntheticBracket("wrong-event", syntheticEvent).reason, "wrong-event");
assert.equal(inspectRound3SyntheticBracket(ROUND3_EVENT_ID, { ...syntheticEvent, status: "active" }).reason, "not-completed");
assert.equal(inspectRound3SyntheticBracket(ROUND3_EVENT_ID, {
  ...syntheticEvent,
  bracket: { ...syntheticBracket, createdAt: "changed" },
}, syntheticExpected).reason, "unexpected-bracket-hash");
assert.equal(inspectRound3SyntheticBracket(ROUND3_EVENT_ID, {
  ...syntheticEvent,
  bracket: { ...syntheticBracket, mainBracket: { rounds: [{ matches: [{ winner: { name: "Changed" } }] }] } },
}, syntheticExpected).reason, "bracket-has-winners");
assert.equal(inspectRound3SyntheticBracket(ROUND3_EVENT_ID, syntheticEvent, {
  ...syntheticExpected,
  bracketHash: "changed",
}).reason, "unexpected-bracket-hash");

const productionMillis = Date.parse(ROUND3_SYNTHETIC_BRACKET_CREATED_AT);
const firestoreTimestampBracket = {
  ...syntheticBracket,
  createdAt: {
    seconds: Math.floor(productionMillis / 1000),
    nanoseconds: (productionMillis % 1000) * 1e6,
  },
};
assert.equal(normalizeTimestamp(firestoreTimestampBracket.createdAt), ROUND3_SYNTHETIC_BRACKET_CREATED_AT);
assert.equal(bracketHash(firestoreTimestampBracket), bracketHash(syntheticBracket));
assert.equal(inspectRound3SyntheticBracket(ROUND3_EVENT_ID, {
  ...syntheticEvent,
  bracket: firestoreTimestampBracket,
}, syntheticExpected).valid, true);
const alternateTimestampBracket = { ...syntheticBracket, createdAt: "2026-07-22T12:53:24.500Z" };
assert.equal(inspectRound3SyntheticBracket(ROUND3_EVENT_ID, {
  ...syntheticEvent,
  bracket: alternateTimestampBracket,
}, {
  bracketHash: bracketHash(alternateTimestampBracket),
  createdAt: ROUND3_SYNTHETIC_BRACKET_CREATED_AT,
}).reason, "unexpected-created-at");
assert.equal(ROUND3_SYNTHETIC_BRACKET_HASH, "4582377f03322cb33dc336b5501b531ee9b3842d2d82d7028591cc031b7e37a6");
const rawProductionFingerprint = {
  bracketHash: ROUND3_SYNTHETIC_BRACKET_HASH,
  createdAt: ROUND3_SYNTHETIC_BRACKET_CREATED_AT,
  syncStamp: 1784724804275,
};
assert.equal(repairFingerprintMatches(rawProductionFingerprint, { ...rawProductionFingerprint }), true);
assert.equal(repairFingerprintMatches(rawProductionFingerprint, {
  ...rawProductionFingerprint,
  syncStamp: rawProductionFingerprint.syncStamp + 1,
}), false);
assert.equal(repairFingerprintMatches(rawProductionFingerprint, {
  ...rawProductionFingerprint,
  bracketHash: "changed",
}), false);
assert.equal(repairFingerprintMatches(rawProductionFingerprint, {
  ...rawProductionFingerprint,
  createdAt: "2026-07-22T12:53:24.500Z",
}), false);
assert.equal(rawBracketHash(publicRestBracket), "988b8bd232911ee6fbb5a42d26ffbc314054cc6e0b11b22ba4aea97f5c1d7f6a");
assert.equal(bracketHash(publicRestBracket), "a9480b1b25f59bb995232dd73eb7234122cb12b1024dbddd98b24f1587ffb66d");
assert.notEqual(rawBracketHash(publicRestBracket), bracketHash(publicRestBracket));
assert.notEqual(bracketHash(publicRestBracket), ROUND3_SYNTHETIC_BRACKET_HASH);
const publicRestNormalizedBracket = normalizeCanonicalValue(publicRestBracket);
const representationDifference = firstDifference(publicRestBracket, publicRestNormalizedBracket);
assert.deepEqual(representationDifference, {
  path: "bracket.lowerBracket.rounds[0].matches[3].left.chassis",
  left: "MST RMX 4",
  right: "2001-04-01T08:00:00.000Z",
});
assert.deepEqual(summarizeValueTypes(publicRestBracket).sample.createdAt, { type: "string", value: "2026-07-22T12:53:23.500Z" });
assert.deepEqual(summarizeValueTypes(publicRestNormalizedBracket).sample.createdAt, { type: "string", value: "2026-07-22T12:53:23.500Z" });
assert.equal(inspectRound3SyntheticBracket(ROUND3_EVENT_ID, {
  ...syntheticEvent,
  bracket: publicRestBracket,
}, {
  bracketHash: ROUND3_SYNTHETIC_BRACKET_HASH,
  createdAt: ROUND3_SYNTHETIC_BRACKET_CREATED_AT,
}).reason, "unexpected-bracket-hash");
const mismatchDiagnostics = collectRound3BracketDiagnostics({
  bracket: firestoreTimestampBracket,
  results: { totalBattles: 0, completedBattles: 0 },
  syncStamp: 1784724804275,
});
assert.equal(mismatchDiagnostics.serverComputedBracketHash, bracketHash(syntheticBracket));
assert.equal(mismatchDiagnostics.expectedBracketHash, ROUND3_SYNTHETIC_BRACKET_HASH);
assert.equal(mismatchDiagnostics.normalizedBracketCreatedAt, ROUND3_SYNTHETIC_BRACKET_CREATED_AT);
assert.equal(mismatchDiagnostics.expectedBracketCreatedAt, ROUND3_SYNTHETIC_BRACKET_CREATED_AT);
assert.equal(mismatchDiagnostics.winnerCount, 0);
assert.equal(mismatchDiagnostics.completedMatchCount, 0);
assert.equal(mismatchDiagnostics.totalBattles, 0);
assert.equal(mismatchDiagnostics.completedBattles, 0);
assert.deepEqual(mismatchDiagnostics.topLevelBracketKeys, ["createdAt", "lowerBracket", "mainBracket", "plan", "version"]);
assert.equal(Array.isArray(mismatchDiagnostics.canonicalizationAnomalies), true);
assert.equal(mismatchDiagnostics.canonicalizationAnomalies.some((entry) => entry.type === "Object" || entry.type === "Date"), false);
const publicRestDiagnostics = collectRound3BracketDiagnostics({
  bracket: publicRestBracket,
  results: { totalBattles: 0, completedBattles: 0 },
  syncStamp: 1784724804275,
});
assert.equal(publicRestDiagnostics.serverComputedBracketHash, "a9480b1b25f59bb995232dd73eb7234122cb12b1024dbddd98b24f1587ffb66d");
assert.equal(publicRestDiagnostics.expectedBracketHash, ROUND3_SYNTHETIC_BRACKET_HASH);
assert.equal(publicRestDiagnostics.normalizedBracketCreatedAt, ROUND3_SYNTHETIC_BRACKET_CREATED_AT);
assert.equal(publicRestDiagnostics.expectedBracketCreatedAt, ROUND3_SYNTHETIC_BRACKET_CREATED_AT);
assert.equal(publicRestDiagnostics.winnerCount, 0);
assert.equal(publicRestDiagnostics.completedMatchCount, 0);
assert.equal(publicRestDiagnostics.totalBattles, 0);
assert.equal(publicRestDiagnostics.completedBattles, 0);
assert.deepEqual(publicRestDiagnostics.topLevelBracketKeys, [
  "competitionAttemptHistory",
  "competitionJudgeControl",
  "createdAt",
  "customLowerCount",
  "lowerBracket",
  "mainBracket",
  "manualBracketOrder",
  "plan",
  "preferredFormat",
  "qualifiedDrivers",
  "version",
]);
assert.deepEqual(publicRestDiagnostics.canonicalizationAnomalies, []);
const publicRestVerification = buildRound3RepairVerification(ROUND3_EVENT_ID, {
  status: "completed",
  bracket: publicRestBracket,
  results: { totalBattles: 0, completedBattles: 0 },
  syncStamp: 1784724804275,
});
assert.equal(publicRestVerification.serverComputedBracketHash, bracketHash(publicRestBracket));
assert.equal(publicRestVerification.rawComputedBracketHash, rawBracketHash(publicRestBracket));
assert.equal(publicRestVerification.normalizedBracketCreatedAt, ROUND3_SYNTHETIC_BRACKET_CREATED_AT);
assert.equal(publicRestVerification.currentSyncStamp, 1784724804275);
assert.equal(publicRestVerification.documentUpdateTime, null);
assert.equal(publicRestVerification.winnerCount, 0);
assert.equal(publicRestVerification.completedMatchCount, 0);
assert.equal(publicRestVerification.totalBattles, 0);
assert.equal(publicRestVerification.completedBattles, 0);
assert.equal(publicRestVerification.historicalBracketStatus, null);
assert.equal(publicRestVerification.canExecuteRepair, false);
assert.equal(publicRestVerification.reason, "unexpected-bracket-hash");
const syntheticVerification = buildRound3RepairVerification(ROUND3_EVENT_ID, {
  status: "completed",
  bracket: syntheticBracket,
  results: { totalBattles: 0, completedBattles: 0 },
  syncStamp: 1784724804275,
}, {
  expected: {
    bracketHash: bracketHash(syntheticBracket),
    createdAt: ROUND3_SYNTHETIC_BRACKET_CREATED_AT,
  },
  updateTime: new Date("2026-07-22T12:53:24.493Z"),
});
assert.equal(syntheticVerification.serverComputedBracketHash, bracketHash(syntheticBracket));
assert.equal(syntheticVerification.rawComputedBracketHash, rawBracketHash(syntheticBracket));
assert.equal(syntheticVerification.canExecuteRepair, true);
assert.equal(syntheticVerification.alreadyRepaired, false);
assert.equal(syntheticVerification.reason, null);
assert.equal(syntheticVerification.documentUpdateTime, "2026-07-22T12:53:24.493Z");

const structurallySimilarBracket = {
  ...syntheticBracket,
  plan: { ...syntheticBracket.plan, qualifiedCount: 24 },
};
assert.equal(inspectRound3SyntheticBracket(ROUND3_EVENT_ID, {
  ...syntheticEvent,
  bracket: structurallySimilarBracket,
}, syntheticExpected).reason, "unexpected-bracket-hash");

// Rendering normalization can auto-advance a bye in memory. That transformed
// client object must never be accepted as the raw server repair fingerprint.
const clientNormalizedBracket = structuredClone(syntheticBracket);
clientNormalizedBracket.mainBracket.rounds[0].matches[0].winner = { name: "C" };
clientNormalizedBracket.mainBracket.rounds[0].matches[0].winnerMode = "auto";
assert.notEqual(bracketHash(clientNormalizedBracket), bracketHash(syntheticBracket));
assert.equal(inspectRound3SyntheticBracket(ROUND3_EVENT_ID, {
  ...syntheticEvent,
  bracket: clientNormalizedBracket,
}, syntheticExpected).reason, "bracket-has-winners");
assert.deepEqual(inspectRound3SyntheticBracket(ROUND3_EVENT_ID, {
  status: "completed",
  historicalBracketStatus: "unavailable",
  bracket: null,
}), { valid: true, alreadyRepaired: true });

const recoveryBuilder = html.slice(
  html.indexOf("function buildRound3PdfRecoverySnapshot"),
  html.indexOf("async function commitRound3PdfRestore"),
);
const activeEventStateApplySource = sourceBetween(html, "function applyActiveEventState(nextState = {}, options = {}) {", "function setActiveEventIdState(nextId) {");
const autoBracketSource = sourceBetween(html, "function maybeAutoBuildBracket() {", "function syncNetworkStatusIndicator() {");
const broadcastTickerSource = sourceBetween(html, "function buildBroadcastTickerItems() {", "function isOfflineMode() {");
const commandCenterSource = sourceBetween(html, "function renderCommandCenter() {", "async function finalizeCurrentEventResults() {");
const renderBracketSource = sourceBetween(html, "function renderBracket() {", "function updateCompetitionBracketPage() {");
assert.match(recoveryBuilder, /resolveRecoveredBracket/);
assert.doesNotMatch(recoveryBuilder, /createTournamentState/);
assert.match(html, /id="historicalBracketState"/);
assert.match(html, /Historical battle bracket unavailable/);
assert.match(html, /isHistoricalBracketUnavailable\(activeEventMeta, tournamentState\)/);
assert.match(activeEventStateApplySource, /shouldPreserveUnavailableHistoricalBracket\(resolvedMeta\)/);
assert.match(activeEventStateApplySource, /\? null\s*\n\s*: requestedBracket/);
assert.match(autoBracketSource, /shouldPreserveUnavailableHistoricalBracket\(activeEventMeta\)/);
assert.match(broadcastTickerSource, /const historicalBracketUnavailable = shouldPreserveUnavailableHistoricalBracket\(activeEventMeta\);/);
assert.match(broadcastTickerSource, /if \(!historicalBracketUnavailable && tournamentState\?\.mainBracket\?\.rounds\?\.length\)/);
assert.match(commandCenterSource, /const historicalBracketUnavailable = shouldPreserveUnavailableHistoricalBracket\(activeEventMeta\);/);
assert.match(commandCenterSource, /getCompetitionFlowEntriesForState\(null\)/);
assert.match(commandCenterSource, /const bracketPublished = !historicalBracketUnavailable && Boolean\(tournamentState\?\.mainBracket\?\.rounds\?\.length\)/);
assert.match(renderBracketSource, /shouldPreserveUnavailableHistoricalBracket\(activeEventMeta\)/);
assert.match(html, /id="repairRound3HistoricalBracketBtn"/);
assert.match(html, /expectedBracketHash: dryRun\.bracketHash/);
assert.match(html, /expectedSyncStamp: dryRun\.currentSyncStamp/);
for (const expected of [
  'championName: "Rob Dixon"',
  'runnerUpName: "Black Nick"',
  'thirdPlaceName: "Rj Ampil"',
  'fourthPlaceName: "Yogi H"',
  'topQualifierName: "Dylan Baizas"',
  "topQualifierScore: 92.0",
  "qualifiedCount: PDF_RECOVERY_ROUND3_DRIVERS.length",
  "const formatMode = FORMAT_SDC_TOP_16",
]) assert.match(html, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

assert.match(backend, /repairHistoricalBracketUnavailable/);
assert.match(backend, /transaction\.create\(auditDocument/);
assert.match(backend, /bracket: FieldValue\.delete\(\)/);
assert.match(backend, /expectedBracketHash/);
assert.match(backend, /expectedSyncStamp/);
assert.match(backend, /alreadyRepaired/);
assert.match(backend, /collectRound3BracketDiagnostics/);
assert.match(historicalBackend, /serverComputedBracketHash/);
assert.match(historicalBackend, /canonicalByteLength/);

console.log("historical bracket recovery regression tests passed");
function summarizeValueTypes(value) {
  if (Array.isArray(value)) return { type: "array", length: value.length, first: value.length ? summarizeValueTypes(value[0]) : null };
  if (value && typeof value === "object") {
    return {
      type: "object",
      keys: Object.keys(value).sort(),
      sample: Object.fromEntries(Object.keys(value).sort().slice(0, 5).map((key) => [key, summarizeValueTypes(value[key])])),
    };
  }
  return { type: value === null ? "null" : typeof value, value };
}

function firstDifference(left, right, path = "bracket") {
  if (Object.is(left, right)) return null;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return { path, left, right };
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      if (index >= left.length || index >= right.length) return { path: `${path}[${index}]`, left: left[index], right: right[index] };
      const diff = firstDifference(left[index], right[index], `${path}[${index}]`);
      if (diff) return diff;
    }
    return null;
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
      if (!(key in left) || !(key in right)) return { path: `${path}.${key}`, left: left[key], right: right[key] };
      const diff = firstDifference(left[key], right[key], `${path}.${key}`);
      if (diff) return diff;
    }
    return null;
  }
  return { path, left, right };
}

function sourceBetween(source, startMarker, endMarker) {
  const startIndex = source.indexOf(startMarker);
  const endIndex = source.indexOf(endMarker, startIndex + startMarker.length);
  if (startIndex < 0 || endIndex < 0) return "";
  return source.slice(startIndex, endIndex);
}
