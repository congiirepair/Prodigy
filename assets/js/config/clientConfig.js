export function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

export function mergeClientConfig(base, override) {
  if (Array.isArray(base)) {
    return Array.isArray(override) ? override.slice() : base.slice();
  }
  if (isPlainObject(base)) {
    const merged = { ...base };
    if (!isPlainObject(override)) return merged;
    Object.keys(override).forEach((key) => {
      const overrideValue = override[key];
      const baseValue = base[key];
      if (Array.isArray(baseValue)) {
        merged[key] = Array.isArray(overrideValue) ? overrideValue.slice() : baseValue.slice();
        return;
      }
      if (isPlainObject(baseValue)) {
        merged[key] = mergeClientConfig(baseValue, overrideValue);
        return;
      }
      merged[key] = overrideValue ?? baseValue;
    });
    return merged;
  }
  return override ?? base;
}

export function sanitizeHostValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  return normalized
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "www.");
}

export function normalizeHostList(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map(sanitizeHostValue)
      .filter(Boolean)
  ));
}

export function buildConfiguredHostRouteContexts(routingConfig = {}, firebaseConfigBlock = {}, roleRouteSlugs = {}) {
  const contexts = {};
  const spectatorHosts = normalizeHostList([
    routingConfig.spectatorHost,
    ...(routingConfig.spectatorAliases || []),
    ...(firebaseConfigBlock.spectatorAliases || []),
  ]);
  spectatorHosts.forEach((host) => {
    contexts[host] = { kind: "role", role: "spectator", view: "home", slug: "spectator" };
  });
  const adminHost = sanitizeHostValue(routingConfig.adminHost);
  if (adminHost) {
    contexts[adminHost] = { kind: "role", role: "admin", view: "registration", slug: "event-admin" };
  }
  ["j1", "j2", "j3"].forEach((roleKey) => {
    const judgeHost = sanitizeHostValue(routingConfig?.judgeHosts?.[roleKey]);
    if (!judgeHost) return;
    contexts[judgeHost] = { kind: "role", role: roleKey, view: "qualifying", slug: roleRouteSlugs?.[roleKey] || `judge-${roleKey.slice(1)}` };
  });
  const websiteAdminHost = sanitizeHostValue(routingConfig.websiteAdminHost);
  if (websiteAdminHost) {
    contexts[websiteAdminHost] = { kind: "website-admin", slug: "website-admin" };
  }
  const streamerHosts = normalizeHostList([
    routingConfig.streamerHost,
    ...(routingConfig.streamerAliases || []),
  ]);
  streamerHosts.forEach((host) => {
    contexts[host] = { kind: "streamer", view: "streamer-dashboard", slug: "streamer" };
  });
  return contexts;
}
