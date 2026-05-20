export function createEmptyEventResultsPayload() {
  return {
    championName: null,
    championSeed: null,
    runnerUpName: null,
    runnerUpSeed: null,
    thirdPlaceName: null,
    thirdPlaceSeed: null,
    fourthPlaceName: null,
    fourthPlaceSeed: null,
    topQualifierName: null,
    topQualifierSeed: null,
    topQualifierScore: null,
    averageBestScore: null,
    totalBattles: 0,
    completedBattles: 0,
    qualifiedCount: 0,
    totalDrivers: 0,
    planDescription: "Waiting for qualifying scores.",
    updatedAt: null,
    completedAt: null,
  };
}

export function calculateTournamentBattleStats(state = null) {
  const rounds = [
    ...(state?.mainBracket?.rounds || []),
    ...(state?.lowerBracket?.rounds || []),
  ];
  let totalBattles = 0;
  let completedBattles = 0;
  rounds.forEach((round) => {
    (round?.matches || []).forEach((match) => {
      if (match?.left && match?.right) {
        totalBattles += 1;
        if (match.winner) completedBattles += 1;
      }
    });
  });
  const thirdPlaceMatch = state?.mainBracket?.thirdPlaceMatch || null;
  if (thirdPlaceMatch?.left && thirdPlaceMatch?.right) {
    totalBattles += 1;
    if (thirdPlaceMatch.winner) completedBattles += 1;
  }
  return { totalBattles, completedBattles };
}

export function normalizeArchivedResultsRecord(record, fallbackId = "", {
  completedStatus = "completed",
  nowIso = () => new Date().toISOString(),
} = {}) {
  if (!record) return null;
  return {
    id: record.id || fallbackId,
    name: record.name || "Untitled Event",
    date: record.date || "",
    status: record.status || completedStatus,
    archivedAt: record.archivedAt || record.results?.completedAt || record.results?.updatedAt || nowIso(),
    results: record.results || createEmptyEventResultsPayload(),
  };
}

export function getArchivedResultsSnapshotPayload(recordMap = {}, options = {}) {
  const entries = Object.entries(recordMap || {})
    .map(([eventId, record]) => [eventId, normalizeArchivedResultsRecord(record, eventId, options)])
    .filter(([, record]) => Boolean(record));
  return Object.fromEntries(entries);
}

export function buildArchivedResultsRecordPayload(eventMeta, results, {
  eventStatus = "completed",
  archivedStatus = "archived",
  completedStatus = "completed",
  nowIso = () => new Date().toISOString(),
} = {}) {
  if (!eventMeta?.id) return null;
  const safeResults = results ? JSON.parse(JSON.stringify(results)) : createEmptyEventResultsPayload();
  const resolvedStatus = eventStatus === archivedStatus ? archivedStatus : completedStatus;
  return normalizeArchivedResultsRecord({
    id: eventMeta.id,
    name: eventMeta.name || "Untitled Event",
    date: eventMeta.date || "",
    status: resolvedStatus,
    archivedAt: safeResults.completedAt || safeResults.updatedAt || nowIso(),
    results: safeResults,
  }, eventMeta.id, { completedStatus, nowIso });
}

export function sortArchivedResultsForDisplay(records = []) {
  return [...records].sort((left, right) => {
    if ((left.status === "archived") !== (right.status === "archived")) {
      return left.status === "archived" ? 1 : -1;
    }
    const rightArchive = right.archivedAt || right.results?.completedAt || right.results?.updatedAt || right.date || "";
    const leftArchive = left.archivedAt || left.results?.completedAt || left.results?.updatedAt || left.date || "";
    if (rightArchive !== leftArchive) return rightArchive.localeCompare(leftArchive);
    const rightDate = right.date || "";
    const leftDate = left.date || "";
    if (rightDate !== leftDate) return rightDate.localeCompare(leftDate);
    return (right.name || "").localeCompare(left.name || "");
  });
}
