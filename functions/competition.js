"use strict";

const JUDGE_ROLES = ["j1", "j2", "j3"];
const TEAM_TANDEM_MODE = "team-tandem";
const COMPETITION_REVIEW_WINDOW_MS = 15_000;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizeJudgeCount(value, judgingMode) {
  if (judgingMode === "line-angle-style") return 3;
  const parsed = Number.parseInt(value, 10);
  return [1, 2, 3].includes(parsed) ? parsed : 3;
}

function activeJudgeRoles(eventData = {}) {
  return JUDGE_ROLES.slice(0, normalizeJudgeCount(eventData.judgeCount, eventData.judgingMode));
}

function judgeScoreMax(role, eventData = {}) {
  if (eventData.competitionMode === TEAM_TANDEM_MODE) return 10;
  if (eventData.judgingMode !== "line-angle-style") return 100;
  return role === "j3" ? 20 : 40;
}

function clampJudgeScore(value, role, eventData) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(judgeScoreMax(role, eventData), Math.round(numeric * 10) / 10));
}

function cloneDriver(driver) {
  if (!driver) return null;
  return clone({
    id: driver.id,
    seed: driver.seed,
    name: driver.name,
    teamName: driver.teamName || "",
    chassis: driver.chassis || "",
    registrationNumber: driver.registrationNumber,
    signUpPosition: driver.signUpPosition,
    run1: driver.run1,
    run2: driver.run2,
    bestScore: driver.bestScore,
    memberCount: Number(driver.memberCount || driver.teamMemberCount || driver.tandemMembers?.length || 0),
    tandemBonusPoints: Number(driver.tandemBonusPoints || 0),
    tandemMembers: Array.isArray(driver.tandemMembers) ? [...driver.tandemMembers] : [],
    tandemType: driver.tandemType || null,
  });
}

function cloneMatch(match = {}) {
  return {
    left: cloneDriver(match.left),
    right: cloneDriver(match.right),
    winner: cloneDriver(match.winner),
    winnerMode: match.winnerMode ?? null,
    lockedLeft: Boolean(match.lockedLeft),
    lockedRight: Boolean(match.lockedRight),
    nextMatchIndex: match.nextMatchIndex ?? null,
    nextSlot: match.nextSlot ?? null,
  };
}

function createEmptyMatch() {
  return cloneMatch({});
}

function participantKey(driver) {
  return driver ? `${driver.seed}-${driver.registrationNumber}-${driver.name}` : "";
}

function normalizeBracketRounds(rounds, pendingFeed = null) {
  if (!Array.isArray(rounds)) return [];
  const normalizedRounds = rounds.map((round, roundIndex) => ({
    name: round?.name || `Round ${roundIndex + 1}`,
    matches: Array.isArray(round?.matches) ? round.matches.map((match, matchIndex) => {
      if (roundIndex === 0) return cloneMatch(match);
      return {
        left: match?.lockedLeft ? cloneDriver(round.matches[matchIndex]?.left) : null,
        right: match?.lockedRight ? cloneDriver(round.matches[matchIndex]?.right) : null,
        winner: cloneDriver(round.matches[matchIndex]?.winner),
        winnerMode: round.matches[matchIndex]?.winnerMode ?? null,
        lockedLeft: Boolean(round.matches[matchIndex]?.lockedLeft),
        lockedRight: Boolean(round.matches[matchIndex]?.lockedRight),
        nextMatchIndex: round.matches[matchIndex]?.nextMatchIndex ?? null,
        nextSlot: round.matches[matchIndex]?.nextSlot ?? null,
      };
    }) : [],
  }));

  for (let roundIndex = 0; roundIndex < normalizedRounds.length; roundIndex += 1) {
    normalizedRounds[roundIndex].matches = normalizedRounds[roundIndex].matches.map((match, matchIndex) => {
      const left = cloneDriver(match.left);
      const right = cloneDriver(match.right);
      const pendingLeft = pendingFeed && roundIndex === 0 && matchIndex === pendingFeed.matchIndex && pendingFeed.side === "left";
      const pendingRight = pendingFeed && roundIndex === 0 && matchIndex === pendingFeed.matchIndex && pendingFeed.side === "right";
      if (roundIndex === 0) {
        if (left && !right && !pendingRight) return { ...match, left, right, winner: cloneDriver(left), winnerMode: "auto" };
        if (!left && right && !pendingLeft) return { ...match, left, right, winner: cloneDriver(right), winnerMode: "auto" };
      }
      const winnerKey = participantKey(match.winner);
      if (left && right && match.winnerMode === "manual"
        && [participantKey(left), participantKey(right)].includes(winnerKey)) {
        return { ...match, left, right, winner: cloneDriver(match.winner), winnerMode: "manual" };
      }
      return { ...match, left, right, winner: null, winnerMode: null };
    });

    if (roundIndex === normalizedRounds.length - 1) continue;
    normalizedRounds[roundIndex].matches.forEach((match, matchIndex) => {
      if (!match.winner) return;
      const nextMatchIndex = match.nextMatchIndex ?? Math.floor(matchIndex / 2);
      const nextMatch = normalizedRounds[roundIndex + 1]?.matches?.[nextMatchIndex];
      if (!nextMatch) return;
      const nextSlot = match.nextSlot ?? (matchIndex % 2 === 0 ? "left" : "right");
      const nextLockKey = nextSlot === "right" ? "lockedRight" : "lockedLeft";
      if (!nextMatch[nextLockKey]) nextMatch[nextSlot] = cloneDriver(match.winner);
    });
  }
  return normalizedRounds;
}

