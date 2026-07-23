import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createSelectedEventSubscriptionController,
  resolveSelectionEventMeta,
  shouldReplaceCachedSelection,
} from "../assets/js/event-selection-sync.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
const backend = fs.readFileSync(path.join(repoRoot, "functions", "index.js"), "utf8");

const normalEvent = { id: "event-a", name: "Event A", status: "active", formatMode: "classic" };
const sdcRound3 = { id: "sdc-round-3-las-vegas", name: "SDC Round 3 | Las Vegas", status: "completed", formatMode: "sdc-top-16" };
const completedEvent = { id: "event-b", name: "Event B", status: "completed", formatMode: "classic" };
const directory = { "event-a": normalEvent, "event-b": completedEvent, "sdc-round-3-las-vegas": sdcRound3 };

// The authoritative directory metadata wins over a stale embedded selection payload.
assert.deepEqual(resolveSelectionEventMeta({
  eventId: "sdc-round-3-las-vegas",
  authoritativeDirectory: directory,
  authoritativeDirectoryLoaded: true,
  localDirectory: {},
  embeddedEventMeta: { id: "event-a", name: "Wrong stale event" },
}), sdcRound3);
assert.equal(resolveSelectionEventMeta({
  eventId: "missing-event",
  authoritativeDirectory: directory,
  authoritativeDirectoryLoaded: true,
  localDirectory: { "missing-event": { id: "missing-event" } },
  embeddedEventMeta: { id: "missing-event" },
}), null);

// Before the directory arrives, local metadata is allowed; mismatched embedded metadata is not.
assert.deepEqual(resolveSelectionEventMeta({ eventId: "event-a", localDirectory: directory }), normalEvent);
assert.equal(resolveSelectionEventMeta({ eventId: "event-b", embeddedEventMeta: normalEvent }), null);

// A real selection snapshot replaces a newer-stamped bootstrap fallback because stamps belong to different documents.
assert.equal(shouldReplaceCachedSelection(
  { activeEventId: "event-a", syncStamp: 500 },
  { activeEventId: "event-b", syncStamp: 100 },
  { authoritative: true },
), true);
assert.equal(shouldReplaceCachedSelection(
  { activeEventId: "event-a", syncStamp: 500 },
  { activeEventId: "event-b", syncStamp: 100 },
), false);

// Switching A -> B -> SDC Round 3 -> A tears down each old listener and ignores late callbacks.
const listeners = new Map();
const unsubscribeCount = new Map();
const applied = [];
const subscribeCount = new Map();
const controller = createSelectedEventSubscriptionController({
  subscribe(eventId, next, error) {
    subscribeCount.set(eventId, (subscribeCount.get(eventId) || 0) + 1);
    const listener = { next, error, active: true };
    if (!listeners.has(eventId)) listeners.set(eventId, []);
    listeners.get(eventId).push(listener);
    return () => {
      listener.active = false;
      unsubscribeCount.set(eventId, (unsubscribeCount.get(eventId) || 0) + 1);
    };
  },
  onSnapshot: (eventId, snapshot) => applied.push([eventId, snapshot.version]),
});

controller.select("event-a");
listeners.get("event-a").at(-1).next({ version: "a1" });
controller.select("event-b");
listeners.get("event-a")[0].next({ version: "stale-a" });
listeners.get("event-b").at(-1).next({ version: "b1" });
controller.select("sdc-round-3-las-vegas");
listeners.get("event-b")[0].next({ version: "stale-b" });
listeners.get("sdc-round-3-las-vegas").at(-1).next({ version: "sdc1" });
controller.select("event-a");
listeners.get("event-a").at(-1).next({ version: "a2" });

assert.deepEqual(applied, [
  ["event-a", "a1"],
  ["event-b", "b1"],
  ["sdc-round-3-las-vegas", "sdc1"],
  ["event-a", "a2"],
]);
assert.equal(unsubscribeCount.get("event-a"), 1);
assert.equal(unsubscribeCount.get("event-b"), 1);
assert.equal(unsubscribeCount.get("sdc-round-3-las-vegas"), 1);

// Re-selecting without force does not duplicate; reconnect/force replaces exactly one listener.
assert.equal(controller.select("event-a"), false);
assert.equal(subscribeCount.get("event-a"), 2);
assert.equal(controller.select("event-a", { force: true }), true);
assert.equal(subscribeCount.get("event-a"), 3);
assert.equal(unsubscribeCount.get("event-a"), 2);

// Long-running presentation/admin sessions may switch events repeatedly. Each
// replacement must detach its predecessor and discard its late callback.
const stressStart = applied.length;
const rotation = ["event-b", "sdc-round-3-las-vegas", "event-a"];
let previousEventId = "event-a";
for (let index = 0; index < 60; index += 1) {
  const nextEventId = rotation[index % rotation.length];
  assert.equal(controller.select(nextEventId), true);
  listeners.get(previousEventId).at(-1).next({ version: `late-${index}` });
  listeners.get(nextEventId).at(-1).next({ version: `fresh-${index}` });
  previousEventId = nextEventId;
}
const stressSnapshots = applied.slice(stressStart);
assert.equal(stressSnapshots.length, 60);
assert.ok(stressSnapshots.every(([, version]) => version.startsWith("fresh-")));

// Source-level wiring preserves explicit routes and gives live selection snapshots authoritative cache status.
assert.match(html, /getRequestedRouteEventSelection\(searchParams\)\.valid/);
assert.match(html, /saveCachedActiveEventSelection\(normalizedSelection, \{ authoritative: true \}\)/);
assert.doesNotMatch(
  html.slice(html.indexOf("function applyDirectorySnapshotData"), html.indexOf("function applyActiveEventSelectionData")),
  /saveCachedActiveEventSelection/,
);
assert.match(html, /callProdigyAction\("restoreMissingEvent"/);
assert.match(backend, /if \(action === "restoreMissingEvent"\) return restoreMissingEvent\(request\)/);
assert.match(backend, /transaction\.set\(selectionRef\(appId\), activeSelectionPayload\(eventId, eventData, syncStamp\)\)/);

console.log("event-selection synchronization tests passed");
