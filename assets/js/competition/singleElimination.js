function safeId(value, fallback = "entry") {
  return String(value || fallback).trim().replace(/[^\w-]+/g, "_") || fallback;
}

export function getSingleEliminationBracketSize(driverCount = 0) {
  const count = Math.max(0, Number(driverCount || 0));
  if (count <= 2) return 2;
  return 2 ** Math.ceil(Math.log2(count));
}

function normalizeSingleEliminationSource(source = "checkedIn") {
  if (source === "allRegistered") return "allRegistered";
  if (source === "bracketEligible") return "bracketEligible";
  return "checkedIn";
}

function isEligibleForSource(entry = {}, source = "checkedIn") {
  if (source === "allRegistered") return true;
  if (source === "bracketEligible") return Boolean(entry.bracketEligible);
  return Boolean(entry.checkedIn);
}

export function getSingleEliminationBracketProjection(registrations = [], options = {}) {
  const source = normalizeSingleEliminationSource(options.source);
  const eligible = registrations
    .filter((entry) => isEligibleForSource(entry, source))
    .filter((entry) => entry && (entry.id || entry.registrationId) && (entry.name || entry.displayName));
  const eligibleCount = eligible.length;
  const bracketSize = getSingleEliminationBracketSize(eligibleCount);
  const byeCount = eligibleCount >= 2 ? Math.max(0, bracketSize - eligibleCount) : 0;
  const blockedReason = eligibleCount < 2
    ? source === "checkedIn"
      ? "Check in at least 2 drivers before generating the bracket."
      : source === "bracketEligible"
        ? "Mark at least 2 drivers as Competing before generating the bracket."
        : "Register at least 2 drivers before generating the bracket."
    : "";
  return {
    source,
    eligibleCount,
    bracketSize,
    byeCount,
    blockedReason,
  };
}

function getRoundSlotSpan(roundNumber = 1) {
  const round = Math.max(1, Number.parseInt(roundNumber, 10) || 1);
  return 2 ** round;
}

function getMatchSourceSlotRange(match = {}) {
  const round = Math.max(1, Number.parseInt(match.round, 10) || 1);
  const matchNumber = Math.max(1, Number.parseInt(match.matchNumber, 10) || 1);
  const slotSpan = getRoundSlotSpan(round);
  const startSlot = ((matchNumber - 1) * slotSpan) + 1;
  return {
    startSlot,
    endSlot: startSlot + slotSpan - 1,
  };
}

function rangesOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

export function getBracketDisplayWindow(bracket = null, options = {}) {
  const pageSize = Math.max(1, Number.parseInt(options.pageSize, 10) || 16);
  const requestedPageIndex = Math.max(0, Number.parseInt(options.pageIndex ?? options.groupIndex, 10) || 0);
  const round = Math.max(1, Number.parseInt(options.round, 10) || 1);
  const showByes = options.showByes !== false;
  const totalSlots = Math.max(0, Number.parseInt(bracket?.bracketSize, 10) || 0);
  const totalPages = totalSlots > 0 ? Math.ceil(totalSlots / pageSize) : 0;
  const pageIndex = totalPages > 0 ? Math.min(requestedPageIndex, totalPages - 1) : 0;
  const startSlot = totalSlots > 0 ? (pageIndex * pageSize) + 1 : 0;
  const endSlot = totalSlots > 0 ? Math.min(totalSlots, startSlot + pageSize - 1) : 0;
  const matches = bracket?.matches || {};
  const firstRoundMatches = bracket?.rounds?.find((entry) => Number(entry.round) === 1)?.matchIds || [];
  const visibleSlots = [];

  for (let slotNumber = startSlot; slotNumber <= endSlot; slotNumber += 1) {
    const matchIndex = Math.ceil(slotNumber / 2) - 1;
    const matchId = firstRoundMatches[matchIndex] || `r1m${matchIndex + 1}`;
    const match = matches[matchId] || null;
    const side = slotNumber % 2 === 1 ? "driverA" : "driverB";
    const driver = match?.[side] || null;
    if (driver || showByes) {
      visibleSlots.push({
        slotNumber,
        matchId,
        side,
        driver,
        isBye: !driver,
      });
    }
  }

  const visibleMatches = Object.values(matches)
    .filter((match) => {
      if (Number(match?.round || 0) < round) return false;
      const range = getMatchSourceSlotRange(match);
      return rangesOverlap(range.startSlot, range.endSlot, startSlot, endSlot);
    })
    .map((match) => ({
      ...match,
      sourceSlotStart: getMatchSourceSlotRange(match).startSlot,
      sourceSlotEnd: getMatchSourceSlotRange(match).endSlot,
    }))
    .sort((left, right) => (Number(left.round || 0) - Number(right.round || 0)) || (Number(left.matchNumber || 0) - Number(right.matchNumber || 0)));

  return {
    totalSlots,
    pageSize,
    pageIndex,
    totalPages,
    startSlot,
    endSlot,
    visibleSlots,
    visibleMatches,
    driverCount: Number(bracket?.driverCount || bracket?.randomizedSeedOrder?.length || 0),
    bracketSize: totalSlots,
    byeCount: Number(bracket?.byes?.length || 0),
  };
}