function bracketWinner(rounds) {
  const lastRound = rounds?.[rounds.length - 1];
  return cloneDriver(lastRound?.matches?.[0]?.winner);
}

function matchLoser(match) {
  if (!match?.winner || !match.left || !match.right) return null;
  if (participantKey(match.winner) === participantKey(match.left)) return cloneDriver(match.right);
  if (participantKey(match.winner) === participantKey(match.right)) return cloneDriver(match.left);
  return null;
}

function normalizeThirdPlaceMatch(rounds, existingMatch = null) {
  if (!Array.isArray(rounds) || rounds.length < 2) return null;
  const semifinalRound = rounds[rounds.length - 2];
  if (!semifinalRound?.matches || semifinalRound.matches.length < 2) return null;
  const previous = existingMatch ? cloneMatch(existingMatch) : createEmptyMatch();
  const left = matchLoser(semifinalRound.matches[0]);
  const right = matchLoser(semifinalRound.matches[1]);
  if (left && right && previous.winnerMode === "manual") {
    const winnerKey = participantKey(previous.winner);
    if ([participantKey(left), participantKey(right)].includes(winnerKey)) {
      return { ...previous, left, right, winner: cloneDriver(previous.winner), winnerMode: "manual" };
    }
  }
  return { ...previous, left, right, winner: null, winnerMode: null };
}

function normalizeBracketState(state) {
  if (!state?.mainBracket) return state;
  let pendingFeed = null;
  if (state.lowerBracket) {
    state.lowerBracket.rounds = normalizeBracketRounds(state.lowerBracket.rounds, null);
    const lowerWinner = bracketWinner(state.lowerBracket.rounds);
    const feed = state.lowerBracket.feedsInto;
    const feedMatch = state.mainBracket?.rounds?.[0]?.matches?.[feed?.matchIndex];
    if (feedMatch && feed?.side) {
      if (lowerWinner) {
        feedMatch[feed.side] = cloneDriver({
          ...lowerWinner,
          seed: state.plan?.resolvedFormat === "sdc"
            ? Math.max(2, Number(state.plan?.mainBracketSize || 0) - 1)
            : lowerWinner.seed,
        });
      } else {
        feedMatch[feed.side] = null;
        pendingFeed = feed;
      }
    }
  }
  state.mainBracket.rounds = normalizeBracketRounds(state.mainBracket.rounds, pendingFeed);
  state.mainBracket.thirdPlaceMatch = normalizeThirdPlaceMatch(
    state.mainBracket.rounds,
    state.mainBracket.thirdPlaceMatch,
  );
  return state;
}

function pushFlowEntry(entries, bracketKey, roundIndex, matchIndex, match, title, meta) {
  if (!match?.left || !match?.right || match.winner) return;
  entries.push({ bracketKey, roundIndex, matchIndex, title, meta, match });
}

function pushSideEntries(entries, bracketKey, rounds, leftMeta, rightMeta) {
  rounds.forEach((round, roundIndex) => {
    const half = Math.floor((round.matches || []).length / 2);
    (round.matches || []).slice(0, half).forEach((match, offset) => {
      pushFlowEntry(entries, bracketKey, roundIndex, offset, match, `${round.name} Battle ${offset + 1}`, `${leftMeta} | ${round.name}`);
    });
    (round.matches || []).slice(half).forEach((match, offset) => {
      pushFlowEntry(entries, bracketKey, roundIndex, half + offset, match, `${round.name} Battle ${offset + 1}`, `${rightMeta} | ${round.name}`);
    });
  });
}

