import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createSelectedEventSubscriptionController } from "../assets/js/event-selection-sync.js";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const requireFromRepo = createRequire(`${repoRoot}package.json`);
const requireFromFunctions = createRequire(`${repoRoot}functions/package.json`);
const { initializeApp, deleteApp } = requireFromRepo("firebase/app");
const { getAuth, connectAuthEmulator, signInAnonymously } = requireFromRepo("firebase/auth");
const {
  connectFirestoreEmulator,
  disableNetwork,
  doc,
  enableNetwork,
  getFirestore,
  onSnapshot,
} = requireFromRepo("firebase/firestore");
const { getFunctions, connectFunctionsEmulator, httpsCallable } = requireFromRepo("firebase/functions");
const { initializeApp: initializeAdminApp, deleteApp: deleteAdminApp } = requireFromFunctions("firebase-admin/app");
const { getFirestore: getAdminFirestore } = requireFromFunctions("firebase-admin/firestore");

const projectId = "prodigy-rc-competitions";
const appId = "1:292850527697:web:6b9cb5249f2716e42e44f0";
const firebaseConfig = { projectId, appId, apiKey: "demo-api-key", authDomain: `${projectId}.firebaseapp.com` };
const dataRoot = `artifacts/${appId}/public/data`;
const directoryPath = `${dataRoot}/meta/eventDirectory`;
const selectionPath = `${dataRoot}/meta/activeEventSelection`;
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = projectId;

function readLocalSecret(name) {
  const lines = fs.readFileSync(`${repoRoot}functions/.secret.local`, "utf8").split(/\r?\n/);
  const line = lines.find((entry) => entry.startsWith(`${name}=`));
  if (!line) throw new Error(`Missing ${name} in functions/.secret.local`);
  return line.slice(name.length + 1);
}

function driver(id, seed, name = "") {
  return {
    id,
    seed,
    name: name || id.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    registrationNumber: seed,
    signUpPosition: seed,
  };
}

function event(eventId, prefix, names = []) {
  const drivers = [1, 2, 3, 4].map((seed) => driver(`${prefix}-${seed}`, seed, names[seed - 1]));
  return {
    id: eventId,
    name: `Judge Sync ${prefix}`,
    status: "active",
    judgeCount: 3,
    judgingMode: "average",
    competitionMode: "solo",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    syncStamp: 1,
    roleNames: { admin: "Event Admin", j1: "Judge 1", j2: "Judge 2", j3: "Judge 3" },
    roleAccess: {
      admin: { passwordConfigured: false, accessVersion: null },
      j1: { passwordConfigured: false, accessVersion: null },
      j2: { passwordConfigured: false, accessVersion: null },
      j3: { passwordConfigured: false, accessVersion: null },
    },
    judgeRoleClaims: { j1: null, j2: null, j3: null },
    venueConfig: { enabled: true, closeAt: null },
    pendingRegistrations: [],
    drivers,
    bracket: {
      plan: { resolvedFormat: "classic", mainBracketSize: 4 },
      lowerBracket: null,
      mainBracket: {
        title: "Judge Sync Bracket",
        rounds: [
          {
            name: "Semifinal",
            matches: [
              { left: drivers[0], right: drivers[1], winner: null, winnerMode: null },
              { left: drivers[2], right: drivers[3], winner: null, winnerMode: null },
            ],
          },
          { name: "Final", matches: [{ left: null, right: null, winner: null, winnerMode: null }] },
        ],
        thirdPlaceMatch: null,
      },
      competitionJudgeControl: null,
      competitionAttemptHistory: [],
    },
    twinComp: null,
    qualifyingFlow: { currentDriverId: null, readyRoles: {}, started: true, completed: true },
    formatMode: "classic",
    lowerCount: "0",
    results: { completedAt: null },
  };
}

function eventMeta(eventData) {
  const meta = structuredClone(eventData);
  for (const field of ["drivers", "bracket", "twinComp", "qualifyingFlow", "formatMode", "lowerCount"]) delete meta[field];
  return meta;
}

