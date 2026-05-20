export function normalizeCloudRoleName(role) {
  if (role === "admin") return "eventAdmin";
  if (role === "stream" || role === "streamer") return "streamOperator";
  if (role === "judge1") return "j1";
  if (role === "judge2") return "j2";
  if (role === "judge3") return "j3";
  return role || "";
}

export function getCloudClaimRoles(claims = null) {
  const roles = new Set();
  if (!claims || typeof claims !== "object") return roles;
  if (typeof claims.role === "string") roles.add(normalizeCloudRoleName(claims.role));
  if (Array.isArray(claims.roles)) {
    claims.roles.forEach((role) => roles.add(normalizeCloudRoleName(role)));
  }
  ["owner", "websiteAdmin", "eventAdmin", "admin", "judge", "j1", "j2", "j3", "stream", "streamer", "streamOperator"].forEach((role) => {
    if (claims[role] === true) roles.add(normalizeCloudRoleName(role));
  });
  return roles;
}

export function cloudClaimsIncludeRole(role, eventId, claims = null) {
  const normalizedRole = normalizeCloudRoleName(role);
  if (!normalizedRole) return false;
  const globalRoles = getCloudClaimRoles(claims);
  if (globalRoles.has("owner") || globalRoles.has("websiteAdmin")) return true;
  if (globalRoles.has(normalizedRole)) return true;
  if (normalizedRole === "eventAdmin" && globalRoles.has("admin")) return true;
  if (["j1", "j2", "j3"].includes(normalizedRole) && globalRoles.has("judge")) return true;
  if (normalizedRole === "streamOperator" && (globalRoles.has("eventAdmin") || globalRoles.has("stream"))) return true;
  const eventRoles = claims?.eventRoles;
  const scopedRoles = eventId && eventRoles && typeof eventRoles === "object" && Array.isArray(eventRoles[eventId])
    ? new Set(eventRoles[eventId].map(normalizeCloudRoleName))
    : new Set();
  if (scopedRoles.has(normalizedRole)) return true;
  if (normalizedRole === "eventAdmin" && scopedRoles.has("admin")) return true;
  if (["j1", "j2", "j3"].includes(normalizedRole) && scopedRoles.has("judge")) return true;
  if (normalizedRole === "streamOperator" && (scopedRoles.has("eventAdmin") || scopedRoles.has("stream"))) return true;
  return false;
}

export function getRoleAuthorizationMessage(role = "this") {
  const label = role?.startsWith?.("j")
    ? role.toUpperCase()
    : role === "admin"
      ? "event admin"
      : normalizeCloudRoleName(role || "this").replace(/([A-Z])/g, " $1").toLowerCase();
  return `Your account is not authorized for this event role. Ask the event owner to assign ${label} access, then refresh your session.`;
}