function mainFlowEntries(rounds, thirdPlaceMatch) {
  if (!Array.isArray(rounds) || !rounds.length) return [];
  const entries = [];
  if (rounds.length === 1) {
    pushFlowEntry(entries, "main", 0, 0, rounds[0].matches[0], "Final Battle", "Center Stage");
    return entries;
  }
  pushSideEntries(entries, "main", rounds.slice(0, -1), "Left Column", "Right Column");
  const finalRoundIndex = rounds.length - 1;
  if (thirdPlaceMatch?.left && thirdPlaceMatch?.right && !thirdPlaceMatch.winner) {
    pushFlowEntry(entries, "third", 0, 0, thirdPlaceMatch, "3rd Place Battle", "Center Stage");
  }
  pushFlowEntry(entries, "main", finalRoundIndex, 0, rounds[finalRoundIndex].matches[0], "Final Battle", "Center Stage");
  return entries;
}

function lowerFlowEntries(rounds) {
  if (!Array.isArray(rounds) || !rounds.length) return [];
  const entries = [];
  if (rounds.length === 1) {
    pushFlowEntry(entries, "lower", 0, 0, rounds[0].matches[0], "Lower Bracket Final", "Lower Bracket");
    return entries;
  }
  pushSideEntries(entries, "lower", rounds.slice(0, -1), "Lower Left", "Lower Right");
  pushFlowEntry(entries, "lower", rounds.length - 1, 0, rounds[rounds.length - 1].matches[0], "Lower Bracket Final", "Center Stage");
  return entries;
}

function competitionFlow(state) {
  if (!state?.mainBracket?.rounds?.length) return { currentEntry: null, nextEntry: null };
  const lower = lowerFlowEntries(state.lowerBracket?.rounds || []);
  const main = mainFlowEntries(state.mainBracket.rounds, state.mainBracket.thirdPlaceMatch);
  const visible = lower.length ? lower : main;
  return { currentEntry: visible[0] || null, nextEntry: visible[1] || null };
}

function entryKey(entry) {
  return entry ? `${entry.bracketKey}:${Number(entry.roundIndex || 0)}:${Number(entry.matchIndex || 0)}` : "";
}

function cloneEntry(entry) {
  if (!entry) return null;
  return {
    bracketKey: entry.bracketKey,
    roundIndex: Number(entry.roundIndex || 0),
    matchIndex: Number(entry.matchIndex || 0),
    title: entry.title || "Current Battle",
    meta: entry.meta || "",
    match: { left: cloneDriver(entry.match?.left), right: cloneDriver(entry.match?.right) },
  };
}

function emptyVotes() {
  return { j1: null, j2: null, j3: null };
}

function emptyScorecards() {
  return { j1: { left: null, right: null }, j2: { left: null, right: null }, j3: { left: null, right: null } };
}

function emptyControl() {
  return {
    status: "idle", cycle: 1, entry: null, votes: emptyVotes(), scorecards: emptyScorecards(),
    resolvedWinnerSide: null, resolvedAt: null, reason: null, decisionType: null,
    reviewDeadlineAt: null, attemptId: null, reviewSourceReason: null, updatedAt: null,
  };
}

