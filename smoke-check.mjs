import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const rootPath = path.dirname(currentFilePath);
const html = fs.readFileSync(path.join(rootPath, "index.html"), "utf8");
const appSource = fs.readFileSync(path.join(rootPath, "assets", "js", "app.js"), "utf8");
const jsModuleRoot = path.join(rootPath, "assets", "js");
function readJsModules(dirPath) {
  return fs.readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) return readJsModules(entryPath);
    return entry.name.endsWith(".js") ? fs.readFileSync(entryPath, "utf8") : [];
  });
}
const jsModuleSources = readJsModules(jsModuleRoot);
const appBundle = `${html}\n${appSource}\n${jsModuleSources.join("\n")}`;
const registrationAdapterSource = fs.readFileSync(path.join(jsModuleRoot, "data", "registrationAdapter.js"), "utf8");
const publicIndexFunctionSource = registrationAdapterSource.slice(
  registrationAdapterSource.indexOf("export function buildPublicRegistrationIndexDoc"),
  registrationAdapterSource.indexOf("export function buildPendingRegistrationsFromPublicIndexDocs")
);
const routeSource = fs.readFileSync(path.join(jsModuleRoot, "routing", "routes.js"), "utf8");
const seoSource = fs.readFileSync(path.join(jsModuleRoot, "routing", "seo.js"), "utf8");
const publicEmptyStatesSource = fs.readFileSync(path.join(jsModuleRoot, "views", "publicEmptyStates.js"), "utf8");
const publicHomeViewSource = fs.readFileSync(path.join(jsModuleRoot, "views", "publicHomeView.js"), "utf8");
const privacyViewSource = fs.readFileSync(path.join(jsModuleRoot, "views", "privacyView.js"), "utf8");
const resultsViewSource = fs.readFileSync(path.join(jsModuleRoot, "views", "resultsView.js"), "utf8");
const tech1ViewSource = fs.readFileSync(path.join(jsModuleRoot, "views", "tech1DriftView.js"), "utf8");
const tech1AdapterSource = fs.readFileSync(path.join(jsModuleRoot, "data", "tech1AnniversaryAdapter.js"), "utf8");
const tech1BracketSource = fs.readFileSync(path.join(jsModuleRoot, "competition", "singleElimination.js"), "utf8");
const privateKeyMarker = ["private", "key"].join("_");
const serviceAccountEmailPattern = new RegExp(["client", "email"].join("_") + ".*iam\\.gserviceaccount\\.com", "i");

