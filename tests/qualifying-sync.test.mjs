// Emulator-backed regression coverage for the qualifying run-submission
// server behavior implicated in the judge-UI desync bug: authoritative
// duplicate rejection, Run 1 -> Run 2 -> next-driver advancement, and
// Event Admin / Judge convergence, for both a single active judge and
// three active judges racing their submissions.
//
// Run: firebase emulators:exec --only auth,firestore,functions
//        --project prodigy-rc-competitions "node tests/qualifying-sync.test.mjs"

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const requireFromRepo = createRequire(`${repoRoot}package.json`);
const requireFromFunctions = createRequire(`${repoRoot}functions/package.json`);
const { initializeApp, deleteApp } = requireFromRepo("firebase/app");
const { getAuth, connectAuthEmulator, signInAnonymously } = requireFromRepo("firebase/auth");
const { connectFirestoreEmulator, doc, getFirestore, onSnapshot } = requireFromRepo("firebase/firestore");
const { getFunctions, connectFunctionsEmulator, httpsCallable } = requireFromRepo("firebase/functions");
const { initializeApp: initializeAdminApp, deleteApp: deleteAdminApp } = requireFromFunctions("firebase-admin/app");
const { getFirestore: getAdminFirestore } = requireFromFunctions("firebase-admin/firestore");

const projectId = "prodigy-rc-competitions";
const appId = "1:292850527697:web:6b9cb5249f2716e42e44f0";
const firebaseConfig = { projectId, appId, apiKey: "demo-api-key", authDomain: `${projectId}.firebaseapp.com` };
const dataRoot = `artifacts/${appId}/public/data`;
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = projectId;

