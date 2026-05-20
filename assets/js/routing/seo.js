const INTERNAL_SEO_VIEWS = new Set([
  "registration",
  "website-admin",
  "self-register-display",
  "streamer-dashboard",
  "streamer-library",
  "streamer-demo",
  "streamer-scene",
]);

const SEO_DESCRIPTORS = Object.freeze({
  home: {
    title: "Prodigy RC Comp | RC Drift Event Control",
    description: "Run RC drift competitions from registration and QR check-in through live judging, qualifying, brackets, results, and automatic broadcast layouts.",
  },
  live: {
    title: "Live RC Drift Event | Prodigy RC Comp",
    description: "Watch the active RC drift event with live competition state and automatic Stream Studio layouts.",
  },
  "self-register": {
    title: "Driver Registration | Prodigy RC Comp",
    description: "Register for the active RC drift event and complete venue check-in when event staff enable it.",
  },
  qualifying: {
    title: "Live Qualifying Standings | Prodigy RC Comp",
    description: "Follow RC drift qualifying order, live judge scoring, and standings for the active event.",
  },
  bracket: {
    title: "Competition Bracket | Prodigy RC Comp",
    description: "Follow RC drift bracket battles, battle flow, podium paths, and competition progress.",
  },
  results: {
    title: "RC Drift Results Archive | Prodigy RC Comp",
    description: "View completed RC drift event results, podiums, qualifying summaries, and archived competition history.",
  },
  privacy: {
    title: "Privacy Notice | Prodigy RC Comp",
    description: "Learn how Prodigy Event Control handles driver profiles, preregistration, venue check-in, event staff access, and saved results.",
  },
  tech1: {
    title: "Tech 1 Drift Anniversary Competition | Prodigy RC Comp",
    description: "Register for the Tech 1 Drift Anniversary Competition, track raffle tickets with event staff, and follow the randomized single-elimination battle bracket.",
  },
});

function getMetaTarget(nameOrProperty = "") {
  const rawValue = String(nameOrProperty || "");
  if (rawValue.startsWith("property:")) {
    const property = rawValue.slice("property:".length);
    return {
      selector: `meta[property="${property}"]`,
      attributeName: "property",
      attributeValue: property,
    };
  }
  return {
    selector: `meta[name="${rawValue}"]`,
    attributeName: "name",
    attributeValue: rawValue,
  };
}

export function setMetaContent(doc, nameOrProperty, value) {
  if (!doc || !nameOrProperty) return null;
  const target = getMetaTarget(nameOrProperty);
  let element = doc.querySelector(target.selector);
  if (!element) {
    element = doc.createElement("meta");
    element.setAttribute(target.attributeName, target.attributeValue);
    doc.head.appendChild(element);
  }
  element.setAttribute("content", value);
  return element;
}

export function setCanonicalHref(doc, href) {
  if (!doc) return null;
  let canonical = doc.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = doc.createElement("link");
    canonical.setAttribute("rel", "canonical");
    doc.head.appendChild(canonical);
  }
  canonical.setAttribute("href", href);
  return canonical;
}

export function getSeoDescriptor(input = {}) {
  const viewName = typeof input === "string" ? input : input.viewName;
  return SEO_DESCRIPTORS[viewName] || SEO_DESCRIPTORS.home;
}

export function isInternalRouteForSeo(input = {}) {
  const {
    route = null,
    viewName = "home",
    standaloneDemoMode = false,
    testModeEnabled = false,
    hasInternalSearchState = false,
  } = input || {};
  if (standaloneDemoMode || testModeEnabled || hasInternalSearchState) return true;
  if (route?.routeStyle === "internal-path") return true;
  if (route?.kind === "website-admin" || route?.kind === "streamer") return true;
  if (route?.kind === "role" && route.role !== "spectator") return true;
  return INTERNAL_SEO_VIEWS.has(viewName);
}

export function buildSeoCanonicalUrl(input = {}) {
  const {
    route = null,
    viewName = "home",
    productionOrigin = "",
    buildEventRoutePath,
    getCleanPublicPathForView,
  } = input || {};
  if (route?.routeStyle === "event-path" && route.eventId && route.role === "spectator" && typeof buildEventRoutePath === "function") {
    return `${productionOrigin}${buildEventRoutePath(route.eventId, "spectator", viewName)}`;
  }
  const cleanPath = typeof getCleanPublicPathForView === "function"
    ? getCleanPublicPathForView(viewName)
    : "/";
  return `${productionOrigin}${cleanPath}`;
}

export function syncSeoMetadataForRoute(input = {}) {
  const {
    doc,
    route = null,
    viewName = "home",
    standaloneDemoMode = false,
    testModeEnabled = false,
    hasInternalSearchState = false,
    productionOrigin = "",
    buildEventRoutePath,
    getCleanPublicPathForView,
  } = input || {};
  if (!doc) return null;

  const descriptor = getSeoDescriptor({ viewName });
  const noindex = isInternalRouteForSeo({
    route,
    viewName,
    standaloneDemoMode,
    testModeEnabled,
    hasInternalSearchState,
  });
  const canonicalUrl = noindex
    ? `${productionOrigin}${typeof getCleanPublicPathForView === "function" ? getCleanPublicPathForView(viewName) : "/"}`
    : buildSeoCanonicalUrl({
        route,
        viewName,
        productionOrigin,
        buildEventRoutePath,
        getCleanPublicPathForView,
      });

  doc.title = descriptor.title;
  setMetaContent(doc, "description", descriptor.description);
  setMetaContent(doc, "robots", noindex ? "noindex, nofollow" : "index, follow");
  setCanonicalHref(doc, canonicalUrl);
  setMetaContent(doc, "property:og:title", descriptor.title);
  setMetaContent(doc, "property:og:description", descriptor.description);
  setMetaContent(doc, "property:og:url", canonicalUrl);
  setMetaContent(doc, "twitter:title", descriptor.title);
  setMetaContent(doc, "twitter:description", descriptor.description);

  return {
    descriptor,
    noindex,
    canonicalUrl,
  };
}
