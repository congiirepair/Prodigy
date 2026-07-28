import assert from "node:assert/strict";
import fs from "node:fs";
import { getPreBracketLineup } from "../assets/js/lineup-preview.js";

function participant(index, prefix = "Driver") {
  return { id: `${prefix}-${index}`, name: `${prefix} ${index}`, registrationNumber: index };
}
function state(size, mode = "solo") {
  const entries = Array.from({ length: size }, (_, index) => participant(index + 1, mode === "team-tandem" ? "Team" : "Driver"));
  return {
    mainBracket: { rounds: [{ matches: Array.from({ length: size / 2 }, (_, index) => ({ left: entries[index * 2], right: entries[(index * 2) + 1] })) }] },
  };
}

for (const size of [8, 16, 32]) {
  const preview = getPreBracketLineup(state(size), { competitionMode: "solo", status: "active" });
  assert.equal(preview.available, true, `Top ${size} has a lineup`);
  assert.equal(preview.battles.length, size / 2);
  assert.deepEqual(preview.battles.flatMap((battle) => battle.participants.map((entry) => entry.position)), Array.from({ length: size }, (_, index) => index + 1));
  assert.deepEqual(preview.battles.flatMap((battle) => battle.participants.map((entry) => entry.participant.id)), Array.from({ length: size }, (_, index) => `Driver-${index + 1}`));
  assert.deepEqual(preview.battles.flatMap((battle) => battle.participants.map((entry) => entry.participantId)), Array.from({ length: size }, (_, index) => `Driver-${index + 1}`));
  assert.equal(new Set(preview.battles.flatMap((battle) => battle.participants.map((entry) => entry.participantId))).size, size, "stable participant identity prevents duplicate display entries");
}

const lower = { lowerBracket: { rounds: [{ matches: [{ left: participant(1, "Play-in"), right: participant(2, "Play-in") }] }] }, mainBracket: state(8).mainBracket };
assert.equal(getPreBracketLineup(lower, { competitionMode: "solo", status: "active" }).bracketKey, "lower", "authoritative SDC play-in precedes the main bracket");
assert.equal(getPreBracketLineup(state(8, "team-tandem"), { competitionMode: "team-tandem", status: "active" }).battles[0].participants[0].participant.name, "Team 1");
assert.equal(getPreBracketLineup(state(8), { competitionMode: "twin-triple", status: "active" }).reason, "twin");
assert.equal(getPreBracketLineup(state(8), { competitionMode: "solo", status: "completed" }).reason, "historical");
assert.equal(getPreBracketLineup({ mainBracket: { rounds: [{ matches: [{ left: participant(1), right: null }] }] } }, { competitionMode: "solo", status: "active" }).reason, "not-ready");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
assert.match(html, /id="lineupPreview"[\s\S]*?hidden/, "the read-only preview is placed in the qualifying pre-launch workflow");
assert.match(html, /id="registrationLineupPreviewHost"/, "Team Tandem has the same single preview in its registration launch workflow");
assert.match(html, /aria-label="Battle \$\{battle\.battleNumber\} lineup"/, "battle groups are semantic and individually labelled");
assert.match(html, /aria-label="Physical lineup position \$\{String\(entry\.position\)\.padStart/, "physical positions are explicit for screen readers");
assert.match(html, /function renderLineupPreview\(\)[\s\S]*?getPreBracketLineup\(lineupState, activeEventMeta\)/, "the preview derives from bracket state");
const lineupRenderer = html.match(/function renderLineupPreview\(\) \{([\s\S]*?)\n    function updateQualifying\(\)/)?.[1] || "";
assert.doesNotMatch(lineupRenderer, /publishState|callProdigyAction|setDoc|runTransaction|httpsCallable/, "rendering the lineup cannot write Firestore or call a Function");
assert.doesNotMatch(lineupRenderer, /<button|<select|status|note|reorder|lock|rebuild/, "the preview has no staging controls or workflow state");
assert.match(lineupRenderer, /competitionHasStarted/, "the preview disappears once an authoritative battle result starts competition");
assert.doesNotMatch(html, /manageStaging|Build Staging Lineup|Lock Lineup|Staging status/, "the overbuilt staging-management UI is absent from the baseline diff");
console.log("lineup preview presentation tests passed");
