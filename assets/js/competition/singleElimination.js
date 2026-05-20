function safeId(value, fallback = "entry") {
  return String(value || fallback).trim().replace(/[^\w-]+/g, "_") || fallback;
}

export function getSingleEliminationBracketSize(driverCount = 0) {
  const count = Math.max(0, Number(driverCount || 0));
  if (count <= 2) return 2;
  return 2 ** Math.ceil(Math.log2(count));
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
  let changed = true;
  while (changed) {
    changed = false;
    Object.values(bracket.matches).forEach((match) => {
      if (match.winnerId) return;
      const drivers = [match.driverA, match.driverB].filter(Boolean);
      if (drivers.length !== 1) return;
      advanceWinnerInPlace(bracket, match, drivers[0]);
      changed = true;
    });
  }
}

export function buildRandomSingleEliminationBracket(registrations = [], options = {}) {
  const {
    source = "checkedIn",
    random = Math.random,
    nowIso = new Date().toISOString(),
    createdBy = "event-staff",
  } = options;
  const eligible = registrations
    .filter((entry) => source === "allRegistered" || entry.checkedIn)
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
    driverCount: seededDrivers.length,
    bracketSize,
    source,
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
