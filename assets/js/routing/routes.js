export const ROLE_ROUTE_SLUGS = Object.freeze({
  spectator: "spectator",
  admin: "event-admin",
  j1: "judge-1",
  j2: "judge-2",
  j3: "judge-3",
});

export const ROLE_ROUTE_LOOKUP = Object.freeze(Object.fromEntries(
  Object.entries(ROLE_ROUTE_SLUGS).map(([role, slug]) => [slug, role])
));

export const EVENT_ROUTE_ROLE_SLUGS = Object.freeze({
  spectator: "spectator",
  admin: "admin",
  j1: "judge/1",
  j2: "judge/2",
  j3: "judge/3",
});

export const EVENT_ROUTE_VIEW_ALIASES = Object.freeze({
  register: "self-register",
  registration: "registration",
  "self-register": "self-register",
  checkin: "self-register",
  "check-in": "self-register",
  qualifying: "qualifying",
  bracket: "bracket",
  competition: "bracket",
  results: "results",
  live: "live",
  home: "home",
  privacy: "privacy",
  tech1: "tech1",
  "tech-1": "tech1",
  "tech1drift": "tech1",
});

export const ROUTABLE_VIEWS = new Set([
  "registration",
  "home",
  "live",
  "self-register",
  "self-register-display",
  "qualifying",
  "bracket",
  "results",
  "privacy",
  "tech1",
]);

const PUBLIC_ROUTE_PATHS = Object.freeze({
  home: "/",
  live: "/live",
  "self-register": "/register",
  qualifying: "/qualifying",
  bracket: "/competition",
  results: "/results",
  privacy: "/privacy",
  tech1: "/tech1",
});

export function normalizeRouteViewName(viewName) {
  return String(viewName || "").trim().toLowerCase();
}

export function normalizeEventRouteViewSegment(segment) {
  const normalized = normalizeRouteViewName(segment);
  return EVENT_ROUTE_VIEW_ALIASES[normalized] || (ROUTABLE_VIEWS.has(normalized) ? normalized : null);
}

export function getCleanPublicPathForView(viewName = "home") {
  return PUBLIC_ROUTE_PATHS[viewName] || "/";
}

export function getPublicRouteLabel(viewName = "home") {
  return ({
    home: "Home",
    live: "Live Event",
    "self-register": "Register Driver",
    qualifying: "Qualifying",
    bracket: "Competition",
    results: "Results",
    privacy: "Privacy",
    tech1: "Tech 1 Drift",
  })[viewName] || "Home";
}

export function isPublicRouteView(viewName = "home") {
  return Object.prototype.hasOwnProperty.call(PUBLIC_ROUTE_PATHS, viewName);
}

export function isKnownRouteView(viewName = "home") {
  return ROUTABLE_VIEWS.has(viewName);
}

export function buildEventRoutePath(input = {}) {
  const {
    eventId,
    role,
    viewName = null,
    defaultEventId = "main-event",
    getDefaultViewForRole = () => "home",
    normalizeRouteViewForRole = (_role, requestedView) => requestedView || "home",
  } = input || {};
  const fallbackEventId = String(defaultEventId || "main-event");
  const safeEventId = encodeURIComponent(String(eventId || fallbackEventId).trim() || fallbackEventId);
  const normalizedRole = role === "website-admin" ? "admin" : (role || "spectator");
  const rolePath = EVENT_ROUTE_ROLE_SLUGS[normalizedRole] || EVENT_ROUTE_ROLE_SLUGS.spectator;
  const defaultView = getDefaultViewForRole(normalizedRole);
  const resolvedView = normalizeRouteViewForRole(normalizedRole, viewName || defaultView);
  const viewSuffix = resolvedView && resolvedView !== defaultView
    ? `/${encodeURIComponent(resolvedView)}`
    : "";
  return `/events/${safeEventId}/${rolePath}${viewSuffix}`;
}
