export function buildPublicEventShellPayload({
  eventMeta = {},
  activeEventId = "",
  defaultEventId = "main-event",
  status = "active",
  qualifyingPhase = "waiting",
  registrationClosed = false,
  hasValidVenue = false,
  bracketLive = false,
  streamActive = false,
  nowMs = Date.now(),
} = {}) {
  const source = eventMeta || {};
  return {
    id: source.id || activeEventId || defaultEventId,
    name: source.name || "Main Event",
    date: source.date || "",
    status,
    schemaVersion: 2,
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
  return {
    eventId: source.id || activeEventId || defaultEventId,
    schemaVersion: 2,
    judgeCount,
    judgingMode,
    competitionMode,
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
