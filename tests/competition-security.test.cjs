"use strict";

const assert = require("node:assert/strict");
const { entryKey, normalizeBracketState, recordScorecard, recordVote } = require("../functions/competition");

function driver(id, seed, memberCount = 1) {
  return {
    id,
    seed,
    name: id.toUpperCase(),
    registrationNumber: seed,
    memberCount,
    tandemMembers: Array.from({ length: memberCount }, (_, index) => `${id}-${index + 1}`),
    tandemBonusPoints: memberCount >= 3 ? 3 : 0,
    tandemType: memberCount > 1 ? "team" : null,
  };
}

function state(left = driver("a", 1), right = driver("d", 4)) {
  return {
    plan: { resolvedFormat: "classic", mainBracketSize: 4 },
    lowerBracket: null,
    mainBracket: {
      rounds: [
        {
          name: "Semifinal",
          matches: [
            { left, right, winner: null, winnerMode: null },
            { left: driver("b", 2), right: driver("c", 3), winner: null, winnerMode: null },
          ],
        },
        { name: "Final", matches: [{ left: null, right: null, winner: null, winnerMode: null }] },
      ],
      thirdPlaceMatch: { left: null, right: null, winner: null, winnerMode: null },
    },
    competitionJudgeControl: null,
  };
}

const soloMeta = { judgeCount: 3, judgingMode: "average", competitionMode: "solo" };
const firstKey = entryKey({ bracketKey: "main", roundIndex: 0, matchIndex: 0 });

let current = state();
let result = recordVote(current, soloMeta, "j1", "left", firstKey);
assert.equal(result.changed, true);
current = result.state;
result = recordVote(current, soloMeta, "j2", "left", firstKey);
current = result.state;
result = recordVote(current, soloMeta, "j3", "right", firstKey);
assert.equal(result.resolution.winnerSide, "left");
assert.equal(result.state.mainBracket.rounds[0].matches[0].winner.id, "a");
assert.equal(result.state.mainBracket.rounds[1].matches[0].left.id, "a");
assert.equal(result.state.competitionJudgeControl.status, "admin_decision");

result = recordVote(state(), soloMeta, "j1", "left", "main:0:1");
assert.equal(result.changed, false);
assert.equal(result.stale, true);

current = state();
current = recordVote(current, soloMeta, "j1", "omt", firstKey).state;
current = recordVote(current, soloMeta, "j2", "omt", firstKey).state;
result = recordVote(current, soloMeta, "j3", "left", firstKey);
assert.equal(result.resolution.omtMajority, true);
assert.equal(result.state.mainBracket.rounds[0].matches[0].winner, null);
assert.equal(result.state.competitionJudgeControl.cycle, 2);
assert.equal(result.state.competitionJudgeControl.reason, "omt");

const teamMeta = { judgeCount: 3, judgingMode: "line-angle-style", competitionMode: "team-tandem" };
current = state(driver("team-a", 1, 3), driver("team-b", 2, 2));
for (const role of ["j1", "j2", "j3"]) current = recordScorecard(current, teamMeta, role, { side: "left", score: 8 }, firstKey).state;
for (const role of ["j1", "j2"]) current = recordScorecard(current, teamMeta, role, { side: "right", score: 9 }, firstKey).state;
result = recordScorecard(current, teamMeta, "j3", { side: "right", score: 9 }, firstKey);
assert.equal(result.resolution.leftTotal, 27);
assert.equal(result.resolution.rightTotal, 27);
assert.equal(result.resolution.tied, true);
assert.equal(result.state.competitionJudgeControl.status, "review_hold");

current = state(driver("team-a", 1, 3), driver("team-b", 2, 2));
for (const role of ["j1", "j2", "j3"]) current = recordScorecard(current, teamMeta, role, { side: "left", score: 10 }, firstKey).state;
for (const role of ["j1", "j2"]) current = recordScorecard(current, teamMeta, role, { side: "right", score: 7 }, firstKey).state;
result = recordScorecard(current, teamMeta, "j3", { side: "right", score: 99 }, firstKey);
assert.equal(result.resolution.rightBase, 24);
assert.equal(result.resolution.winnerSide, "left");
assert.equal(result.state.mainBracket.rounds[0].matches[0].winner.id, "team-a");
assert.equal(result.state.competitionJudgeControl.status, "idle");

const sdcState = {
  plan: { resolvedFormat: "sdc", mainBracketSize: 2 },
  lowerBracket: {
    feedsInto: { matchIndex: 0, side: "left" },
    rounds: [{ name: "Lower Final", matches: [{ left: driver("lower-a", 3), right: driver("lower-b", 4), winner: driver("lower-a", 3), winnerMode: "manual" }] }],
  },
  mainBracket: {
    rounds: [{ name: "Main Final", matches: [{ left: null, right: driver("top-seed", 1), winner: null, winnerMode: null }] }],
    thirdPlaceMatch: null,
  },
};
normalizeBracketState(sdcState);
assert.equal(sdcState.mainBracket.rounds[0].matches[0].left.id, "lower-a");
assert.equal(sdcState.mainBracket.rounds[0].matches[0].left.seed, 2);

console.log("competition security state-machine tests passed");
