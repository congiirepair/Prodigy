import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  HISTORICAL_BRACKET_UNAVAILABLE,
  HISTORICAL_BRACKET_AVAILABLE,
  isHistoricalBracketUnavailable,
  resolveRecoveredBracket,
} from "../assets/js/historical-bracket.js";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const {
  ROUND3_EVENT_ID,
  ROUND3_SYNTHETIC_BRACKET_CREATED_AT,
  ROUND3_SYNTHETIC_BRACKET_HASH,
  bracketHash,
  collectRound3BracketDiagnostics,
  inspectRound3SyntheticBracket,
  normalizeTimestamp,
  repairFingerprintMatches,
} = require("../functions/historical-bracket.js");
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
assert.equal(ROUND3_SYNTHETIC_BRACKET_HASH, "a9480b1b25f59bb995232dd73eb7234122cb12b1024dbddd98b24f1587ffb66d");
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
assert.match(recoveryBuilder, /resolveRecoveredBracket/);
assert.doesNotMatch(recoveryBuilder, /createTournamentState/);
assert.match(html, /id="historicalBracketState"/);
assert.match(html, /Historical battle bracket unavailable/);
assert.match(html, /isHistoricalBracketUnavailable\(activeEventMeta, tournamentState\)/);
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