const checks = [
  {
    name: "website admin gate exists",
    test: () => html.includes('id="websiteAdminGate"') && html.includes('id="websiteAdminUnlockBtn"'),
  },
  {
    name: "device cache reset tool exists",
    test: () => appBundle.includes("function clearLocalDeviceCaches()") && html.includes('id="websiteAdminClearCacheBtn"'),
  },
  {
    name: "directory sync publishes deleted event tombstones",
    test: () => appBundle.includes("deletedEventIds: getDeletedEventIdsSnapshot()"),
  },
  {
    name: "deleted events are filtered from merged directory snapshots",
    test: () => appBundle.includes("if (isDeletedEventId(eventId)) return;"),
  },
  {
    name: "delete event removes archived results entry",
    test: () => appBundle.includes("delete archivedResultsDirectory[eventId];"),
  },
  {
    name: "renderQueueView no longer carries the dead legacy branch",
    test: () => !appBundle.includes("function renderQueueView() {\r\n      return renderQueueViewV2();\r\n      if (!publicEventSpotlight")
      && !appBundle.includes("function renderQueueView() {\n      return renderQueueViewV2();\n      if (!publicEventSpotlight"),
  },
  {
    name: "scoped Firestore path helpers preserve schema v2 registration index path",
    test: () => appBundle.includes('"events", eventIdOrDefault(eventId), "publicRegistrationIndex"'),
  },
  {
    name: "cloud claim helper keeps owner and website admin global authorization",
    test: () => appBundle.includes('globalRoles.has("owner") || globalRoles.has("websiteAdmin")'),
  },
  {
    name: "service adapters preserve scoped judge submission writes",
    test: () => appBundle.includes("publishQualifyingRunAndJudgeSubmission") && appBundle.includes("getJudgeSubmissionDocRef"),
  },
  {
    name: "read service centralizes raw Firestore snapshot reads",
    test: () => appBundle.includes("createFirestoreReadService")
      && !/\bgetDoc\(/.test(appSource)
      && !/\bonSnapshot\(/.test(appSource),
  },
  {
    name: "no service account private key material is present in frontend bundle",
    test: () => !appBundle.includes(`-----BEGIN ${["PRIVATE", "KEY"].join(" ")}-----`)
      && !appBundle.includes(privateKeyMarker)
      && !serviceAccountEmailPattern.test(appBundle),
  },
  {
    name: "demo query state remains labelled as isolated test data",
    test: () => appBundle.includes("Demo resets and judge submissions cannot write to production event data."),
  },
  {
    name: "public registration index helper excludes private registration fields",
    test: () => publicIndexFunctionSource.includes("displayName")
      && publicIndexFunctionSource.includes("driverNumber")
      && !/ownerUid|email|phone|qr|token|secret|location|latitude|longitude|private|notes/i.test(publicIndexFunctionSource),
  },
  {
    name: "aggregate calculator keeps public standings display fields",
    test: () => appBundle.includes("buildPublicAggregatesPayload")
      && appBundle.includes("qualifyingStandings")
      && appBundle.includes("bestScore")
      && appBundle.includes("averageScore"),
  },
  {
    name: "competition business logic is isolated in pure modules",
    test: () => appBundle.includes("rankDriversByQualifying")
      && appBundle.includes("calculateCompetitionDecisionResolution")
      && appBundle.includes("createEmptyEventResultsPayload")
      && appBundle.includes("normalizeLegacyEventPayload"),
  },
  {
    name: "public views are isolated without private registration fields",
    test: () => appBundle.includes("renderPublicHomeView(")
      && publicHomeViewSource.includes("export function renderPublicHomeView(model = {})")
      && publicHomeViewSource.includes("export const renderPublicHomeViewModel = renderPublicHomeView")
      && appSource.includes("renderPublicHomeView({")
      && !appSource.includes("renderPublicHomeViewModel")
      && appBundle.includes("renderPrivacyView")
      && appBundle.includes("renderResultsArchiveCard")
      && !/ownerUid|\bemail\b|\bphone\b|qrToken|checkInToken|checkInSecret|tokenSecret|latitude|longitude|privateNotes|paymentIntent|deviceToken/i.test(`${publicHomeViewSource}\n${publicEmptyStatesSource}\n${privacyViewSource}\n${resultsViewSource}`),
  },
  {
    name: "seo metadata helpers are isolated and preserve noindex safeguards",
    test: () => appBundle.includes("syncSeoMetadataForRoute")
      && seoSource.includes("buildSeoCanonicalUrl")
      && seoSource.includes("noindex, nofollow")
      && appBundle.includes("demoRole")
      && seoSource.includes("streamer-dashboard"),
  },
  {
    name: "route shell helpers are isolated without history mutation",
    test: () => appBundle.includes("buildEventRoutePathForRoute")
      && routeSource.includes("EVENT_ROUTE_VIEW_ALIASES")
      && routeSource.includes("getCleanPublicPathForView")
      && !/history\.|location\.|pushState|replaceState|window\./.test(routeSource),
  },
  {
    name: "privacy view rendering is isolated and static",
    test: () => html.includes('id="view-privacy" class="view-section"></div>')
      && privacyViewSource.includes("export function renderPrivacyView(options = {})")
      && privacyViewSource.includes("Privacy Notice")
      && privacyViewSource.includes("Back to Prodigy RC Comp")
      && !/Firestore|firebase|auth|claim|onSnapshot|getDoc|setDoc|window\.|document\./i.test(privacyViewSource),
  },
  {
    name: "public empty states are isolated and render-only",
    test: () => appBundle.includes("renderNoActiveEventState")
      && publicEmptyStatesSource.includes("No live event is active right now.")
      && publicEmptyStatesSource.includes("No drivers have joined this event yet.")
      && publicEmptyStatesSource.includes("Standings will populate after the first scores come in.")
      && !/Firestore|firebase|auth|claim|onSnapshot|getDoc|setDoc|window\.|document\.|history\.|location\./i.test(publicEmptyStatesSource),
  },
  {
    name: "Tech 1 anniversary mode stays isolated from normal competition paths",
    test: () => appBundle.includes("tech1drift-anniversary-may-30")
      && appBundle.includes('"specialEvents", eventId')
      && appBundle.includes("renderTech1DriftAnniversaryView")
      && tech1BracketSource.includes("buildRandomSingleEliminationBracket")
      && tech1AdapterSource.includes("buildTech1PublicRegistrationIndexDoc")
      && !/judgeSubmissions|qualifyingRuns|battleVotes|publicAggregates/.test(`${tech1ViewSource}\n${tech1AdapterSource}\n${tech1BracketSource}`)
      && !/ownerUid|\bemail\b|\bphone\b|qrToken|checkInToken|checkInSecret|tokenSecret|latitude|longitude|privateNotes|paymentIntent|deviceToken/i.test(tech1ViewSource),
  },
];

const failed = checks.filter((check) => !check.test());

if (failed.length) {
  console.error("Smoke check failed:");
  failed.forEach((check) => console.error(`- ${check.name}`));
  process.exit(1);
}

console.log(`Smoke check passed (${checks.length} checks).`);
