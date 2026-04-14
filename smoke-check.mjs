import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const filePath = path.join(path.dirname(currentFilePath), "index.html");
const html = fs.readFileSync(filePath, "utf8");

const checks = [
  {
    name: "website admin gate exists",
    test: () => html.includes('id="websiteAdminGate"') && html.includes('id="websiteAdminUnlockBtn"'),
  },
  {
    name: "device cache reset tool exists",
    test: () => html.includes("function clearLocalDeviceCaches()") && html.includes('id="websiteAdminClearCacheBtn"'),
  },
  {
    name: "directory sync publishes deleted event tombstones",
    test: () => html.includes("deletedEventIds: getDeletedEventIdsSnapshot()"),
  },
  {
    name: "deleted events are filtered from merged directory snapshots",
    test: () => html.includes("if (isDeletedEventId(eventId)) return;"),
  },
  {
    name: "delete event removes archived results entry",
    test: () => html.includes("delete archivedResultsDirectory[eventId];"),
  },
  {
    name: "renderQueueView no longer carries the dead legacy branch",
    test: () => !html.includes("function renderQueueView() {\r\n      return renderQueueViewV2();\r\n      if (!publicEventSpotlight")
      && !html.includes("function renderQueueView() {\n      return renderQueueViewV2();\n      if (!publicEventSpotlight"),
  },
];

const failed = checks.filter((check) => !check.test());

if (failed.length) {
  console.error("Smoke check failed:");
  failed.forEach((check) => console.error(`- ${check.name}`));
  process.exit(1);
}

console.log(`Smoke check passed (${checks.length} checks).`);