function currentBattle(eventData) {
  const control = eventData?.bracket?.competitionJudgeControl || {};
  if (control?.entry?.match?.left && control?.entry?.match?.right && control.status && control.status !== "idle") {
    const matchId = `main:${Number(control.entry.roundIndex)}:${Number(control.entry.matchIndex)}`;
    return {
      eventId: eventData.id,
      matchId,
      attemptId: control.attemptId || `${matchId}:attempt:${Math.max(1, Number(control.cycle || 1))}`,
      round: Number(control.entry.roundIndex),
      driverA: control.entry.match.left.name,
      driverB: control.entry.match.right.name,
      status: control.status,
      syncStamp: Number(eventData.syncStamp || 0),
    };
  }
  const rounds = eventData?.bracket?.mainBracket?.rounds || [];
  for (let roundIndex = 0; roundIndex < rounds.length; roundIndex += 1) {
    for (let matchIndex = 0; matchIndex < (rounds[roundIndex]?.matches || []).length; matchIndex += 1) {
      const match = rounds[roundIndex].matches[matchIndex];
      if (match?.left && match?.right && !match?.winner) {
        const matchId = `main:${roundIndex}:${matchIndex}`;
        const cycle = Number(control.cycle || 1);
        const attemptId = control?.entry?.bracketKey === "main"
          && Number(control.entry.roundIndex) === roundIndex
          && Number(control.entry.matchIndex) === matchIndex
          && control.attemptId
          ? control.attemptId
          : `${matchId}:attempt:${Math.max(1, cycle)}`;
        return {
          eventId: eventData.id,
          matchId,
          attemptId,
          round: roundIndex,
          driverA: match.left.name,
          driverB: match.right.name,
          status: control.status || "idle",
          syncStamp: Number(eventData.syncStamp || 0),
        };
      }
    }
  }
  return { eventId: eventData?.id || "", matchId: null, attemptId: null, round: null, driverA: null, driverB: null, status: "complete", syncStamp: Number(eventData?.syncStamp || 0) };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, label, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(25);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function createSurface(name) {
  const app = initializeApp(firebaseConfig, `${name}-${crypto.randomUUID()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
  const functions = getFunctions(app, "us-central1");
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  await signInAnonymously(auth);

  const state = { selectedEventId: "", latest: null, observed: [], callbacks: new Map(), selectionUnsubscribe: null };
  const controller = createSelectedEventSubscriptionController({
    subscribe(eventId, next, error) {
      state.callbacks.set(eventId, next);
      return onSnapshot(doc(firestore, `${dataRoot}/events/${eventId}`), { includeMetadataChanges: true }, next, error);
    },
    onSnapshot(eventId, snapshot) {
      if (!snapshot.exists()) return;
      const battle = currentBattle(snapshot.data());
      state.latest = battle;
      state.observed.push(battle);
      state.selectedEventId = eventId;
    },
  });
  state.selectionUnsubscribe = onSnapshot(doc(firestore, selectionPath), (snapshot) => {
    const eventId = String(snapshot.data()?.activeEventId || "").trim();
    if (eventId) controller.select(eventId);
  });

  return {
    app,
    auth,
    firestore,
    state,
    controller,
    call: async (action, payload = {}) => (await httpsCallable(functions, "prodigyAction", { timeout: 30_000 })({ action, appId, ...payload })).data,
    refresh: () => controller.select(state.selectedEventId, { force: true }),
    dispose: async () => {
      state.selectionUnsubscribe?.();
      controller.stop();
      await deleteApp(app);
    },
  };
}

async function authorizeAndClaim(surface, eventId, role, deviceId, password) {
  await surface.call("authorizeAccess", { kind: "eventRole", eventId, role, password });
  await surface.auth.currentUser.getIdTokenResult(true);
  await surface.call("claimJudgeRole", { eventId, role, deviceId });
}

async function expectCallableError(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, `functions/${code}`);
    return true;
  });
}

const eventAId = `judge-sync-a-${crypto.randomUUID()}`;
const eventBId = `judge-sync-b-${crypto.randomUUID()}`;
const eventAPath = `${dataRoot}/events/${eventAId}`;
const eventBPath = `${dataRoot}/events/${eventBId}`;
const adminApp = initializeAdminApp({ projectId }, `judge-sync-admin-${crypto.randomUUID()}`);
const adminDb = getAdminFirestore(adminApp);
const surfaces = {};

try {
  const eventA = event(eventAId, "a", ["Takumi Sato", "Blake Griffin", "Aiden Brooks", "Owen Pierce"]);
  const eventB = event(eventBId, "b", ["Chris Vega", "Devon Park", "Mason Hill", "Jaxon Reed"]);
  await adminDb.doc(eventAPath).set(eventA);
  await adminDb.doc(eventBPath).set(eventB);
  await adminDb.doc(directoryPath).set({ events: { [eventAId]: eventMeta(eventA), [eventBId]: eventMeta(eventB) }, syncStamp: 1 }, { merge: true });
  await adminDb.doc(selectionPath).set({ activeEventId: eventBId, eventMeta: eventMeta(eventB), syncStamp: 1 });

  for (const name of ["admin", "j1", "j2", "j3", "spectator"]) surfaces[name] = await createSurface(`judge-sync-${name}`);
  const password = readLocalSecret("WEBSITE_ADMIN_PASSWORD");
  for (const role of ["j1", "j2", "j3"]) {
    await authorizeAndClaim(surfaces[role], eventAId, role, `${eventAId}-${role}`, password);
  }
  await surfaces.admin.call("authorizeAccess", { kind: "eventRole", eventId: eventAId, role: "admin", password });
  await surfaces.admin.auth.currentUser.getIdTokenResult(true);

  const allSurfaces = Object.values(surfaces);
  const assertConverged = async (eventId, matchId, attemptId) => {
    await waitFor(
      () => allSurfaces.every((surface) => surface.state.latest?.eventId === eventId
        && surface.state.latest?.matchId === matchId
        && surface.state.latest?.attemptId === attemptId),
      `${eventId} ${matchId} ${attemptId}`,
    );
    const snapshots = allSurfaces.map((surface) => surface.state.latest);
    assert.deepEqual(snapshots.map(({ eventId: id, matchId: match, attemptId: attempt, driverA, driverB }) => ({ id, match, attempt, driverA, driverB })), Array(5).fill({
      id: eventId,
      match: matchId,
      attempt: attemptId,
      driverA: snapshots[0].driverA,
      driverB: snapshots[0].driverB,
    }));
  };

  // Reproduces the reported divergence setup: the shared pointer is Event B
  // (Chris/Devon) while Event Admin chooses Event A (Takumi/Blake). Before
  // this fix, the UI retained Event A locally after setActiveSelection was
  // owner-only and rejected the Event Admin request.
  await assertConverged(eventBId, "main:0:0", "main:0:0:attempt:1");
  assert.deepEqual(currentBattle(eventA), {
    eventId: eventAId,
    matchId: "main:0:0",
    attemptId: "main:0:0:attempt:1",
    round: 0,
    driverA: "Takumi Sato",
    driverB: "Blake Griffin",
    status: "idle",
    syncStamp: 1,
  });
  const eventAdminSelection = await surfaces.admin.call("setActiveSelection", { eventId: eventAId });
  assert.equal(eventAdminSelection.activeEventId, eventAId);
  await assertConverged(eventAId, "main:0:0", "main:0:0:attempt:1");
  const initialAttemptId = "main:0:0:attempt:1";
  for (const [role, side] of [["j1", "left"], ["j2", "left"], ["j3", "right"]]) {
    await surfaces[role].call("submitJudgeVote", {
      eventId: eventAId,
      role,
      deviceId: `${eventAId}-${role}`,
      side,
      expectedEntryKey: "main:0:0",
      expectedAttemptId: initialAttemptId,
    });
  }
  await waitFor(() => allSurfaces.every((surface) => surface.state.latest?.status === "admin_decision"), "all clients receive the resolved first battle");
  const firstControl = (await adminDb.doc(eventAPath).get()).data().bracket.competitionJudgeControl;
  await surfaces.admin.call("adminCompetitionDecision", {
    eventId: eventAId,
    decision: "continue",
    expectedEntryKey: "main:0:0",
    expectedAttemptId: firstControl.attemptId,
  });
  await assertConverged(eventAId, "main:0:1", "main:0:1:attempt:1");

  // Keep Judge 3 offline while Event Admin immediately resolves and advances
  // the next battle. The listener must catch up on reconnect without a reload.
  const secondAttemptId = "main:0:1:attempt:1";
  for (const [role, side] of [["j1", "right"], ["j2", "right"], ["j3", "left"]]) {
    await surfaces[role].call("submitJudgeVote", {
      eventId: eventAId,
      role,
      deviceId: `${eventAId}-${role}`,
      side,
      expectedEntryKey: "main:0:1",
      expectedAttemptId: secondAttemptId,
    });
  }
  await disableNetwork(surfaces.j3.firestore);
  const secondControl = (await adminDb.doc(eventAPath).get()).data().bracket.competitionJudgeControl;
  await surfaces.admin.call("adminCompetitionDecision", {
    eventId: eventAId,
    decision: "continue",
    expectedEntryKey: "main:0:1",
    expectedAttemptId: secondControl.attemptId,
  });
  await waitFor(() => [surfaces.admin, surfaces.j1, surfaces.j2, surfaces.spectator].every((surface) => surface.state.latest?.matchId === "main:1:0"), "connected clients advance through the fast second transition");
  assert.equal(surfaces.j3.state.latest?.matchId, "main:0:1");
  await enableNetwork(surfaces.j3.firestore);
  await assertConverged(eventAId, "main:1:0", "main:1:0:attempt:1");

  // A reconnect/refresh replaces each listener and immediately receives the
  // same current battle rather than restoring a cached previous match.
  for (const role of ["j1", "j2", "j3"]) {
    assert.equal(surfaces[role].refresh(), true);
  }
  await assertConverged(eventAId, "main:1:0", "main:1:0:attempt:1");

  // Switch the shared active-event pointer twice, then invoke a captured old
  // event callback. The subscription generation guard must discard it.
  await adminDb.doc(selectionPath).set({ activeEventId: eventBId, eventMeta: eventMeta(eventB), syncStamp: 2 });
  await assertConverged(eventBId, "main:0:0", "main:0:0:attempt:1");
  const staleEventACallbacks = allSurfaces.map((surface) => surface.state.callbacks.get(eventAId));
  await adminDb.doc(selectionPath).set({ activeEventId: eventAId, eventMeta: eventMeta(eventA), syncStamp: 3 });
  await assertConverged(eventAId, "main:1:0", "main:1:0:attempt:1");
  const staleSnapshot = { exists: () => true, data: () => eventA };
  staleEventACallbacks.forEach((callback) => callback?.(staleSnapshot));
  await sleep(50);
  await assertConverged(eventAId, "main:1:0", "main:1:0:attempt:1");

  // The old first-attempt submission is rejected after the bracket moves on.
  await expectCallableError(surfaces.j1.call("submitJudgeVote", {
    eventId: eventAId,
    role: "j1",
    deviceId: `${eventAId}-j1`,
    side: "left",
    expectedEntryKey: "main:0:0",
    expectedAttemptId: initialAttemptId,
  }), "aborted");

  console.log("judge multi-client synchronization emulator tests passed");
} finally {
  await Promise.all(Object.values(surfaces).map((surface) => surface.dispose().catch(() => {})));
  await Promise.all([
    adminDb.doc(eventAPath).delete().catch(() => {}),
    adminDb.doc(eventBPath).delete().catch(() => {}),
    adminDb.doc(selectionPath).delete().catch(() => {}),
  ]);
  await deleteAdminApp(adminApp);
}
