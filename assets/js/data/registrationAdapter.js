function getRegistrationPublicStatus(normalized = {}) {
  if (normalized.status === "approved") return "approved";
  if (normalized.status === "checkedIn") return "checkedIn";
  if (normalized.status === "rejected") return "rejected";
  if (normalized.status === "pending") return "pending";
  return normalized.rejectedAt
    ? "rejected"
    : normalized.paidAt
      ? "approved"
      : normalized.checkedInAt
        ? "checkedIn"
        : "pending";
}

export function buildScopedRegistrationDoc(entry, {
  eventId = "",
  activeEventId = "",
  defaultEventId = "main-event",
  normalizePendingRegistrationList,
  ownerUid = null,
  nowIso = new Date().toISOString(),
} = {}) {
  const normalized = normalizePendingRegistrationList([entry])[0];
  if (!normalized) return null;
  return {
    ...normalized,
    eventId: eventId || activeEventId || defaultEventId,
    schemaVersion: 2,
    ownerUid: normalized.ownerUid || ownerUid || null,
    status: getRegistrationPublicStatus(normalized),
    updatedAt: nowIso,
  };
}

export function buildPublicRegistrationIndexDoc(entry, {
  eventId = "",
  activeEventId = "",
  defaultEventId = "main-event",
  normalizePendingRegistrationList,
  nowIso = new Date().toISOString(),
} = {}) {
  const normalized = normalizePendingRegistrationList([entry])[0];
  if (!normalized) return null;
  return {
    publicId: normalized.id,
    registrationId: normalized.id,
    eventId: eventId || activeEventId || defaultEventId,
    schemaVersion: 2,
    displayName: normalized.name || "",
    driverNumber: normalized.driverNumber || "",
    teamName: normalized.teamName || "",
    chassis: normalized.chassis || "",
    teamRegistrationId: normalized.teamRegistrationId || "",
    teamMemberOrder: normalized.teamMemberOrder || null,
    teamMemberCount: normalized.teamMemberCount || null,
    status: getRegistrationPublicStatus(normalized),
    checkedIn: Boolean(normalized.checkedInAt),
    updatedAt: nowIso,
  };
}

export function buildPendingRegistrationsFromPublicIndexDocs(docs = [], {
  normalizePendingRegistrationList,
  nowIso = new Date().toISOString(),
} = {}) {
  return normalizePendingRegistrationList(
    docs
      .map((entry) => {
        const data = entry.data || {};
        if (data.status === "approved") return null;
        return {
          id: data.registrationId || data.publicId || data.id,
          name: data.name || data.displayName || "",
          driverNumber: data.driverNumber || "",
          teamName: data.teamName || "",
          chassis: data.chassis || "",
          teamRegistrationId: data.teamRegistrationId || "",
          teamMemberOrder: data.teamMemberOrder || null,
          teamMemberCount: data.teamMemberCount || null,
          checkedInAt: data.checkedIn ? (data.updatedAt || nowIso) : null,
          rejectedAt: data.status === "rejected" ? (data.updatedAt || nowIso) : null,
          paidAt: data.status === "approved" ? (data.updatedAt || nowIso) : null,
        };
      })
      .filter(Boolean)
  );
}
