"use strict";

const assert = require("node:assert/strict");
const {
  continueDecision,
  entryKey,
  normalizeBracketState,
  recordScorecard,
  recordVote,
} = require("../functions/competition");

function driver(seed, { team = false } = {}) {
  return {
    id: `${team ? "team" : "driver"}-${seed}`,
    seed,
    name: `${team ? "Team" : "Driver"} ${seed}`,
    registrationNumber: seed,
    memberCount: team ? 2 + (seed % 2) : 1,
    tandemMembers: team ? [`Member ${seed}A`, `Member ${seed}B`] : [],
    tandemBonusPoints: team && seed % 2 ? 3 : 0,
    tandemType: team ? "team" : null,
  };
}

function classicState(size, { team = false } = {}) {
  const drivers = Array.from({ length: size }, (_, index) => driver(index + 1, { team }));
  const opening = Array.from({ length: size / 2 }, (_, index) => ({
    left: drivers[index],
    right: drivers[size - index - 1],
    winner: null,
    winnerMode: null,
  }));
  const rounds = [{ name: "Opening", matches: opening }];
  for (let count = opening.length / 2; count >= 1; count /= 2) {
    rounds.push({
      name: count === 1 ? "Final" : `Round of ${count * 2}`,
      matches: Array.from({ length: count }, () => ({ left: null, right: null, winner: null, winnerMode: null })),
    });
  }
  return {
    drivers,
    state: {
      plan: { resolvedFormat: "classic", mainBracketSize: size },
      lowerBracket: null,
      mainBracket: { rounds, thirdPlaceMatch: null },
      competitionJudgeControl: null,
    },
  };
}

function runVoteLifecycle(stateInput) {
  let state = structuredClone(stateInput);
  let resolvedCount = 0;
  for (let guard = 0; guard < 100; guard += 1) {
    let result = recordVote(state, { judgeCount: 3, judgingMode: "average", competitionMode: "solo" }, "j1", "left");
    if (!result.changed) break;
    const expectedEntryKey = entryKey(result.entry);
    state = result.state;
    result = recordVote(state, { judgeCount: 3, judgingMode: "average", competitionMode: "solo" }, "j2", "left", expectedEntryKey);
    assert.equal(result.changed, true);
    state = result.state;
    result = recordVote(state, { judgeCount: 3, judgingMode: "average", competitionMode: "solo" }, "j3", "left", expectedEntryKey);
    assert.equal(result.changed, true);
    state = result.state;
    const control = state.competitionJudgeControl;
    assert.equal(control.status, "admin_decision");
    assert.equal(control.resolvedWinnerSide, "left");
    const continued = continueDecision(state, expectedEntryKey, control.attemptId);
    assert.equal(continued.changed, true);
    state = continued.state;
    resolvedCount += 1;
  }
  normalizeBracketState(state);
  return { state, resolvedCount };
}

function runTeamLifecycle(stateInput) {
  let state = structuredClone(stateInput);
  let resolvedCount = 0;
  const meta = { judgeCount: 3, judgingMode: "line-angle-style", competitionMode: "team-tandem" };
  for (let guard = 0; guard < 100; guard += 1) {
    let result = recordScorecard(state, meta, "j1", { side: "left", score: 9 });
    if (!result.changed) break;
    const expectedEntryKey = entryKey(result.entry);
    state = result.state;
    for (const role of ["j2", "j3"]) {
      result = recordScorecard(state, meta, role, { side: "left", score: 9 }, expectedEntryKey);
      assert.equal(result.changed, true);
      state = result.state;
    }
    for (const role of ["j1", "j2", "j3"]) {
      result = recordScorecard(state, meta, role, { side: "right", score: 7 }, expectedEntryKey);
      assert.equal(result.changed, true);
      state = result.state;
    }
    const control = state.competitionJudgeControl;
    assert.equal(control.status, "admin_decision");
    assert.equal(control.resolvedWinnerSide, "left");
    const continued = continueDecision(state, expectedEntryKey, control.attemptId);
    assert.equal(continued.changed, true);
    state = continued.state;
    resolvedCount += 1;
  }
  normalizeBracketState(state);
  return { state, resolvedCount };
}

for (const size of [2, 4, 8, 16, 32]) {
  const fixture = classicState(size);
  const firstRoundIds = fixture.state.mainBracket.rounds[0].matches.flatMap((match) => [match.left.id, match.right.id]);
  assert.equal(new Set(firstRoundIds).size, size, `classic ${size} must not duplicate an opening participant`);
  const result = runVoteLifecycle(fixture.state);
  assert.ok(result.state.mainBracket.rounds.at(-1).matches[0].winner, `classic ${size} must produce a champion`);
  assert.equal(result.resolvedCount, size - 1 + (size >= 4 ? 1 : 0), `classic ${size} must resolve every main and third-place battle once`);
}

const teamFixture = classicState(8, { team: true });
const teamResult = runTeamLifecycle(teamFixture.state);
assert.ok(teamResult.state.mainBracket.rounds.at(-1).matches[0].winner, "Team Tandem must produce a champion");
assert.equal(teamResult.resolvedCount, 8, "Team Tandem must resolve all seven main battles and third place once");

// A malformed historical/manual winner must be cleared rather than advancing a
// phantom competitor. A one-sided opening match remains a safe automatic bye.
const malformed = classicState(4).state;
malformed.mainBracket.rounds[0].matches[0].winner = { id: "ghost", seed: 99, name: "Ghost" };
malformed.mainBracket.rounds[0].matches[0].winnerMode = "manual";
malformed.mainBracket.rounds[0].matches[1].right = null;
normalizeBracketState(malformed);
assert.equal(malformed.mainBracket.rounds[0].matches[0].winner, null);
assert.equal(malformed.mainBracket.rounds[0].matches[1].winner.id, "driver-2");
assert.equal(malformed.mainBracket.rounds[0].matches[1].winnerMode, "auto");

// Lower-bracket completion feeds exactly one winner into the configured main
// bracket slot, preserving the server's SDC-style lower-to-main relationship.
const lowerWinner = driver(7);
const sdcState = {
  plan: { resolvedFormat: "sdc", mainBracketSize: 8 },
  lowerBracket: {
    feedsInto: { matchIndex: 0, side: "left" },
    rounds: [{ name: "Lower Final", matches: [{ left: lowerWinner, right: driver(8), winner: lowerWinner, winnerMode: "manual" }] }],
  },
  mainBracket: {
    rounds: [{ name: "Main Final", matches: [{ left: null, right: driver(1), winner: null, winnerMode: null }] }],
    thirdPlaceMatch: null,
  },
};
normalizeBracketState(sdcState);
assert.equal(sdcState.mainBracket.rounds[0].matches[0].left.id, lowerWinner.id);
assert.equal(sdcState.mainBracket.rounds[0].matches[0].left.seed, 7);

console.log("bracket lifecycle state-machine tests passed");
