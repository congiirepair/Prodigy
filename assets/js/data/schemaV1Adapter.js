export function normalizeLegacyEventPayload(payload, {
  activeEventId = "",
  normalizeJudgingMode,
  normalizeJudgeCountForMode,
  normalizeCompetitionMode,
  normalizeEventBannerSource,
  buildDefaultRoleNames,
  createDefaultVenueConfig,
  normalizeVenueProfileList,
  normalizePendingRegistrationList,
  getSanitizedJudgeRoleClaims,
  buildEmptyEventResults,
  activeStatus = "active",
  completedStatus = "completed",
  archivedStatus = "archived",
  nowIso = () => new Date().toISOString(),
} = {}) {
  if (!payload) return null;
  const judgingMode = normalizeJudgingMode(payload.judgingMode);
  const rawModeSettings = payload.modeSettings && typeof payload.modeSettings === "object"
    ? { ...payload.modeSettings }
    : null;
  const competitionMode = normalizeCompetitionMode(
    rawModeSettings?.mode
      || payload.competitionMode
      || rawModeSettings?.legacySpecialEventMode
      || payload.mode
  );
  return {
    id: payload.id || activeEventId,
    name: payload.name || "Untitled Event",
    date: payload.date || "",
    upcomingEventBanner: normalizeEventBannerSource(payload.upcomingEventBanner),
    status: [activeStatus, completedStatus, archivedStatus].includes(payload.status)
      ? payload.status
      : activeStatus,
    schemaVersion: Number(payload.schemaVersion || 1),
    judgeCount: normalizeJudgeCountForMode(payload.judgeCount, judgingMode),
    judgingMode,
    competitionMode,
    modeSettings: rawModeSettings,
    specialEventId: payload.specialEventId || rawModeSettings?.specialEventId || null,
    createdAt: payload.createdAt || nowIso(),
    updatedAt: payload.updatedAt || nowIso(),
    syncStamp: payload.syncStamp || 0,
    roleNames: buildDefaultRoleNames(payload.roleNames || {}),
    venueConfig: createDefaultVenueConfig(payload.venueConfig || {}),
    venueProfiles: normalizeVenueProfileList(payload.venueProfiles),
    pendingRegistrations: normalizePendingRegistrationList(payload.pendingRegistrations),
    latestApprovalToast: payload.latestApprovalToast || null,
    judgeRoleClaims: getSanitizedJudgeRoleClaims(payload),
    roleAccess: payload.roleAccess || {},
    results: payload.results || buildEmptyEventResults(),
  };
}
