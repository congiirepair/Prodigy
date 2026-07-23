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
const { getFirestore, connectFirestoreEmulator, doc, getDoc, onSnapshot, setDoc } = requireFromRepo("firebase/firestore");
const { getFunctions, connectFunctionsEmulator, httpsCallable } = requireFromRepo("firebase/functions");
const { initializeApp: initializeAdminApp, deleteApp: deleteAdminApp } = requireFromFunctions("firebase-admin/app");
const { getAuth: getAdminAuth } = requireFromFunctions("firebase-admin/auth");
const { getFirestore: getAdminFirestore } = requireFromFunctions("firebase-admin/firestore");
const {
  ROUND3_SYNTHETIC_BRACKET_HASH,
  bracketHash,
  buildRound3RepairVerification,
} = requireFromFunctions("./historical-bracket.js");

const projectId = "prodigy-rc-competitions";
const appId = "1:292850527697:web:6b9cb5249f2716e42e44f0";
const firebaseConfig = { projectId, appId, apiKey: "demo-api-key", authDomain: `${projectId}.firebaseapp.com` };
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = projectId;

function readLocalSecret(name) {
  const lines = fs.readFileSync(`${repoRoot}functions/.secret.local`, "utf8").split(/\r?\n/);
  const line = lines.find((entry) => entry.startsWith(`${name}=`));
  if (!line) throw new Error(`Missing ${name} in functions/.secret.local`);
  return line.slice(name.length + 1);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function client(name) {
  const app = initializeApp(firebaseConfig, name);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
  const functions = getFunctions(app, "us-central1");
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  await signInAnonymously(auth);
  const action = httpsCallable(functions, "prodigyAction", { timeout: 30000 });
  return {
    app,
    auth,
    firestore,
    call: async (actionName, payload = {}) => (await action({ action: actionName, appId, ...payload })).data,
  };
}

function waitForPublicEventSnapshot(firestore, path, predicate, label) {
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out waiting for ${label}`));
    }, 10_000);
    unsubscribe = onSnapshot(doc(firestore, path), (snapshot) => {
      const data = snapshot.data();
      if (!predicate(data)) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve(data);
    }, (error) => {
      clearTimeout(timeout);
      unsubscribe();
      reject(error);
    });
  });
}

const adminApp = initializeAdminApp({ projectId }, "security-test-admin");
const adminAuth = getAdminAuth(adminApp);
const adminDb = getAdminFirestore(adminApp);
const eventPath = `artifacts/${appId}/public/data/events/security-event`;
const twinEventPath = `artifacts/${appId}/public/data/events/security-twin-event`;
const recoveredEventId = "sdc-round-3-las-vegas";
const recoveredEventPath = `artifacts/${appId}/public/data/events/${recoveredEventId}`;
const validatedHistoricalEventId = "validated-historical-event";
const directoryPath = `artifacts/${appId}/public/data/meta/eventDirectory`;
const selectionPath = `artifacts/${appId}/public/data/meta/activeEventSelection`;
const judgePassword = "Local-Judge-Test-Password";
const now = new Date().toISOString();
const baseScores = () => ({
  run1: null,
  run2: null,
  runoff: null,
  submitted: { run1: null, run2: null, runoff: null },
  deductionHistory: { run1: [], run2: [], runoff: [] },
});
const seedEvent = {
  id: "security-event",
  name: "Security Event",
  status: "active",
  judgeCount: 3,
  judgingMode: "line-angle-style",
  competitionMode: "solo",
  createdAt: now,
  updatedAt: now,
  syncStamp: 1,
  roleNames: { admin: "Event Admin", j1: "Line", j2: "Angle", j3: "Style" },
  roleAccess: {
    admin: { passwordHash: sha256("legacy-admin-test"), claimedAt: now },
    j1: { passwordHash: sha256(judgePassword), claimedAt: now },
    j2: { passwordHash: null, claimedAt: null },
    j3: { passwordHash: null, claimedAt: null },
  },
  judgeRoleClaims: { j1: null, j2: null, j3: null },
  venueConfig: {
    enabled: true,
    closeAt: null,
    qrCheckInEnabled: true,
    qrApprovalMode: true,
    qrToken: "security-venue-qr-token",
    qrTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    latitude: 33,
    longitude: -117,
    radiusMeters: 150,
  },
  pendingRegistrations: [],
  drivers: [{
    id: "driver-1",
    name: "Driver One",
    reg: 1,
    signUpPosition: 1,
    runFlags: { run1: null, run2: null, runoff: null },
    scores: { j1: baseScores(), j2: baseScores(), j3: baseScores() },
  }],
  bracket: null,
  twinComp: null,
  qualifyingFlow: { currentDriverId: "driver-1", readyRoles: {}, started: false, completed: false },
  formatMode: "classic",
  lowerCount: "0",
  results: { completedAt: null },
};

await adminDb.doc(eventPath).set(seedEvent);
const seedMeta = structuredClone(seedEvent);
for (const field of ["drivers", "bracket", "twinComp", "qualifyingFlow", "formatMode", "lowerCount"]) delete seedMeta[field];
const twinEvent = {
  ...structuredClone(seedEvent),
  id: "security-twin-event",
  name: "Security Twin Event",
  competitionMode: "twin-triple",
  drivers: [],
  pendingRegistrations: [],
  qualifyingFlow: { currentDriverId: null, readyRoles: {}, started: false, completed: false },
};
const twinMeta = structuredClone(twinEvent);
for (const field of ["drivers", "bracket", "twinComp", "qualifyingFlow", "formatMode", "lowerCount"]) delete twinMeta[field];
const recoveredMeta = {
  ...structuredClone(seedMeta),
  id: recoveredEventId,
  name: "SDC Round 3 | Las Vegas",
  status: "completed",
  judgingMode: "average",
  results: { completedAt: "2026-04-11T22:11:00-07:00", championName: "Recovered Champion" },
};
await adminDb.doc(twinEventPath).set(twinEvent);
await adminDb.doc(directoryPath).set({
  events: {
    "security-event": seedMeta,
    "security-twin-event": twinMeta,
    [recoveredEventId]: recoveredMeta,
    [validatedHistoricalEventId]: { ...recoveredMeta, id: validatedHistoricalEventId, name: "Validated Historical Event" },
  },
  activeEventId: "security-event",
  syncStamp: 1,
});

const clients = [];
try {
  const spectator = await client("spectator-client");
  const owner = await client("owner-client");
  const judge = await client("judge-client");
  const attacker = await client("attacker-client");
  const legacyAdmin = await client("legacy-admin-client");
  const legacyClaims = await client("legacy-claims-client");
  const expiredOwner = await client("expired-owner-client");
  clients.push(spectator, owner, judge, attacker, legacyAdmin, legacyClaims, expiredOwner);

  await adminAuth.setCustomUserClaims(legacyClaims.auth.currentUser.uid, { role: "owner", roles: ["owner", "admin", "judge"] });
  await legacyClaims.auth.currentUser.getIdToken(true);
  await assert.rejects(legacyClaims.call("setActiveSelection", { eventId: "security-event" }));
  await adminAuth.setCustomUserClaims(expiredOwner.auth.currentUser.uid, { owner: true, ownerExpiresAt: Date.now() - 60_000 });
  await expiredOwner.auth.currentUser.getIdToken(true);
  await assert.rejects(expiredOwner.call("setActiveSelection", { eventId: "security-event" }));
  await assert.rejects(attacker.call("restoreMissingEvent", {
    eventId: recoveredEventId,
    eventPayload: recoveredMeta,
    eventMeta: recoveredMeta,
  }));

  await assert.rejects(setDoc(doc(spectator.firestore, eventPath), { name: "Forged" }, { merge: true }));

  await owner.call("authorizeAccess", { kind: "websiteAdmin", password: readLocalSecret("WEBSITE_ADMIN_PASSWORD") });
  const ownerToken = await owner.auth.currentUser.getIdTokenResult(true);
  assert.equal(ownerToken.claims.owner, true);
  assert.ok(Number(ownerToken.claims.ownerExpiresAt) > Date.now());

  const validatedHistoricalBracket = {
    version: 3,
    createdAt: "2026-03-01T12:00:00.000Z",
    mainBracket: { rounds: [{ matches: [{ left: { name: "Winner" }, right: { name: "Runner Up" }, winner: { name: "Winner" } }] }] },
    lowerBracket: null,
  };
  const validatedHistoricalPayload = {
    ...structuredClone(recoveredMeta),
    id: validatedHistoricalEventId,
    name: "Validated Historical Event",
    drivers: [{ id: "verified-driver", name: "Winner", reg: 1 }],
    bracket: validatedHistoricalBracket,
    qualifyingFlow: { currentDriverId: null, readyRoles: {}, started: true, completed: true },
    formatMode: "classic",
    lowerCount: "0",
  };
  await assert.rejects(owner.call("restoreMissingEvent", {
    eventId: validatedHistoricalEventId,
    eventPayload: validatedHistoricalPayload,
    eventMeta: validatedHistoricalPayload,
  }));
  const validatedHistoricalRecovery = await owner.call("restoreMissingEvent", {
    eventId: validatedHistoricalEventId,
    eventPayload: validatedHistoricalPayload,
    eventMeta: validatedHistoricalPayload,
    validatedHistoricalBracket: true,
    validatedBracketHash: bracketHash(validatedHistoricalBracket),
  });
  assert.deepEqual(validatedHistoricalRecovery.eventPayload.bracket, validatedHistoricalBracket);
  assert.equal(validatedHistoricalRecovery.eventPayload.historicalBracketStatus, "available");

  const recoveredPayload = {
    ...structuredClone(recoveredMeta),
    drivers: [{ id: "round3-driver", name: "Round 3 Driver", reg: 1 }],
    bracket: null,
    historicalBracketStatus: "unavailable",
    twinComp: null,
    qualifyingFlow: { currentDriverId: null, readyRoles: {}, started: true, completed: true },
    formatMode: "sdc-top-16",
    lowerCount: "16",
  };
  const recovered = await owner.call("restoreMissingEvent", {
    eventId: recoveredEventId,
    eventPayload: recoveredPayload,
    eventMeta: recoveredMeta,
    archivedResultRecord: { id: recoveredEventId, name: recoveredMeta.name, status: "completed", results: recoveredMeta.results },
  });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.restored, true);
  assert.equal(recovered.eventPayload.formatMode, "sdc-top-16");
  assert.equal(recovered.eventPayload.bracket, null);
  assert.equal(recovered.eventPayload.historicalBracketStatus, "unavailable");
  let sharedSelection = (await adminDb.doc(selectionPath).get()).data();
  let sharedDirectory = (await adminDb.doc(directoryPath).get()).data();
  assert.equal(sharedSelection.activeEventId, recoveredEventId);
  assert.equal(sharedSelection.eventMeta.id, recoveredEventId);
  assert.equal(sharedSelection.eventMeta.name, recoveredMeta.name);
  assert.equal(sharedDirectory.activeEventId, recoveredEventId);
  assert.equal((await adminDb.doc(recoveredEventPath).get()).exists, true);

  const idempotentRecovery = await owner.call("restoreMissingEvent", {
    eventId: recoveredEventId,
    eventPayload: { ...recoveredPayload, name: "Must Not Overwrite" },
    eventMeta: { ...recoveredMeta, name: "Must Not Overwrite" },
  });
  assert.equal(idempotentRecovery.restored, false);
  assert.equal(idempotentRecovery.eventPayload.name, recoveredMeta.name);

  const syntheticBracket = {
    version: 9,
    createdAt: "2026-07-22T12:53:23.500Z",
    plan: { resolvedFormat: "sdc", preferredFormat: "sdc-top-16", qualifiedCount: 25 },
    lowerBracket: { rounds: [{ matches: [{ left: { id: "a", name: "A" }, right: { id: "b", name: "B" }, winner: null, winnerMode: null }] }] },
    mainBracket: { rounds: [{ matches: [{ left: { id: "c", name: "C" }, right: null, winner: null, winnerMode: null }] }], thirdPlaceMatch: null },
  };
  const syntheticEvent = {
    ...structuredClone(recoveredPayload),
    bracket: syntheticBracket,
    results: { ...structuredClone(recoveredMeta.results), totalBattles: 0, completedBattles: 0 },
    preservedMarker: "must-remain",
    syncStamp: 77,
  };
  delete syntheticEvent.historicalBracketStatus;
  await adminDb.doc(recoveredEventPath).set(syntheticEvent);
  await assert.rejects(attacker.call("repairHistoricalBracketUnavailable", { eventId: recoveredEventId }));
  await assert.rejects(attacker.call("repairHistoricalBracketUnavailable", { eventId: recoveredEventId, verifyOnly: true }));
  await assert.rejects(owner.call("repairHistoricalBracketUnavailable", { eventId: "wrong-event" }));
  const preVerifySnapshot = await adminDb.doc(recoveredEventPath).get();
  const preVerifyData = preVerifySnapshot.data();
  const repairVerify = await owner.call("repairHistoricalBracketUnavailable", { eventId: recoveredEventId, verifyOnly: true });
  const expectedVerification = buildRound3RepairVerification(recoveredEventId, preVerifyData, { updateTime: preVerifySnapshot.updateTime });
  assert.deepEqual(repairVerify.verify, expectedVerification);
  assert.equal(repairVerify.changed, false);
  assert.equal(repairVerify.verify.canExecuteRepair, false);
  assert.equal(repairVerify.verify.reason, "unexpected-bracket-hash");
  assert.equal(repairVerify.verify.serverComputedBracketHash, bracketHash(preVerifyData.bracket));
  assert.equal(typeof repairVerify.verify.documentUpdateTime, "string");
  assert.equal((await adminDb.doc(`artifacts/${appId}/private/historicalBracketRepairs/events/${recoveredEventId}`).get()).exists, false);
  assert.equal((await adminDb.doc(recoveredEventPath).get()).data()?.preservedMarker, "must-remain");
  let repairPreviewError = null;
  try {
    await owner.call("repairHistoricalBracketUnavailable", { eventId: recoveredEventId });
  } catch (error) {
    repairPreviewError = error;
  }
  assert.ok(repairPreviewError);
  assert.match(String(repairPreviewError?.message || ""), /unexpected-bracket-hash/);
  assert.equal(repairPreviewError?.details?.reason, "unexpected-bracket-hash");
  assert.equal(repairPreviewError?.details?.diagnostic?.expectedBracketHash, ROUND3_SYNTHETIC_BRACKET_HASH);
  assert.equal(repairPreviewError?.details?.diagnostic?.normalizedBracketCreatedAt, "2026-07-22T12:53:23.500Z");
  assert.equal(repairPreviewError?.details?.diagnostic?.winnerCount, 0);
  assert.equal(repairPreviewError?.details?.diagnostic?.completedMatchCount, 0);
  assert.equal(repairPreviewError?.details?.diagnostic?.totalBattles, 0);
  assert.equal(repairPreviewError?.details?.diagnostic?.completedBattles, 0);
  assert.equal(repairPreviewError?.details?.diagnostic?.syncStamp, 77);
  assert.deepEqual(repairPreviewError?.details?.diagnostic?.topLevelBracketKeys, ["createdAt", "lowerBracket", "mainBracket", "plan", "version"]);
  assert.equal((await adminDb.doc(`artifacts/${appId}/private/historicalBracketRepairs/events/${recoveredEventId}`).get()).exists, false);
  assert.equal((await adminDb.doc(recoveredEventPath).get()).data()?.preservedMarker, "must-remain");

  await adminDb.doc(recoveredEventPath).set({
    ...syntheticEvent,
    bracket: null,
    historicalBracketStatus: "unavailable",
    syncStamp: 88,
  });
  const alreadyRepairedVerify = await owner.call("repairHistoricalBracketUnavailable", { eventId: recoveredEventId, verifyOnly: true });
  assert.equal(alreadyRepairedVerify.verify.alreadyRepaired, true);
  assert.equal(alreadyRepairedVerify.verify.canExecuteRepair, false);
  assert.equal(alreadyRepairedVerify.verify.historicalBracketStatus, "unavailable");
  assert.equal(alreadyRepairedVerify.verify.reason, null);

  const selectedLive = await owner.call("setActiveSelection", { eventId: "security-event" });
  assert.equal(selectedLive.eventMeta.id, "security-event");
  sharedSelection = (await adminDb.doc(selectionPath).get()).data();
  sharedDirectory = (await adminDb.doc(directoryPath).get()).data();
  assert.equal(sharedSelection.activeEventId, "security-event");
  assert.equal(sharedSelection.eventMeta.id, "security-event");
  assert.equal(sharedDirectory.activeEventId, "security-event");

  const selectedCompletedSdc = await owner.call("setActiveSelection", { eventId: recoveredEventId });
  assert.equal(selectedCompletedSdc.activeEventId, recoveredEventId);
  assert.equal(selectedCompletedSdc.eventMeta.status, "completed");

  const migrated = (await getDoc(doc(owner.firestore, eventPath))).data();
  assert.equal(migrated.roleAccess.j1.passwordConfigured, true);
  assert.equal("passwordHash" in migrated.roleAccess.j1, false);

  await legacyAdmin.call("authorizeAccess", {
    kind: "eventRole",
    eventId: "security-event",
    role: "admin",
    password: "legacy-admin-test",
  });
  await legacyAdmin.auth.currentUser.getIdTokenResult(true);
  const upgradedLegacySecret = (await adminDb.doc(`artifacts/${appId}/private/eventAccess/events/security-event`).get()).data();
  assert.equal(upgradedLegacySecret.roles.admin.algorithm, "scrypt-v1");
  assert.notEqual(upgradedLegacySecret.roles.admin.passwordHash, sha256("legacy-admin-test"));

  await owner.call("authorizeAccess", {
    kind: "eventRole",
    eventId: "security-event",
    role: "j2",
    password: readLocalSecret("WEBSITE_ADMIN_PASSWORD"),
  });
  const ownerWithMasterRole = await owner.auth.currentUser.getIdTokenResult(true);
  assert.ok(ownerWithMasterRole.claims.eventRoleVersions["security-event"].j2);
  const masterUnlockedEvent = (await getDoc(doc(owner.firestore, eventPath))).data();
  assert.equal(masterUnlockedEvent.roleAccess.j2.passwordConfigured, false);
  assert.ok(masterUnlockedEvent.roleAccess.j2.accessVersion);

  await assert.rejects(owner.call("adminRegistration", {
    eventId: "security-twin-event",
    operation: "direct",
    entries: [{ name: "Member One", teamName: "Malformed Twin" }, { name: "Member Two", teamName: "Malformed Twin" }],
  }));
  const directTwin = await owner.call("adminRegistration", {
    eventId: "security-twin-event",
    operation: "direct",
    entries: [{ name: "Direct Twin", teamName: "Direct One, Direct Two", tandemMembers: ["Direct One", "Direct Two"], memberCount: 2, tandemType: "team" }],
  });
  assert.equal(directTwin.eventPayload.drivers.length, 1);
  assert.deepEqual(directTwin.eventPayload.drivers[0].tandemMembers, ["Direct One", "Direct Two"]);

  const twinRegistrationToken = `twin-registration-${crypto.randomUUID()}`;
  await assert.rejects(spectator.call("submitSelfRegistration", {
    eventId: "security-twin-event",
    deviceToken: twinRegistrationToken,
    entries: [{ name: "Only Member", teamName: "Incomplete Twin" }],
  }));
  const twinRegistration = await spectator.call("submitSelfRegistration", {
    eventId: "security-twin-event",
    deviceToken: twinRegistrationToken,
    entries: [
      { name: "Twin Member One", teamName: "Valid Twin" },
      { name: "Twin Member Two", teamName: "Valid Twin" },
    ],
  });
  assert.equal(twinRegistration.entries.length, 2);
  assert.equal(twinRegistration.entries[0].teamMemberCount, 2);
  assert.equal(twinRegistration.entries[1].teamMemberOrder, 2);

  const stale = await owner.call("commitEventSnapshot", {
    eventId: "security-event",
    eventPayload: migrated,
    eventMeta: migrated,
    expectedSyncStamp: 0,
    publishSyncStamp: 2,
  });
  assert.equal(stale.stale, true);

  const saved = await owner.call("commitEventSnapshot", {
    eventId: "security-event",
    eventPayload: { ...migrated, name: "Secure Event" },
    eventMeta: { ...migrated, name: "Secure Event" },
    expectedSyncStamp: 1,
    publishSyncStamp: 9_000_000_000_000_000,
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.eventPayload.name, "Secure Event");
  assert.ok(saved.syncStamp > 1 && saved.syncStamp < 9_000_000_000_000_000);

  const forgedAuthorizationMetadata = await legacyAdmin.call("commitEventSnapshot", {
    eventId: "security-event",
    eventPayload: {
      ...saved.eventPayload,
      roleAccess: {
        ...saved.eventPayload.roleAccess,
        admin: { passwordConfigured: false, accessVersion: "forged-admin-version" },
        j1: { passwordConfigured: false, accessVersion: "forged-judge-version" },
      },
      judgeRoleClaims: { j1: { uid: legacyAdmin.auth.currentUser.uid, deviceId: "forged-device" } },
    },
    eventMeta: saved.eventMeta,
    expectedSyncStamp: saved.syncStamp,
  });
  assert.equal(forgedAuthorizationMetadata.ok, true);
  assert.deepEqual(forgedAuthorizationMetadata.eventPayload.roleAccess, saved.eventPayload.roleAccess);
  assert.deepEqual(forgedAuthorizationMetadata.eventPayload.judgeRoleClaims, saved.eventPayload.judgeRoleClaims);

  await owner.call("manageRoleSecret", { eventId: "security-event", role: "j1", password: judgePassword });
  const storedSecret = (await adminDb.doc(`artifacts/${appId}/private/eventAccess/events/security-event`).get()).data();
  assert.equal(storedSecret.roles.j1.algorithm, "scrypt-v1");
  assert.notEqual(storedSecret.roles.j1.passwordHash, sha256(judgePassword));
  assert.ok(storedSecret.roles.j1.accessVersion);
  await assert.rejects(attacker.call("authorizeAccess", { kind: "eventRole", eventId: "security-event", role: "j1", password: "incorrect-password" }));
  await judge.call("authorizeAccess", { kind: "eventRole", eventId: "security-event", role: "j1", password: judgePassword });
  const judgeToken = await judge.auth.currentUser.getIdTokenResult(true);
  assert.deepEqual(judgeToken.claims.eventRoles["security-event"], ["j1"]);
  await judge.call("claimJudgeRole", { eventId: "security-event", role: "j1", deviceId: "judge-device-1" });
  await attacker.call("authorizeAccess", { kind: "eventRole", eventId: "security-event", role: "j1", password: judgePassword });
  await assert.rejects(attacker.call("claimJudgeRole", {
    eventId: "security-event",
    role: "j1",
    deviceId: "judge-device-1",
    release: true,
  }));

  const run1LiveUpdate = waitForPublicEventSnapshot(
    spectator.firestore,
    eventPath,
    (event) => event?.drivers?.[0]?.scores?.j1?.submitted?.run1 === 35,
    "the live qualifying run-one score",
  );
  const scoreResult = await judge.call("submitJudgeQualifying", {
    eventId: "security-event",
    role: "j1",
    deviceId: "judge-device-1",
    driverId: "driver-1",
    runKey: "run1",
    scores: { run1: 35, submitted: { run1: 35 }, deductionHistory: { run1: ["-5"] } },
  });
  assert.equal(scoreResult.eventPayload.drivers[0].scores.j1.submitted.run1, 35);
  assert.equal(scoreResult.eventPayload.drivers[0].scores.j2.submitted.run1, null);
  const liveRun1 = await run1LiveUpdate;
  assert.equal(liveRun1.drivers[0].scores.j1.submitted.run1, 35);
  const reconnectingObserver = await client(`qualifying-reconnect-${crypto.randomUUID()}`);
  clients.push(reconnectingObserver);
  const reconnectedRun1 = await waitForPublicEventSnapshot(
    reconnectingObserver.firestore,
    eventPath,
    (event) => event?.drivers?.[0]?.scores?.j1?.submitted?.run1 === 35,
    "the persisted qualifying score after reconnect",
  );
  assert.equal(reconnectedRun1.drivers[0].scores.j1.submitted.run1, 35);
  const run2LiveUpdate = waitForPublicEventSnapshot(
    spectator.firestore,
    eventPath,
    (event) => event?.drivers?.[0]?.scores?.j1?.submitted?.run2 === 36,
    "the live qualifying run-two score",
  );
  await judge.call("submitJudgeQualifying", {
    eventId: "security-event",
    role: "j1",
    deviceId: "judge-device-1",
    driverId: "driver-1",
    runKey: "run2",
    scores: { run2: 36, submitted: { run2: 36 }, deductionHistory: { run2: ["-4"] } },
  });
  const liveRun2 = await run2LiveUpdate;
  assert.equal(liveRun2.drivers[0].scores.j1.submitted.run2, 36);
  await assert.rejects(judge.call("submitJudgeQualifying", {
    eventId: "security-event",
    role: "j1",
    deviceId: "judge-device-1",
    driverId: "driver-1",
    runKey: "run1",
    scores: { run1: 99, submitted: { run1: 99 } },
  }));

  const rotatedJudgePassword = `${judgePassword}-Rotated`;
  await owner.call("manageRoleSecret", { eventId: "security-event", role: "j1", password: rotatedJudgePassword });
  await assert.rejects(judge.call("submitJudgeQualifying", {
    eventId: "security-event",
    role: "j1",
    deviceId: "judge-device-1",
    driverId: "driver-1",
    runKey: "run1",
    scores: { run1: 40, submitted: { run1: 40 } },
  }));
  await judge.call("authorizeAccess", { kind: "eventRole", eventId: "security-event", role: "j1", password: rotatedJudgePassword });
  await judge.auth.currentUser.getIdTokenResult(true);
  await judge.call("claimJudgeRole", { eventId: "security-event", role: "j1", deviceId: "judge-device-1" });

  await assert.rejects(judge.call("commitEventSnapshot", {
    eventId: "security-event",
    eventPayload: { ...scoreResult.eventPayload, name: "Judge Forgery" },
    eventMeta: scoreResult.eventPayload,
    expectedSyncStamp: scoreResult.syncStamp,
    publishSyncStamp: scoreResult.syncStamp + 1,
  }));

  const registrationToken = `registration-${crypto.randomUUID()}`;
  await assert.rejects(spectator.call("submitSelfRegistration", {
    eventId: "security-event",
    deviceToken: `registration-${crypto.randomUUID()}`,
    entries: [{ name: "Unexpected One" }, { name: "Unexpected Two" }],
  }));
  await assert.rejects(owner.call("adminRegistration", {
    eventId: "security-event",
    operation: "unknown-operation",
    entryId: "missing",
  }));
  const legacyBrowserToken = "abc123xyz";
  const legacyBrowserRegistration = await spectator.call("submitSelfRegistration", {
    eventId: "security-event",
    deviceToken: legacyBrowserToken,
    entries: [{ id: "legacy-browser-pending", name: "Legacy Browser Driver" }],
  });
  assert.equal(legacyBrowserRegistration.eventPayload.pendingRegistrations[0].deviceToken, legacyBrowserToken);
  const legacyBrowserArrival = await spectator.call("spectatorArrival", {
    eventId: "security-event",
    deviceToken: legacyBrowserToken,
    arrivalProof: { source: "qr", qrToken: "security-venue-qr-token" },
  });
  assert.ok(legacyBrowserArrival.eventPayload.pendingRegistrations[0].checkedInAt);
  await owner.call("adminRegistration", {
    eventId: "security-event",
    operation: "remove",
    entryId: "legacy-browser-pending",
  });
  await assert.rejects(spectator.call("submitSelfRegistration", {
    eventId: "security-event",
    deviceToken: "short",
    entries: [{ name: "Invalid Device Token" }],
  }));
  const registration = await spectator.call("submitSelfRegistration", {
    eventId: "security-event",
    deviceToken: registrationToken,
    entries: [{
      id: "pending-1",
      name: "New Driver",
      teamName: "",
      chassis: "RDX",
      arrived: true,
      checkedInAt: new Date().toISOString(),
      arrivalSource: "qr",
      checkedInDistanceMeters: 0,
    }],
  });
  assert.equal(registration.eventPayload.pendingRegistrations.length, 1);
  assert.equal(registration.eventPayload.pendingRegistrations[0].deviceToken, registrationToken);
  assert.ok(registration.eventPayload.pendingRegistrations[0].selfRegisteredAt);
  assert.equal(registration.eventPayload.pendingRegistrations[0].checkedInAt, null);
  const concurrentRegistrationToken = `concurrent-registration-${crypto.randomUUID()}`;
  const concurrentRegistrationPayload = {
    eventId: "security-event",
    deviceToken: concurrentRegistrationToken,
    entries: [{ id: "concurrent-pending-1", name: "Concurrent Driver", teamName: "", chassis: "RDX" }],
  };
  await Promise.all([
    spectator.call("submitSelfRegistration", concurrentRegistrationPayload),
    spectator.call("submitSelfRegistration", concurrentRegistrationPayload),
  ]);
  const postConcurrentRegistration = (await adminDb.doc(eventPath).get()).data();
  assert.equal(
    postConcurrentRegistration.pendingRegistrations.filter((entry) => entry.deviceToken === concurrentRegistrationToken).length,
    1,
    "simultaneous submissions from one device must converge to one pending registration",
  );
  await assert.rejects(owner.call("adminRegistration", {
    eventId: "security-event",
    operation: "direct",
    entries: [{ name: "New Driver", chassis: "Duplicate" }],
  }));
  await assert.rejects(attacker.call("submitSelfRegistration", {
    eventId: "security-event",
    deviceToken: registrationToken,
    entries: [{ id: "pending-2", name: "Attacker", teamName: "", chassis: "" }],
  }));
  await assert.rejects(attacker.call("spectatorArrival", {
    eventId: "security-event",
    deviceToken: registrationToken,
    arrivalProof: { source: "qr", qrToken: "security-venue-qr-token" },
  }));
  await assert.rejects(spectator.call("spectatorArrival", {
    eventId: "security-event",
    deviceToken: registrationToken,
    arrivalProof: { source: "qr", qrToken: "incorrect-token" },
  }));
  await assert.rejects(spectator.call("spectatorArrival", {
    eventId: "security-event",
    deviceToken: registrationToken,
    arrivalProof: { source: "geofence", distanceMeters: 0 },
  }));
  await assert.rejects(spectator.call("spectatorArrival", {
    eventId: "security-event",
    deviceToken: registrationToken,
    arrivalProof: { source: "geofence", latitude: 34, longitude: -117 },
  }));
  const arrived = await spectator.call("spectatorArrival", {
    eventId: "security-event",
    deviceToken: registrationToken,
    arrivalProof: { source: "qr", qrToken: "security-venue-qr-token" },
  });
  assert.ok(arrived.eventPayload.pendingRegistrations[0].checkedInAt);
  const resetArrival = await owner.call("adminRegistration", {
    eventId: "security-event",
    operation: "resetArrival",
    entryId: "pending-1",
  });
  assert.equal(resetArrival.eventPayload.pendingRegistrations[0].checkedInAt, null);
  await assert.rejects(owner.call("adminRegistration", {
    eventId: "security-event",
    operation: "approve",
    entryId: "pending-1",
  }));
  await spectator.call("spectatorArrival", {
    eventId: "security-event",
    deviceToken: registrationToken,
    arrivalProof: { source: "geofence", latitude: 33, longitude: -117 },
  });
  const approved = await owner.call("adminRegistration", {
    eventId: "security-event",
    operation: "approve",
    entryId: "pending-1",
    markPaid: true,
  });
  const approvedDriver = approved.eventPayload.drivers.find((entry) => entry.name === "New Driver");
  assert.ok(approvedDriver.approvedToRosterAt);
  assert.ok(approvedDriver.selfRegisteredAt);
  assert.ok(approvedDriver.paidAt);

  const preverifiedToken = `preverified-${crypto.randomUUID()}`;
  const preverified = await spectator.call("submitSelfRegistration", {
    eventId: "security-event",
    deviceToken: preverifiedToken,
    entries: [{ id: "preverified-1", name: "Preverified Driver", chassis: "Initial" }],
    arrivalProof: { source: "geofence", latitude: 33, longitude: -117 },
  });
  const preverifiedEntry = preverified.eventPayload.pendingRegistrations.find((entry) => entry.id === "preverified-1");
  assert.ok(preverifiedEntry.checkedInAt);
  assert.equal(preverifiedEntry.checkedInDistanceMeters, 0);
  const editedPreverified = await spectator.call("submitSelfRegistration", {
    eventId: "security-event",
    deviceToken: preverifiedToken,
    entries: [{ id: "preverified-1", name: "Preverified Driver", chassis: "Updated" }],
  });
  const editedPreverifiedEntry = editedPreverified.eventPayload.pendingRegistrations.find((entry) => entry.id === "preverified-1");
  assert.equal(editedPreverifiedEntry.checkedInAt, preverifiedEntry.checkedInAt);
  assert.equal(editedPreverifiedEntry.chassis, "Updated");

  const legacyToken = `legacy-${crypto.randomUUID()}`;
  const latestEvent = (await adminDb.doc(eventPath).get()).data();
  await adminDb.doc(eventPath).update({
    pendingRegistrations: [{
      id: "legacy-pending",
      registrationGroupId: "legacy-group",
      deviceToken: legacyToken,
      name: "Legacy Driver",
      checkedInAt: null,
    }],
    syncStamp: Number(latestEvent.syncStamp || 0) + 1,
  });
  await assert.rejects(attacker.call("spectatorArrival", {
    eventId: "security-event",
    deviceToken: legacyToken,
    arrivalProof: { source: "qr", qrToken: "security-venue-qr-token" },
  }));
  await assert.rejects(attacker.call("submitSelfRegistration", {
    eventId: "security-event",
    deviceToken: legacyToken,
    entries: [{ id: "legacy-hijack", name: "Hijacked Driver" }],
  }));

  await judge.call("revokeAccess", { eventId: "security-event", role: "j1" });
  await judge.auth.currentUser.getIdTokenResult(true);
  await assert.rejects(judge.call("submitJudgeQualifying", {
    eventId: "security-event",
    role: "j1",
    deviceId: "judge-device-1",
    driverId: "driver-1",
    runKey: "run1",
    scores: { run1: 45, submitted: { run1: 45 } },
  }));

  await assert.rejects(getDoc(doc(spectator.firestore, `artifacts/${appId}/private/eventAccess/events/security-event`)));
  console.log("callable authorization integration tests passed");
} finally {
  await Promise.all(clients.map((entry) => deleteApp(entry.app).catch(() => {})));
  await deleteAdminApp(adminApp);
}
