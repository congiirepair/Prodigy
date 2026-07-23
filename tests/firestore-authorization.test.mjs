import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const requireFromRepo = createRequire(`${repoRoot}package.json`);
const { initializeTestEnvironment, assertFails, assertSucceeds } = requireFromRepo("@firebase/rules-unit-testing");

const testEnv = await initializeTestEnvironment({
  projectId: "prodigy-rc-competitions",
  firestore: {
    host: "127.0.0.1",
    port: 8080,
    rules: fs.readFileSync(`${repoRoot}firestore.rules`, "utf8"),
  },
});

const appId = "1:292850527697:web:6b9cb5249f2716e42e44f0";
const base = `artifacts/${appId}/public/data`;
const eventA = `${base}/events/event-a`;
const directory = `${base}/meta/eventDirectory`;
const streamA = `${base}/liveStreams/event-a`;
const streamB = `${base}/liveStreams/event-b`;

try {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(eventA).set({ id: "event-a", drivers: [], syncStamp: 1, roleAccess: { admin: { accessVersion: "admin-v1" } } });
    await context.firestore().doc(directory).set({ events: { "event-a": { id: "event-a" } } });
  });

  const anonymous = testEnv.unauthenticatedContext().firestore();
  const spectator = testEnv.authenticatedContext("spectator").firestore();
  const otherSpectator = testEnv.authenticatedContext("other-spectator").firestore();
  const owner = testEnv.authenticatedContext("owner", { owner: true, ownerExpiresAt: Date.now() + 60_000 }).firestore();
  const expiredOwner = testEnv.authenticatedContext("expired-owner", { owner: true, ownerExpiresAt: Date.now() - 60_000 }).firestore();
  const legacyOwner = testEnv.authenticatedContext("legacy-owner", { role: "owner", roles: ["owner"] }).firestore();
  const streamer = testEnv.authenticatedContext("streamer", {
    eventRoles: { "event-a": ["admin"] },
    eventRoleVersions: { "event-a": { admin: "admin-v1" } },
  }).firestore();
  const staleStreamer = testEnv.authenticatedContext("stale-streamer", {
    eventRoles: { "event-a": ["admin"] },
    eventRoleVersions: { "event-a": { admin: "old-version" } },
  }).firestore();

  await assertFails(anonymous.doc(eventA).get());
  await assertSucceeds(spectator.doc(eventA).get());
  await assertFails(spectator.doc(eventA).set({ drivers: [{ id: "forged" }] }, { merge: true }));
  await assertFails(owner.doc(eventA).set({ drivers: [{ id: "direct-owner-write" }] }, { merge: true }));
  await assertFails(owner.doc(directory).set({ events: {} }));
  await assertFails(expiredOwner.doc(streamA).set({ status: "expired-owner" }));
  await assertFails(legacyOwner.doc(streamA).set({ status: "legacy-owner" }));

  await assertSucceeds(streamer.doc(streamA).set({ status: "live" }));
  await assertFails(staleStreamer.doc(streamA).set({ status: "stale" }));
  await assertFails(streamer.doc(streamB).set({ status: "live" }));
  await assertFails(spectator.doc(streamA).set({ status: "hijacked" }));
  await assertSucceeds(spectator.doc(`${streamA}/sessions/session-1/viewers/spectator`).set({ joinedAt: 1 }));
  await assertFails(spectator.doc(`${streamA}/sessions/session-1/viewers/another-user`).set({ joinedAt: 1 }));
  await assertSucceeds(spectator.doc(`${streamA}/sessions/session-1/viewers/spectator`).get());
  await assertSucceeds(streamer.doc(`${streamA}/sessions/session-1/viewers/spectator`).get());
  await assertFails(otherSpectator.doc(`${streamA}/sessions/session-1/viewers/spectator`).get());

  await assertFails(spectator.doc(`artifacts/${appId}/private/eventAccess/events/event-a`).get());
  await assertFails(spectator.doc("artifacts/test-app/public/testData/events/qa-event").set({ ok: true }));
  await assertFails(spectator.doc("artifacts/test-app/public/testData/events/qa-event").get());

  console.log("firestore authorization rules tests passed");
} finally {
  await testEnv.cleanup();
}
