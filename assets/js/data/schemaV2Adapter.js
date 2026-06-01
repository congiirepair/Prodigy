export function buildPublicEventShellPayload({
  eventMeta = {},
  activeEventId = "",
  defaultEventId = "main-event",
  status = "active",
  judgeCount = 3,
  judgingMode = "average",
  qualifyingPhase = "waiting",
  registrationClosed = false,
  hasValidVenue = false,
  bracketLive = false,
  streamActive = false,
  nowMs = Date.now(),
} = {}) {
  const source = eventMeta || {};
  const modeSettings = source.modeSettings && typeof source.modeSettings === "object"
    ? { ...source.modeSettings }
    : null;
  const competitionMode = modeSettings?.mode || source.competitionMode || "solo";
  const resolvedJudgeCount = source.judgeCount ?? judgeCount;
  const resolvedJudgingMode = source.judgingMode || judgingMode;
  return {
    id: source.id || activeEventId || defaultEventId,
    name: source.name || "Main Event",
    date: source.date || "",
    status,
    schemaVersion: 2,
    judgeCount: resolvedJudgeCount,
    judgingMode: resolvedJudgingMode,
    competitionMode,
    modeSettings,
    specialEventId: source.specialEventId || modeSettings?.specialEventId || null,
    registrationStatus: registrationClosed ? "closed" : hasValidVenue ? "open" : "disabled",
    liveStatus: bracketLive ? "bracket" : qualifyingPhase,
    publicFlags: {
      registrationEnabled: hasValidVenue && !registrationClosed,
      resultsPublished: Boolean(source.results?.championName || status === "completed" || status === "archived"),
      streamEnabled: Boolean(streamActive),
    },
    updatedAt: source.updatedAt || new Date(nowMs).toISOString(),
    syncStamp: Number(source.syncStamp || nowMs),
  };
}

export function buildPrivateEventConfigPayload({
  eventMeta = {},
  activeEventId = "",
  defaultEventId = "main-event",
  judgeCount = 3,
  judgingMode = "average",
  competitionMode = "solo",
  roleNames = {},
  roleAccess = {},
  venueConfig = {},
  venueProfiles = [],
  judgeRoleClaims = {},
  latestApprovalToast = null,
  nowIso = new Date().toISOString(),
} = {}) {
  const source = eventMeta || {};
  const modeSettings = source.modeSettings && typeof source.modeSettings === "object"
    ? { ...source.modeSettings }
    : null;
  const resolvedCompetitionMode = modeSettings?.mode || competitionMode;
  return {
    eventId: source.id || activeEventId || defaultEventId,
    schemaVersion: 2,
    judgeCount,
    judgingMode,
    competitionMode: resolvedCompetitionMode,
    modeSettings,
    specialEventId: source.specialEventId || modeSettings?.specialEventId || null,
    roleNames,
    roleAccess,
    venueConfig,
    venueProfiles,
    judgeRoleClaims,
    latestApprovalToast,
    createdAt: source.createdAt || nowIso,
    updatedAt: source.updatedAt || nowIso,
    syncStamp: Number(source.syncStamp || Date.now()),
  };
}

export function buildScopedDriverDoc(driver, {
  eventId = "",
  activeEventId = "",
  defaultEventId = "main-event",
  cloneDriver = (value) => value ? JSON.parse(JSON.stringify(value)) : value,
  nowIso = new Date().toISOString(),
} = {}) {
  if (!driver?.id) return null;
  return {
    ...cloneDriver(driver),
    eventId: eventId || activeEventId || defaultEventId,
    schemaVersion: 2,
    status: driver.approvedToRosterAt ? "approved" : driver.checkedInAt ? "checkedIn" : "registered",
    updatedAt: nowIso,
  };
}