export function shuffleEntries(entries = [], random = Math.random) {
  const shuffled = [...entries];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor((Number(random()) || 0) * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function buildBracketDriver(entry = {}, seed = 1) {
  return {
    id: safeId(entry.id || entry.registrationId, `driver-${seed}`),
    seed,
    name: String(entry.name || entry.displayName || "Unnamed Driver"),
    teamName: String(entry.teamName || ""),
    chassis: String(entry.chassis || ""),
    instagram: String(entry.instagram || ""),
  };
}

function getRoundName(roundNumber, remainingSlots) {
  if (remainingSlots === 2) return "Final";
  if (remainingSlots === 4) return "Semi Finals";
  if (remainingSlots === 8) return "Top 8";
  if (remainingSlots === 16) return "Top 16";
  if (remainingSlots === 32) return "Top 32";
  if (remainingSlots === 64) return "Top 64";
  return `Round ${roundNumber}`;
}

function createEmptyMatch(roundNumber, matchNumber, remainingSlots, totalRounds) {
  const id = `r${roundNumber}m${matchNumber}`;
  const nextRound = roundNumber + 1;
  const nextMatchNumber = Math.ceil(matchNumber / 2);
  return {
    id,
    round: roundNumber,
    roundName: getRoundName(roundNumber, remainingSlots),
    matchNumber,
    driverA: null,
    driverB: null,
    winnerId: null,
    resultStatus: "pending",
    notes: "",
    advancedToMatchId: roundNumber < totalRounds ? `r${nextRound}m${nextMatchNumber}` : null,
    advancedToSlot: matchNumber % 2 === 1 ? "driverA" : "driverB",
  };
}

function cloneBracket(bracket = {}) {
  return JSON.parse(JSON.stringify(bracket || {}));
}

function advanceWinnerInPlace(bracket, match, winner) {
  if (!match || !winner) return;
  match.winnerId = winner.id;
  match.resultStatus = match.driverA && match.driverB ? "complete" : "bye";
  if (!match.advancedToMatchId) return;
  const nextMatch = bracket.matches[match.advancedToMatchId];
  if (!nextMatch) return;
  nextMatch[match.advancedToSlot || "driverA"] = winner;
}

function autoAdvanceByes(bracket) {
  Object.values(bracket.matches).forEach((match) => {
    if (match.round !== 1 || match.winnerId) return;
    const drivers = [match.driverA, match.driverB].filter(Boolean);
    if (drivers.length !== 1) return;
    advanceWinnerInPlace(bracket, match, drivers[0]);
  });
}

export function buildRandomSingleEliminationBracket(registrations = [], options = {}) {
  const {
    source = "checkedIn",
    random = Math.random,
    nowIso = new Date().toISOString(),
    createdBy = "event-staff",
  } = options;
  const normalizedSource = normalizeSingleEliminationSource(source);
  const eligible = registrations
    .filter((entry) => isEligibleForSource(entry, normalizedSource))
    .filter((entry) => entry && (entry.id || entry.registrationId) && (entry.name || entry.displayName));
  const shuffled = shuffleEntries(eligible, random);
  const bracketSize = getSingleEliminationBracketSize(shuffled.length);
  const totalRounds = Math.max(1, Math.log2(bracketSize));
  const seededDrivers = shuffled.map((entry, index) => buildBracketDriver(entry, index + 1));
  const byeCount = bracketSize - seededDrivers.length;
  const rounds = [];
  const matches = {};

  for (let roundIndex = 1; roundIndex <= totalRounds; roundIndex += 1) {
    const remainingSlots = bracketSize / (2 ** (roundIndex - 1));
    const matchCount = remainingSlots / 2;
    const matchIds = [];
    for (let matchIndex = 1; matchIndex <= matchCount; matchIndex += 1) {
      const match = createEmptyMatch(roundIndex, matchIndex, remainingSlots, totalRounds);
      matches[match.id] = match;
      matchIds.push(match.id);
    }
    rounds.push({
      round: roundIndex,
      name: getRoundName(roundIndex, remainingSlots),
      matchIds,
    });
  }

  let driverIndex = 0;
  rounds[0]?.matchIds.forEach((matchId, index) => {
    const match = matches[matchId];
    match.driverA = seededDrivers[driverIndex] || null;
    driverIndex += 1;
    if (index < byeCount) {
      match.driverB = null;
    } else {
      match.driverB = seededDrivers[driverIndex] || null;
      driverIndex += 1;
    }
  });

  const bracket = {
    status: "generated",
    generatedAt: nowIso,
    lockedAt: null,
    winnerRevealStatus: "hidden",
    winnerRevealedAt: null,
    winnerRevealUpdatedBy: "",
    driverCount: seededDrivers.length,
    bracketSize,
    source: normalizedSource,
    rounds,
    matches,
    randomizedSeedOrder: seededDrivers.map((driver) => driver.id),
    byes: [],
    createdBy,
    updatedAt: nowIso,
  };

  autoAdvanceByes(bracket);
  bracket.byes = Object.values(bracket.matches)
    .filter((match) => match.round === 1 && match.resultStatus === "bye")
    .map((match) => ({ matchId: match.id, driverId: match.winnerId }));
  return bracket;
}

export function applySingleEliminationWinner(bracket = {}, matchId = "", winnerId = "", options = {}) {
  const nextBracket = cloneBracket(bracket);
  const match = nextBracket.matches?.[matchId];
  if (!match) return nextBracket;
  const winner = [match.driverA, match.driverB].find((driver) => driver?.id === winnerId) || null;
  if (!winner) return nextBracket;
  advanceWinnerInPlace(nextBracket, match, winner);
  match.notes = options.notes || match.notes || "";
  nextBracket.updatedAt = options.nowIso || new Date().toISOString();
  autoAdvanceByes(nextBracket);
  const finalMatch = Object.values(nextBracket.matches || {}).find((candidate) => !candidate.advancedToMatchId);
  if (finalMatch?.winnerId) {
    nextBracket.status = "complete";
  } else if (nextBracket.status === "locked" || nextBracket.status === "generated") {
    nextBracket.status = "in_progress";
  }
  return nextBracket;
}

export function resetSingleEliminationWinners(bracket = {}, options = {}) {
  const nextBracket = cloneBracket(bracket);
  if (!nextBracket?.matches || !Array.isArray(nextBracket.rounds)) return nextBracket;
  Object.values(nextBracket.matches).forEach((match) => {
    if (!match) return;
    if (Number(match.round || 0) > 1) {
      match.driverA = null;
      match.driverB = null;
    }
    match.winnerId = null;
    match.resultStatus = "pending";
    match.notes = "";
  });
  autoAdvanceByes(nextBracket);
  nextBracket.byes = Object.values(nextBracket.matches)
    .filter((match) => match.round === 1 && match.resultStatus === "bye")
    .map((match) => ({ matchId: match.id, driverId: match.winnerId }));
  nextBracket.status = options.status || (nextBracket.lockedAt ? "locked" : "generated");
  nextBracket.winnerRevealStatus = "hidden";
  nextBracket.winnerRevealedAt = null;
  nextBracket.winnerRevealUpdatedBy = "";
  nextBracket.updatedAt = options.nowIso || new Date().toISOString();
  return nextBracket;
}