function hasScore(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function normalizeControl(control) {
  const base = emptyControl();
  if (!control || typeof control !== "object") return base;
  const status = ["idle", "voting", "admin_decision", "review_hold"].includes(control.status) ? control.status : "idle";
  const entry = cloneEntry(control.entry);
  if (!entry || status === "idle") return { ...base, cycle: Number.isInteger(control.cycle) && control.cycle > 0 ? control.cycle : 1 };
  const scorecards = emptyScorecards();
  JUDGE_ROLES.forEach((role) => {
    scorecards[role] = {
      left: hasScore(control.scorecards?.[role]?.left) ? Number(control.scorecards[role].left) : null,
      right: hasScore(control.scorecards?.[role]?.right) ? Number(control.scorecards[role].right) : null,
    };
  });
  return {
    status,
    cycle: Number.isInteger(control.cycle) && control.cycle > 0 ? control.cycle : 1,
    entry,
    votes: { ...base.votes, ...(control.votes || {}) },
    scorecards,
    resolvedWinnerSide: ["left", "right"].includes(control.resolvedWinnerSide) ? control.resolvedWinnerSide : null,
    resolvedAt: control.resolvedAt || null,
    reason: typeof control.reason === "string" ? control.reason : null,
    decisionType: ["winner", "omt"].includes(control.decisionType) ? control.decisionType : null,
    reviewDeadlineAt: control.reviewDeadlineAt || null,
    attemptId: typeof control.attemptId === "string" ? control.attemptId : null,
    reviewSourceReason: ["winner", "omt", "tie"].includes(control.reviewSourceReason) ? control.reviewSourceReason : null,
    updatedAt: control.updatedAt || null,
  };
}

function controlForEntry(entry, cycle = 1) {
  return { ...emptyControl(), status: entry ? "voting" : "idle", cycle: Math.max(1, Number(cycle) || 1), entry: cloneEntry(entry), updatedAt: new Date().toISOString() };
}

function matchRef(state, entry) {
  if (entry?.bracketKey === "lower") return state.lowerBracket?.rounds?.[entry.roundIndex]?.matches?.[entry.matchIndex] || null;
  if (entry?.bracketKey === "third") return state.mainBracket?.thirdPlaceMatch || null;
  return state.mainBracket?.rounds?.[entry?.roundIndex]?.matches?.[entry?.matchIndex] || null;
}

function teamBonus(driver) {
  const explicit = Number(driver?.tandemBonusPoints);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const count = Number(driver?.memberCount || driver?.teamMemberCount || driver?.tandemMembers?.length || 0);
  return count >= 3 ? 3 : 0;
}

function resolution(control, eventData) {
  const roles = activeJudgeRoles(eventData);
  if (eventData.competitionMode === TEAM_TANDEM_MODE) {
    const leftSubmittedCount = roles.filter((role) => hasScore(control.scorecards?.[role]?.left)).length;
    const rightSubmittedCount = roles.filter((role) => hasScore(control.scorecards?.[role]?.right)).length;
    const allVoted = roles.length > 0 && leftSubmittedCount === roles.length && rightSubmittedCount === roles.length;
    const currentSide = leftSubmittedCount < roles.length ? "left" : rightSubmittedCount < roles.length ? "right" : null;
    const leftBase = roles.reduce((sum, role) => sum + (Number(control.scorecards?.[role]?.left) || 0), 0);
    const rightBase = roles.reduce((sum, role) => sum + (Number(control.scorecards?.[role]?.right) || 0), 0);
    const leftBonus = teamBonus(control.entry?.match?.left);
    const rightBonus = teamBonus(control.entry?.match?.right);
    const leftTotal = leftBase + leftBonus;
    const rightTotal = rightBase + rightBonus;
    return {
      mode: "scorecard", activeRoles: roles, currentSide, leftSubmittedCount, rightSubmittedCount,
      submittedCount: currentSide === "left" ? leftSubmittedCount : currentSide === "right" ? rightSubmittedCount : roles.length,
      leftVotes: leftTotal, rightVotes: rightTotal, leftBase, rightBase, leftBonus, rightBonus, leftTotal, rightTotal,
      allVoted, tied: allVoted && leftTotal === rightTotal,
      winnerSide: allVoted && leftTotal !== rightTotal ? (leftTotal > rightTotal ? "left" : "right") : null,
    };
  }
  const tally = { left: 0, right: 0, omt: 0 };
  roles.forEach((role) => { if (["left", "right", "omt"].includes(control.votes?.[role])) tally[control.votes[role]] += 1; });
  const allVoted = roles.length > 0 && roles.every((role) => ["left", "right", "omt"].includes(control.votes?.[role]));
  const omtMajority = allVoted && tally.omt > tally.left && tally.omt > tally.right;
  return {
    mode: "vote", activeRoles: roles,
    submittedCount: roles.filter((role) => ["left", "right", "omt"].includes(control.votes?.[role])).length,
    leftVotes: tally.left, rightVotes: tally.right, omtVotes: tally.omt, allVoted, omtMajority,
    tied: allVoted && !omtMajority && tally.left === tally.right,
    winnerSide: allVoted && !omtMajority && tally.left !== tally.right ? (tally.left > tally.right ? "left" : "right") : null,
  };
}

function clearDecision(state, entry) {
  const match = matchRef(state, entry);
  if (!match) return false;
  match.winner = null;
  match.winnerMode = null;
  normalizeBracketState(state);
  return true;
}

function applyDecision(state, entry, side) {
  const match = matchRef(state, entry);
  const selected = match?.[side];
  if (!selected) return null;
  match.winner = cloneDriver(selected);
  match.winnerMode = "manual";
  normalizeBracketState(state);
  return cloneDriver(selected);
}

function decisionDeadline(resolvedAt) {
  return new Date(Date.parse(resolvedAt) + COMPETITION_REVIEW_WINDOW_MS).toISOString();
}

function recordAttempt(state, control, result, resolvedAt, decisionType) {
  const attemptId = `${entryKey(control.entry)}:${control.cycle}:${resolvedAt}`;
  const existing = Array.isArray(state.competitionAttemptHistory) ? state.competitionAttemptHistory : [];
  if (!existing.some((attempt) => attempt?.id === attemptId)) {
    state.competitionAttemptHistory = [...existing, {
      id: attemptId,
      entryKey: entryKey(control.entry),
      cycle: control.cycle,
      decisionType,
      winnerSide: result.winnerSide || null,
      resolvedAt,
      votes: clone(control.votes),
      scorecards: clone(control.scorecards),
      resolution: clone(result),
    }].slice(-100);
  }
  return attemptId;
}

function resolveControl(state, eventData, control, result) {
  if (!control?.entry || !result?.allVoted) return;
  const resolvedAt = new Date().toISOString();
  if (result.omtMajority) {
    clearDecision(state, control.entry);
    control.status = "admin_decision";
    control.reason = "omt";
    control.decisionType = "omt";
    control.resolvedWinnerSide = null;
    control.resolvedAt = resolvedAt;
    control.reviewDeadlineAt = decisionDeadline(resolvedAt);
    control.attemptId = recordAttempt(state, control, result, resolvedAt, "omt");
    control.reviewSourceReason = null;
    control.updatedAt = resolvedAt;
    state.competitionJudgeControl = control;
    return;
  }
  if (result.winnerSide) {
    applyDecision(state, control.entry, result.winnerSide);
    control.resolvedWinnerSide = result.winnerSide;
    control.resolvedAt = resolvedAt;
    control.reason = null;
    control.decisionType = "winner";
    control.reviewDeadlineAt = decisionDeadline(resolvedAt);
    control.attemptId = recordAttempt(state, control, result, resolvedAt, "winner");
    control.reviewSourceReason = null;
    control.status = "admin_decision";
    control.updatedAt = resolvedAt;
    state.competitionJudgeControl = control;
    return;
  }
  clearDecision(state, control.entry);
  control.attemptId = recordAttempt(state, control, result, resolvedAt, "tie");
  control.status = "review_hold";
  control.reason = "tie";
  control.decisionType = null;
  control.reviewDeadlineAt = null;
  control.reviewSourceReason = "tie";
  control.resolvedWinnerSide = null;
  control.resolvedAt = null;
  control.updatedAt = resolvedAt;
  state.competitionJudgeControl = control;
}

function matchesExpectedDecision(control, expectedEntryKey = "", expectedAttemptId = "") {
  if (expectedEntryKey && entryKey(control.entry) !== expectedEntryKey) return false;
  if (expectedAttemptId && control.attemptId !== expectedAttemptId) return false;
  return true;
}

function reviewDecision(stateInput, expectedEntryKey = "", expectedAttemptId = "") {
  const state = clone(stateInput);
  const control = normalizeControl(state.competitionJudgeControl);
  if (control.status !== "admin_decision" || !control.entry || !matchesExpectedDecision(control, expectedEntryKey, expectedAttemptId)) {
    return { changed: false, state };
  }
  if (control.decisionType === "winner") clearDecision(state, control.entry);
  control.status = "review_hold";
  control.reason = "contest";
  control.reviewSourceReason = control.decisionType || null;
  control.decisionType = null;
  control.reviewDeadlineAt = null;
  control.resolvedWinnerSide = null;
  control.updatedAt = new Date().toISOString();
  state.competitionJudgeControl = control;
  return { changed: true, state, control };
}

function continueDecision(stateInput, expectedEntryKey = "", expectedAttemptId = "") {
  const state = clone(stateInput);
  const control = normalizeControl(state.competitionJudgeControl);
  if (!["admin_decision", "review_hold"].includes(control.status) || !control.entry
    || !matchesExpectedDecision(control, expectedEntryKey, expectedAttemptId)) {
    return { changed: false, state };
  }
  const rerunReason = control.status === "admin_decision"
    ? control.decisionType
    : control.reviewSourceReason;
  if (rerunReason === "omt" || control.status === "review_hold") {
    state.competitionJudgeControl = {
      ...controlForEntry(control.entry, Math.max(control.cycle + 1, 2)),
      reason: rerunReason === "omt" ? "omt" : null,
    };
  } else {
    state.competitionJudgeControl = emptyControl();
  }
  return { changed: true, state, control: state.competitionJudgeControl };
}

function prepareControl(state) {
  normalizeBracketState(state);
  const fallback = cloneEntry(competitionFlow(state).currentEntry);
  const existing = normalizeControl(state.competitionJudgeControl);
  if (existing.entry && ["admin_decision", "review_hold"].includes(existing.status)) return { blocked: true };
  if (!fallback && !existing.entry) return { blocked: true };
  const existingKey = entryKey(existing.entry);
  const fallbackKey = entryKey(fallback);
  let control = existing;
  if (!existing.entry || existing.status === "idle" || (fallbackKey && existingKey && fallbackKey !== existingKey)) {
    control = controlForEntry(fallback || existing.entry, 1);
  }
  return { blocked: false, control, fallback };
}

function recordVote(stateInput, eventData, role, side, expectedEntryKey = "") {
  const state = clone(stateInput);
  if (!activeJudgeRoles(eventData).includes(role) || !["left", "right", "omt"].includes(side)) return { changed: false, blocked: true };
  const prepared = prepareControl(state);
  if (prepared.blocked) return { changed: false, blocked: true };
  const { control, fallback } = prepared;
  const currentKey = entryKey(control.entry || fallback);
  if (expectedEntryKey && currentKey !== expectedEntryKey) return { changed: false, blocked: true, stale: true };
  // A judge's first submitted vote is authoritative for this attempt.  The
  // client disables the remaining choices immediately, and this guard keeps a
  // second tab, reconnect, or rapid mobile tap from silently replacing it.
  if (["left", "right", "omt"].includes(control.votes?.[role])) return { changed: false, blocked: true };
  control.status = "voting";
  control.votes = { ...emptyVotes(), ...(control.votes || {}), [role]: side };
  control.updatedAt = new Date().toISOString();
  const sessionEntry = cloneEntry(control.entry || fallback);
  const result = resolution(control, eventData);
  state.competitionJudgeControl = control;
  if (result.allVoted) resolveControl(state, eventData, control, result);
  return { changed: true, state, resolution: result, entry: sessionEntry };
}

function recordScorecard(stateInput, eventData, role, submission, expectedEntryKey = "") {
  const state = clone(stateInput);
  if (!activeJudgeRoles(eventData).includes(role) || eventData.competitionMode !== TEAM_TANDEM_MODE) return { changed: false, blocked: true };
  const side = ["left", "right"].includes(submission?.side) ? submission.side : null;
  const score = clampJudgeScore(submission?.score, role, eventData);
  if (!side || score === null) return { changed: false, blocked: true };
  const prepared = prepareControl(state);
  if (prepared.blocked) return { changed: false, blocked: true };
  const { control, fallback } = prepared;
  const currentKey = entryKey(control.entry || fallback);
  if (expectedEntryKey && currentKey !== expectedEntryKey) return { changed: false, blocked: true, stale: true };
  const before = resolution(control, eventData);
  if (!before.currentSide || side !== before.currentSide || hasScore(control.scorecards?.[role]?.[side])) return { changed: false, blocked: true };
  control.status = "voting";
  control.scorecards = {
    ...emptyScorecards(), ...(control.scorecards || {}),
    [role]: { ...emptyScorecards()[role], ...(control.scorecards?.[role] || {}), [side]: score },
  };
  control.updatedAt = new Date().toISOString();
  const sessionEntry = cloneEntry(control.entry || fallback);
  const result = resolution(control, eventData);
  state.competitionJudgeControl = control;
  if (result.allVoted) resolveControl(state, eventData, control, result);
  return { changed: true, state, resolution: result, entry: sessionEntry };
}

module.exports = {
  COMPETITION_REVIEW_WINDOW_MS,
  activeJudgeRoles,
  clampJudgeScore,
  clone,
  continueDecision,
  entryKey,
  normalizeBracketState,
  recordScorecard,
  recordVote,
  reviewDecision,
};
