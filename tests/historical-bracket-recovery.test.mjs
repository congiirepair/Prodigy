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
  bracketHash,
  inspectRound3SyntheticBracket,
} = require("../functions/historical-bracket.js");
const html = fs.readFileSync(`${repoRoot}index.html`, "utf8");
const backend = fs.readFileSync(`${repoRoot}functions/index.js`, "utf8");

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
const inspection = inspectRound3SyntheticBracket(ROUND3_EVENT_ID, syntheticEvent);
assert.equal(inspection.valid, true);
assert.equal(inspection.alreadyRepaired, false);
assert.equal(inspection.bracketHash, bracketHash(syntheticBracket));
assert.equal(inspectRound3SyntheticBracket("wrong-event", syntheticEvent).reason, "wrong-event");
assert.equal(inspectRound3SyntheticBracket(ROUND3_EVENT_ID, { ...syntheticEvent, status: "active" }).reason, "not-completed");
assert.equal(inspectRound3SyntheticBracket(ROUND3_EVENT_ID, {
  ...syntheticEvent,
  bracket: { ...syntheticBracket, createdAt: "changed" },
}).reason, "unexpected-created-at");
assert.equal(inspectRound3SyntheticBracket(ROUND3_EVENT_ID, {
  ...syntheticEvent,
  bracket: { ...syntheticBracket, mainBracket: { rounds: [{ matches: [{ winner: { name: "Changed" } }] }] } },
}).reason, "bracket-has-winners");
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

console.log("historical bracket recovery regression tests passed");
