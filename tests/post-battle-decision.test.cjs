"use strict";

const assert = require("node:assert/strict");
const {
  COMPETITION_REVIEW_WINDOW_MS,
  continueDecision,
  entryKey,
  recordScorecard,
  recordVote,
  reviewDecision,
} = require("../functions/competition");

function driver(id, seed, memberCount = 1) {
  return {
    id,
    seed,
    name: id.toUpperCase(),
    registrationNumber: seed,
    memberCount,
    tandemMembers: Array.from({ length: memberCount }, (_, index) => `${id}-${index + 1}`),
    tandemBonusPoints: memberCount >= 3 ? 3 : 0,
  };
}

function bracketState(format = "classic", left = driver("left", 1), right = driver("right", 4)) {
  return {
    plan: { resolvedFormat: format, mainBracketSize: 4 },
    lowerBracket: null,
    mainBracket: {
      rounds: [
        {
          name: "Semifinal",
          matches: [
            { left, right, winner: null, winnerMode: null },
            { left: driver("other-left", 2), right: driver("other-right", 3), winner: null, winnerMode: null },
          ],
        },
        { name: "Final", matches: [{ left: null, right: null, winner: null, winnerMode: null }] },
      ],
      thirdPlaceMatch: { left: null, right: null, winner: null, winnerMode: null },
    },
    competitionJudgeControl: null,
    competitionAttemptHistory: [],
  };
}

const soloMeta = { judgeCount: 3, judgingMode: "average", competitionMode: "solo" };
const teamMeta = { judgeCount: 3, judgingMode: "line-angle-style", competitionMode: "team-tandem" };
const firstEntryKey = entryKey({ bracketKey: "main", roundIndex: 0, matchIndex: 0 });

function resolveVotes(sides, format = "classic") {
  let current = bracketState(format);
  let result;
  ["j1", "j2", "j3"].forEach((role, index) => {
    result = recordVote(current, soloMeta, role, sides[index], firstEntryKey);
    current = result.state;
  });
  return result;
}

let winner = resolveVotes(["left", "left", "right"]);
let control = winner.state.competitionJudgeControl;
assert.equal(control.status, "admin_decision");
assert.equal(control.decisionType, "winner");
assert.equal(winner.state.mainBracket.rounds[0].matches[0].winner.id, "left");
assert.equal(Date.parse(control.reviewDeadlineAt) - Date.parse(control.resolvedAt), COMPETITION_REVIEW_WINDOW_MS);
assert.equal(winner.state.competitionAttemptHistory.length, 1);

// Continue and timer expiry share this transition. Repeating it is a no-op.
let continued = continueDecision(winner.state, firstEntryKey, control.attemptId);
assert.equal(continued.changed, true);
assert.equal(continued.state.competitionJudgeControl.status, "idle");
assert.equal(continued.state.mainBracket.rounds[1].matches[0].left.id, "left");
let duplicateContinue = continueDecision(continued.state, firstEntryKey, control.attemptId);
assert.equal(duplicateContinue.changed, false);
assert.equal(duplicateContinue.state.mainBracket.rounds[1].matches[0].left.id, "left");

// A reconnect gets the same authoritative decision and cannot repeat progression.
const reconnected = JSON.parse(JSON.stringify(continued.state));
assert.equal(continueDecision(reconnected, firstEntryKey, control.attemptId).changed, false);

// Partial OMT tallies cannot resolve early; 1-1-1 is a tie/review hold, not OMT.
let split = recordVote(bracketState(), soloMeta, "j1", "omt", firstEntryKey);
assert.equal(split.resolution.allVoted, false);
assert.equal(split.resolution.omtMajority, false);
assert.equal(split.state.competitionJudgeControl.status, "voting");
split = recordVote(split.state, soloMeta, "j2", "left", firstEntryKey);
assert.equal(split.resolution.allVoted, false);
assert.equal(split.state.competitionJudgeControl.status, "voting");
split = recordVote(split.state, soloMeta, "j3", "right", firstEntryKey);
assert.equal(split.resolution.allVoted, true);
assert.equal(split.resolution.omtMajority, false);
assert.equal(split.resolution.tied, true);
assert.equal(split.state.competitionJudgeControl.status, "review_hold");
assert.equal(split.state.mainBracket.rounds[0].matches[0].winner, null);

