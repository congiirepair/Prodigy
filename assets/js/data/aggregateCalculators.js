export function buildPublicAggregatesPayload({
  activeEventId = "",
  defaultEventId = "main-event",
  activeEventMeta = null,
  rankedDrivers = [],
  results = {},
  qualifyingPhase = "waiting",
  currentDriverId = null,
  bracketLive = false,
  tournamentState = null,
  nowIso = new Date().toISOString(),
} = {}) {
  const eventId = activeEventId || defaultEventId;
  return {
    liveSummary: {
      eventId,
      schemaVersion: 2,
      eventName: activeEventMeta?.name || "Main Event",
      qualifyingPhase,
      currentDriverId,
      liveStatus: bracketLive ? "bracket" : qualifyingPhase,
      updatedAt: nowIso,
    },
    qualifyingStandings: {
      eventId,
      schemaVersion: 2,
      standings: rankedDrivers.map((driver, index) => ({
        driverId: driver.id,
        rank: index + 1,
        name: driver.name,
        teamName: driver.teamName || "",
        chassis: driver.chassis || "",
        bestScore: Number(driver.bestScore || 0),
        averageScore: Number(driver.averageScore || 0),
      })),
      updatedAt: nowIso,
    },
    bracketDisplay: {
      eventId,
      schemaVersion: 2,
      bracket: tournamentState ? JSON.parse(JSON.stringify(tournamentState)) : null,
      updatedAt: nowIso,
    },
    resultsSummary: {
      eventId,
      schemaVersion: 2,
      results,
      updatedAt: nowIso,
    },
  };
}