function readLocalSecret(name) {
  const lines = fs.readFileSync(`${repoRoot}functions/.secret.local`, "utf8").split(/\r?\n/);
  const line = lines.find((entry) => entry.startsWith(`${name}=`));
  if (!line) throw new Error(`Missing ${name} in functions/.secret.local`);
  return line.slice(name.length + 1);
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

function driver(id, seed, name) {
  return {
    id,
    seed,
    name,
    registrationNumber: seed,
    signUpPosition: seed,
    scores: {
      j1: { run1: null, run2: null, runoff: null, submitted: { run1: null, run2: null, runoff: null }, deductionHistory: { run1: [], run2: [], runoff: [] } },
      j2: { run1: null, run2: null, runoff: null, submitted: { run1: null, run2: null, runoff: null }, deductionHistory: { run1: [], run2: [], runoff: [] } },
      j3: { run1: null, run2: null, runoff: null, submitted: { run1: null, run2: null, runoff: null }, deductionHistory: { run1: [], run2: [], runoff: [] } },
    },
    runFlags: { run1: null, run2: null, runoff: null },
  };
}

function buildEvent(eventId, judgeCount, drivers) {
  return {
    id: eventId,
    name: `Qualifying Sync ${eventId}`,
    status: "active",
    judgeCount,
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
    bracket: null,
    twinComp: null,
    qualifyingFlow: { currentDriverId: drivers[0].id, readyRoles: {}, started: true, completed: false },
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

async function createSurface(name) {
  const app = initializeApp(firebaseConfig, `${name}-${crypto.randomUUID()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
  const functions = getFunctions(app, "us-central1");
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  await signInAnonymously(auth);

  const state = { latest: null };
  return {
    app,
    auth,
    firestore,
    state,
    call: async (action, payload = {}) => (await httpsCallable(functions, "prodigyAction", { timeout: 30_000 })({ action, appId, ...payload })).data,
    watch: (eventId) => onSnapshot(doc(firestore, `${dataRoot}/events/${eventId}`), (snap) => { state.latest = snap.exists() ? snap.data() : null; }),
    dispose: async () => { await deleteApp(app); },
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

const singleJudgeEventId = `qualifying-sync-single-${crypto.randomUUID()}`;
const multiJudgeEventId = `qualifying-sync-multi-${crypto.randomUUID()}`;
const adminApp = initializeAdminApp({ projectId }, `qualifying-sync-admin-${crypto.randomUUID()}`);
const adminDb = getAdminFirestore(adminApp);
const surfaces = {};

try {
  const password = readLocalSecret("WEBSITE_ADMIN_PASSWORD");

  // ==== Single-judge: Run1 -> duplicate rejection -> Run2 -> advance ====
  const singleDrivers = [
    driver("single-1", 1, "Driver One"),
    driver("single-2", 2, "Driver Two"),
  ];
  const singleEvent = buildEvent(singleJudgeEventId, 1, singleDrivers);
  await adminDb.doc(`${dataRoot}/events/${singleJudgeEventId}`).set(singleEvent);
  await adminDb.doc(`${dataRoot}/meta/eventDirectory`).set({ events: { [singleJudgeEventId]: eventMeta(singleEvent) }, syncStamp: 1 }, { merge: true });

  surfaces.j1Single = await createSurface("qualifying-sync-j1-single");
  surfaces.adminSingle = await createSurface("qualifying-sync-admin-single");
  await authorizeAndClaim(surfaces.j1Single, singleJudgeEventId, "j1", `${singleJudgeEventId}-j1`, password);
  await surfaces.adminSingle.call("authorizeAccess", { kind: "eventRole", eventId: singleJudgeEventId, role: "admin", password });
  await surfaces.adminSingle.auth.currentUser.getIdTokenResult(true);
  surfaces.j1Single.watch(singleJudgeEventId);
  surfaces.adminSingle.watch(singleJudgeEventId);
  await waitFor(() => surfaces.j1Single.state.latest && surfaces.adminSingle.state.latest, "single-judge surfaces receive initial snapshot");

  // Run 1: submit 84.
  const run1Result = await surfaces.j1Single.call("submitJudgeQualifying", {
    eventId: singleJudgeEventId, role: "j1", deviceId: `${singleJudgeEventId}-j1`, driverId: "single-1", runKey: "run1",
    scores: { run1: 84, run2: null, runoff: null, submitted: { run1: 84, run2: null, runoff: null } },
  });
  const savedDriver1 = run1Result.eventPayload.drivers.find((entry) => entry.id === "single-1");
  assert.equal(savedDriver1.scores.j1.submitted.run1, 84, "Run 1 submission of 84 must be saved as authoritative");

  // Duplicate Run 1 submit (the exact reproduced bug trigger): must be rejected,
  // and the stored score must remain untouched at 84 -- never overwritten by 50.
  await expectCallableError(surfaces.j1Single.call("submitJudgeQualifying", {
    eventId: singleJudgeEventId, role: "j1", deviceId: `${singleJudgeEventId}-j1`, driverId: "single-1", runKey: "run1",
    scores: { run1: 50, run2: null, runoff: null, submitted: { run1: 50, run2: null, runoff: null } },
  }), "aborted");
  const afterDuplicateSnap = await adminDb.doc(`${dataRoot}/events/${singleJudgeEventId}`).get();
  const afterDuplicateDriver = afterDuplicateSnap.data().drivers.find((entry) => entry.id === "single-1");
  assert.equal(afterDuplicateDriver.scores.j1.submitted.run1, 84, "authoritative Firestore state must never be overwritten by the rejected duplicate (50)");
  assert.equal(afterDuplicateSnap.data().qualifyingFlow.currentDriverId, "single-1", "the current driver must not advance on a rejected duplicate Run 1");

  // Run 1 must not leak into Run 2: Run 2 is still null for this driver.
  assert.equal(afterDuplicateDriver.scores.j1.submitted.run2, null, "Run 2 must remain unset until explicitly submitted");

  // Run 2: submit 90. With exactly one active judge, this must immediately
  // satisfy "all active judges submitted Run 2" and advance the queue.
  const run2Result = await surfaces.j1Single.call("submitJudgeQualifying", {
    eventId: singleJudgeEventId, role: "j1", deviceId: `${singleJudgeEventId}-j1`, driverId: "single-1", runKey: "run2",
    scores: { run1: 84, run2: 90, runoff: null, submitted: { run1: 84, run2: 90, runoff: null } },
  });
  assert.equal(run2Result.eventPayload.qualifyingFlow.currentDriverId, "single-2", "one-judge progression must advance to the next driver immediately after Run 2");
  const driver1AfterRun2 = run2Result.eventPayload.drivers.find((entry) => entry.id === "single-1");
  assert.equal(driver1AfterRun2.scores.j1.submitted.run1, 84, "Run 1 must remain exactly as originally finalized after Run 2 completes");
  assert.equal(driver1AfterRun2.scores.j1.submitted.run2, 90, "Run 2 must be saved as authoritative");

  // Next-driver isolation: driver-2 must start with no scores at all -- nothing
  // carried over from driver-1's finalized runs.
  const driver2Fresh = run2Result.eventPayload.drivers.find((entry) => entry.id === "single-2");
  assert.equal(driver2Fresh.scores.j1.submitted.run1, null, "the next driver must not inherit the previous driver's Run 1 score");
  assert.equal(driver2Fresh.scores.j1.submitted.run2, null, "the next driver must not inherit the previous driver's Run 2 score");

  // Event Admin convergence: no manual refresh required.
  await waitFor(() => surfaces.adminSingle.state.latest?.qualifyingFlow?.currentDriverId === "single-2", "Event Admin listener converges on the advanced driver without a manual refresh");
  const adminDriver1 = surfaces.adminSingle.state.latest.drivers.find((entry) => entry.id === "single-1");
  assert.equal(adminDriver1.scores.j1.submitted.run1, 84, "Event Admin must agree with the judge on Run 1");
  assert.equal(adminDriver1.scores.j1.submitted.run2, 90, "Event Admin must agree with the judge on Run 2");

  console.log("ok - single-judge Run1 -> duplicate rejection -> Run2 -> next-driver progression converges correctly");

  // ==== Three-judge: advancement only after all three submit Run 2 ====
  const multiDrivers = [driver("multi-1", 1, "Multi Driver One"), driver("multi-2", 2, "Multi Driver Two")];
  const multiEvent = buildEvent(multiJudgeEventId, 3, multiDrivers);
  await adminDb.doc(`${dataRoot}/events/${multiJudgeEventId}`).set(multiEvent);
  await adminDb.doc(`${dataRoot}/meta/eventDirectory`).set({ events: { [multiJudgeEventId]: eventMeta(multiEvent) }, syncStamp: 1 }, { merge: true });

  for (const role of ["j1", "j2", "j3"]) {
    surfaces[`${role}Multi`] = await createSurface(`qualifying-sync-${role}-multi`);
    await authorizeAndClaim(surfaces[`${role}Multi`], multiJudgeEventId, role, `${multiJudgeEventId}-${role}`, password);
  }

  // All three submit Run 1 concurrently (rapid multi-judge race).
  await Promise.all(["j1", "j2", "j3"].map((role) => surfaces[`${role}Multi`].call("submitJudgeQualifying", {
    eventId: multiJudgeEventId, role, deviceId: `${multiJudgeEventId}-${role}`, driverId: "multi-1", runKey: "run1",
    scores: { run1: 80 + ["j1", "j2", "j3"].indexOf(role), run2: null, runoff: null, submitted: { run1: 80 + ["j1", "j2", "j3"].indexOf(role), run2: null, runoff: null } },
  })));

  // Only j1 and j2 submit Run 2: the driver must NOT advance yet.
  await surfaces.j1Multi.call("submitJudgeQualifying", {
    eventId: multiJudgeEventId, role: "j1", deviceId: `${multiJudgeEventId}-j1`, driverId: "multi-1", runKey: "run2",
    scores: { run1: 80, run2: 88, runoff: null, submitted: { run1: 80, run2: 88, runoff: null } },
  });
  const afterJ1Run2 = await surfaces.j2Multi.call("submitJudgeQualifying", {
    eventId: multiJudgeEventId, role: "j2", deviceId: `${multiJudgeEventId}-j2`, driverId: "multi-1", runKey: "run2",
    scores: { run1: 81, run2: 89, runoff: null, submitted: { run1: 81, run2: 89, runoff: null } },
  });
  assert.equal(afterJ1Run2.eventPayload.qualifyingFlow.currentDriverId, "multi-1", "advancement must not occur until ALL active judges submit Run 2 (j3 has not yet submitted)");

  // j3 submits last: NOW the driver must advance.
  const afterJ3Run2 = await surfaces.j3Multi.call("submitJudgeQualifying", {
    eventId: multiJudgeEventId, role: "j3", deviceId: `${multiJudgeEventId}-j3`, driverId: "multi-1", runKey: "run2",
    scores: { run1: 82, run2: 90, runoff: null, submitted: { run1: 82, run2: 90, runoff: null } },
  });
  assert.equal(afterJ3Run2.eventPayload.qualifyingFlow.currentDriverId, "multi-2", "advancement must occur immediately once the last active judge submits Run 2");

  // Each judge's finalized submission is independent: j1's Run 2 must not have
  // been touched by j2 or j3 submitting afterward.
  const finalMultiDriver1 = afterJ3Run2.eventPayload.drivers.find((entry) => entry.id === "multi-1");
  assert.equal(finalMultiDriver1.scores.j1.submitted.run2, 88, "j1 must keep its own independently-finalized Run 2 score");
  assert.equal(finalMultiDriver1.scores.j2.submitted.run2, 89, "j2 must keep its own independently-finalized Run 2 score");
  assert.equal(finalMultiDriver1.scores.j3.submitted.run2, 90, "j3 must keep its own independently-finalized Run 2 score");

  // A duplicate from j1 after the fact (racing all three) must still be rejected.
  await expectCallableError(surfaces.j1Multi.call("submitJudgeQualifying", {
    eventId: multiJudgeEventId, role: "j1", deviceId: `${multiJudgeEventId}-j1`, driverId: "multi-1", runKey: "run2",
    scores: { run1: 80, run2: 1, runoff: null, submitted: { run1: 80, run2: 1, runoff: null } },
  }), "aborted");

  console.log("ok - three-judge rapid submission converges correctly and advances only once all active judges have submitted Run 2");

  console.log("\nqualifying sync emulator tests passed");
} finally {
  await Promise.all(Object.values(surfaces).map((surface) => surface.dispose().catch(() => {})));
  await Promise.all([
    adminDb.doc(`${dataRoot}/events/${singleJudgeEventId}`).delete().catch(() => {}),
    adminDb.doc(`${dataRoot}/events/${multiJudgeEventId}`).delete().catch(() => {}),
  ]);
  await deleteAdminApp(adminApp);
}