winner = resolveVotes(["left", "left", "right"]);
control = winner.state.competitionJudgeControl;
const contested = reviewDecision(winner.state, firstEntryKey, control.attemptId);
assert.equal(contested.changed, true);
assert.equal(contested.state.competitionJudgeControl.status, "review_hold");
assert.equal(contested.state.competitionJudgeControl.reviewDeadlineAt, null);
assert.equal(contested.state.mainBracket.rounds[0].matches[0].winner, null);
const reopened = continueDecision(contested.state, firstEntryKey, control.attemptId);
assert.equal(reopened.changed, true);
assert.equal(reopened.state.competitionJudgeControl.status, "voting");
assert.equal(reopened.state.competitionJudgeControl.cycle, 2);
assert.deepEqual(reopened.state.competitionJudgeControl.votes, { j1: null, j2: null, j3: null });
assert.equal(reopened.state.mainBracket.rounds[0].matches[0].winner, null);

let omt = resolveVotes(["omt", "omt", "left"]);
control = omt.state.competitionJudgeControl;
assert.equal(control.status, "admin_decision");
assert.equal(control.decisionType, "omt");
assert.equal(omt.state.mainBracket.rounds[0].matches[0].winner, null);
assert.equal(omt.state.competitionAttemptHistory[0].decisionType, "omt");
assert.deepEqual(omt.state.competitionAttemptHistory[0].votes, { j1: "omt", j2: "omt", j3: "left" });
const omtAttemptId = control.attemptId;
const omtRerun = continueDecision(omt.state, firstEntryKey, omtAttemptId);
assert.equal(omtRerun.changed, true);
assert.equal(omtRerun.state.competitionJudgeControl.status, "voting");
assert.equal(omtRerun.state.competitionJudgeControl.reason, "omt");
assert.equal(omtRerun.state.competitionJudgeControl.cycle, 2);
assert.equal(entryKey(omtRerun.state.competitionJudgeControl.entry), firstEntryKey);
assert.deepEqual(omtRerun.state.competitionJudgeControl.votes, { j1: null, j2: null, j3: null });
assert.equal(omtRerun.state.competitionAttemptHistory[0].id, omtAttemptId);

omt = resolveVotes(["omt", "omt", "right"]);
control = omt.state.competitionJudgeControl;
const contestedOmt = reviewDecision(omt.state, firstEntryKey, control.attemptId);
assert.equal(contestedOmt.state.competitionJudgeControl.reviewSourceReason, "omt");
assert.equal(contestedOmt.state.competitionJudgeControl.reviewDeadlineAt, null);
const reviewedOmtRerun = continueDecision(contestedOmt.state, firstEntryKey, control.attemptId);
assert.equal(reviewedOmtRerun.state.competitionJudgeControl.reason, "omt");
assert.deepEqual(reviewedOmtRerun.state.competitionJudgeControl.votes, { j1: null, j2: null, j3: null });

// SDC battles use the same guarded decision transition.
const sdcWinner = resolveVotes(["right", "right", "left"], "sdc");
assert.equal(sdcWinner.state.competitionJudgeControl.status, "admin_decision");
assert.equal(sdcWinner.state.competitionJudgeControl.decisionType, "winner");

// Team Tandem now receives the same reveal/review window before advancement is finalized.
let teamState = bracketState("classic", driver("team-left", 1, 3), driver("team-right", 2, 2));
let teamResult;
for (const role of ["j1", "j2", "j3"]) teamState = recordScorecard(teamState, teamMeta, role, { side: "left", score: 9 }, firstEntryKey).state;
for (const role of ["j1", "j2"]) teamState = recordScorecard(teamState, teamMeta, role, { side: "right", score: 7 }, firstEntryKey).state;
teamResult = recordScorecard(teamState, teamMeta, "j3", { side: "right", score: 7 }, firstEntryKey);
assert.equal(teamResult.state.competitionJudgeControl.status, "admin_decision");
assert.equal(teamResult.state.competitionJudgeControl.decisionType, "winner");
assert.equal(teamResult.state.mainBracket.rounds[0].matches[0].winner.id, "team-left");

console.log("post-battle decision flow tests passed");
