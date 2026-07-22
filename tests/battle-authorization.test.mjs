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
const { getFunctions, connectFunctionsEmulator, httpsCallable } = requireFromRepo("firebase/functions");
const { initializeApp: initializeAdminApp, deleteApp: deleteAdminApp } = requireFromFunctions("firebase-admin/app");
const { getFirestore: getAdminFirestore } = requireFromFunctions("firebase-admin/firestore");

const projectId = "prodigy-rc-competitions";
const appId = "1:292850527697:web:6b9cb5249f2716e42e44f0";
const firebaseConfig = { projectId, appId, apiKey: "demo-api-key", authDomain: `${projectId}.firebaseapp.com` };
const directoryPath = `artifacts/${appId}/public/data/meta/eventDirectory`;
const now = new Date().toISOString();
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = projectId;

function readLocalSecret(name) {
  const lines = fs.readFileSync(`${repoRoot}functions/.secret.local`, "utf8").split(/\r?\n/);
  const line = lines.find((entry) => entry.startsWith(`${name}=`));
  if (!line) throw new Error(`Missing ${name} in functions/.secret.local`);
  return line.slice(name.length + 1);
}

function driver(id, seed, memberCount = 1) {
  return {
    id,
    seed,
    name: id.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    registrationNumber: seed,
    signUpPosition: seed,
    memberCount,
    tandemMembers: Array.from({ length: memberCount }, (_, index) => `${id}-member-${index + 1}`),
    tandemBonusPoints: memberCount >= 3 ? 3 : 0,
    tandemType: memberCount > 1 ? "team" : null,
  };
}

function bracket(left, right) {
  return {
    plan: { resolvedFormat: "classic", mainBracketSize: 2 },
    lowerBracket: null,
    mainBracket: {
      title: "Final",
      rounds: [{
        name: "Final",
        matches: [{ left, right, winner: null, winnerMode: null, lockedLeft: false, lockedRight: false }],
      }],
      thirdPlaceMatch: null,
    },
    competitionJudgeControl: null,
  };
}

function event(eventId, competitionMode, left, right) {
  return {
    id: eventId,
    name: `${competitionMode} Battle Security Event`,
    status: "active",
    judgeCount: 3,
    judgingMode: "line-angle-style",
    competitionMode,
    createdAt: now,
    updatedAt: now,
    syncStamp: 1,
    roleNames: { admin: "Event Admin", j1: "Line", j2: "Angle", j3: "Style" },
    roleAccess: {
      admin: { passwordConfigured: false, accessVersion: null },
      j1: { passwordConfigured: false, accessVersion: null },
      j2: { passwordConfigured: false, accessVersion: null },
      j3: { passwordConfigured: false, accessVersion: null },
    },
    judgeRoleClaims: { j1: null, j2: null, j3: null },
    venueConfig: { enabled: true, closeAt: null },
    pendingRegistrations: [],
    drivers: [left, right],
    bracket: bracket(left, right),
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

async function client(name) {
  const app = initializeApp(firebaseConfig, name);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const functions = getFunctions(app, "us-central1");
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  await signInAnonymously(auth);
  const action = httpsCallable(functions, "prodigyAction", { timeout: 30000 });
  return {
    app,
    auth,
    call: async (actionName, payload = {}) => (await action({ action: actionName, appId, ...payload })).data,
  };
}

async function authorizeAndClaim(judge, eventId, role, deviceId, password) {
  await judge.call("authorizeAccess", { kind: "eventRole", eventId, role, password });
  await judge.auth.currentUser.getIdTokenResult(true);
  await judge.call("claimJudgeRole", { eventId, role, deviceId });
}

async function expectCallableError(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, `functions/${code}`);
    return true;
  });
}

const soloEventId = `battle-solo-${crypto.randomUUID()}`;
const teamEventId = `battle-team-${crypto.randomUUID()}`;
const soloPath = `artifacts/${appId}/public/data/events/${soloEventId}`;
const teamPath = `artifacts/${appId}/public/data/events/${teamEventId}`;
const soloEvent = event(soloEventId, "solo", driver("solo-left", 1), driver("solo-right", 2));
const teamEvent = event(teamEventId, "team-tandem", driver("team-left", 1, 3), driver("team-right", 2, 2));
const adminApp = initializeAdminApp({ projectId }, `battle-security-admin-${crypto.randomUUID()}`);
const adminDb = getAdminFirestore(adminApp);
const clients = [];

try {
  await adminDb.doc(soloPath).set(soloEvent);
  await adminDb.doc(teamPath).set(teamEvent);
  await adminDb.doc(directoryPath).set({
    events: { [soloEventId]: eventMeta(soloEvent), [teamEventId]: eventMeta(teamEvent) },
    syncStamp: 1,
  }, { merge: true });

  const ownerPassword = readLocalSecret("WEBSITE_ADMIN_PASSWORD");
  const judges = {};
  for (const role of ["j1", "j2", "j3"]) {
    judges[role] = await client(`battle-${role}-${crypto.randomUUID()}`);
    clients.push(judges[role]);
    await authorizeAndClaim(judges[role], soloEventId, role, `solo-${role}-device`, ownerPassword);
    await authorizeAndClaim(judges[role], teamEventId, role, `team-${role}-device`, ownerPassword);
  }
  const outsider = await client(`battle-outsider-${crypto.randomUUID()}`);
  const eventAdmin = await client(`battle-admin-${crypto.randomUUID()}`);
  clients.push(outsider, eventAdmin);
  await eventAdmin.call("authorizeAccess", {
    kind: "eventRole", eventId: soloEventId, role: "admin", password: ownerPassword,
  });
  await eventAdmin.call("authorizeAccess", {
    kind: "eventRole", eventId: teamEventId, role: "admin", password: ownerPassword,
  });
  await eventAdmin.auth.currentUser.getIdTokenResult(true);

  await expectCallableError(outsider.call("submitJudgeVote", {
    eventId: soloEventId,
    role: "j1",
    deviceId: "solo-j1-device",
    side: "left",
    expectedEntryKey: "main:0:0",
  }), "permission-denied");
  await expectCallableError(judges.j1.call("submitJudgeVote", {
    eventId: soloEventId,
    role: "j2",
    deviceId: "solo-j1-device",
    side: "left",
    expectedEntryKey: "main:0:0",
  }), "permission-denied");
  await expectCallableError(judges.j1.call("submitJudgeVote", {
    eventId: soloEventId,
    role: "j1",
    deviceId: "wrong-device",
    side: "left",
    expectedEntryKey: "main:0:0",
  }), "permission-denied");
  await expectCallableError(judges.j1.call("submitJudgeVote", {
    eventId: soloEventId,
    role: "j1",
    deviceId: "solo-j1-device",
    side: "left",
    expectedEntryKey: "main:0:1",
  }), "aborted");

  const rapidVotes = await Promise.all([
    judges.j1.call("submitJudgeVote", {
      eventId: soloEventId, role: "j1", deviceId: "solo-j1-device", side: "left", expectedEntryKey: "main:0:0",
    }),
    judges.j1.call("submitJudgeVote", {
      eventId: soloEventId, role: "j1", deviceId: "solo-j1-device", side: "right", expectedEntryKey: "main:0:0",
    }),
  ]);
  assert.equal(rapidVotes.every((result) => result.ok), true);
  let persisted = (await adminDb.doc(soloPath).get()).data();
  assert.ok(["left", "right"].includes(persisted.bracket.competitionJudgeControl.votes.j1));
  assert.equal(persisted.bracket.mainBracket.rounds[0].matches[0].winner, null);

  await judges.j2.call("submitJudgeVote", {
    eventId: soloEventId, role: "j2", deviceId: "solo-j2-device", side: "left", expectedEntryKey: "main:0:0",
  });
  const finalRapidResults = await Promise.allSettled([
    judges.j3.call("submitJudgeVote", {
      eventId: soloEventId, role: "j3", deviceId: "solo-j3-device", side: "left", expectedEntryKey: "main:0:0",
    }),
    judges.j3.call("submitJudgeVote", {
      eventId: soloEventId, role: "j3", deviceId: "solo-j3-device", side: "right", expectedEntryKey: "main:0:0",
    }),
  ]);
  assert.equal(finalRapidResults.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(finalRapidResults.filter((result) => result.status === "rejected").length, 1);
  assert.equal(finalRapidResults.find((result) => result.status === "rejected").reason.code, "functions/aborted");
  persisted = (await adminDb.doc(soloPath).get()).data();
  const soloControl = persisted.bracket.competitionJudgeControl;
  assert.equal(soloControl.status, "admin_decision");
  assert.ok(["left", "right"].includes(soloControl.resolvedWinnerSide));
  assert.equal(soloControl.decisionType, "winner");
  assert.ok(Date.parse(soloControl.reviewDeadlineAt) > Date.now());
  assert.equal(persisted.bracket.mainBracket.rounds[0].matches[0].winner.id, `solo-${soloControl.resolvedWinnerSide}`);
  await expectCallableError(judges.j1.call("submitJudgeVote", {
    eventId: soloEventId,
    role: "j1",
    deviceId: "solo-j1-device",
    side: "left",
    expectedEntryKey: "main:0:0",
  }), "aborted");
  await expectCallableError(outsider.call("adminCompetitionDecision", {
    eventId: soloEventId,
    decision: "continue",
    expectedEntryKey: "main:0:0",
    expectedAttemptId: soloControl.attemptId,
  }), "permission-denied");
  const reviewedSolo = await eventAdmin.call("adminCompetitionDecision", {
    eventId: soloEventId,
    decision: "review",
    expectedEntryKey: "main:0:0",
    expectedAttemptId: soloControl.attemptId,
  });
  assert.equal(reviewedSolo.changed, true);
  assert.equal(reviewedSolo.eventPayload.bracket.competitionJudgeControl.status, "review_hold");
  assert.equal(reviewedSolo.eventPayload.bracket.mainBracket.rounds[0].matches[0].winner, null);
  const reopenedSolo = await eventAdmin.call("adminCompetitionDecision", {
    eventId: soloEventId,
    decision: "continue",
    expectedEntryKey: "main:0:0",
    expectedAttemptId: soloControl.attemptId,
  });
  assert.equal(reopenedSolo.changed, true);
  assert.equal(reopenedSolo.eventPayload.bracket.competitionJudgeControl.status, "voting");
  assert.deepEqual(reopenedSolo.eventPayload.bracket.competitionJudgeControl.votes, { j1: null, j2: null, j3: null });

  await expectCallableError(judges.j1.call("submitJudgeScorecard", {
    eventId: teamEventId,
    role: "j1",
    deviceId: "team-j1-device",
    submission: { side: "right", score: 8 },
    expectedEntryKey: "main:0:0",
  }), "aborted");
  for (const role of ["j1", "j2", "j3"]) {
    await judges[role].call("submitJudgeScorecard", {
      eventId: teamEventId,
      role,
      deviceId: `team-${role}-device`,
      submission: { side: "left", score: 8 },
      expectedEntryKey: "main:0:0",
    });
  }
  await expectCallableError(judges.j1.call("submitJudgeScorecard", {
    eventId: teamEventId,
    role: "j1",
    deviceId: "team-j1-device",
    submission: { side: "left", score: 9 },
    expectedEntryKey: "main:0:0",
  }), "aborted");
  await judges.j1.call("submitJudgeScorecard", {
    eventId: teamEventId, role: "j1", deviceId: "team-j1-device", submission: { side: "right", score: 7 }, expectedEntryKey: "main:0:0",
  });
  await judges.j2.call("submitJudgeScorecard", {
    eventId: teamEventId, role: "j2", deviceId: "team-j2-device", submission: { side: "right", score: 7 }, expectedEntryKey: "main:0:0",
  });
  const teamFinalRapidResults = await Promise.allSettled([
    judges.j3.call("submitJudgeScorecard", {
      eventId: teamEventId, role: "j3", deviceId: "team-j3-device", submission: { side: "right", score: 7 }, expectedEntryKey: "main:0:0",
    }),
    judges.j3.call("submitJudgeScorecard", {
      eventId: teamEventId, role: "j3", deviceId: "team-j3-device", submission: { side: "right", score: 9 }, expectedEntryKey: "main:0:0",
    }),
  ]);
  assert.equal(teamFinalRapidResults.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(teamFinalRapidResults.filter((result) => result.status === "rejected").length, 1);
  persisted = (await adminDb.doc(teamPath).get()).data();
  assert.equal(persisted.bracket.mainBracket.rounds[0].matches[0].winner.id, "team-left");
  assert.equal(persisted.bracket.competitionJudgeControl.status, "admin_decision");
  const teamControl = persisted.bracket.competitionJudgeControl;
  const continuedTeam = await eventAdmin.call("adminCompetitionDecision", {
    eventId: teamEventId,
    decision: "continue",
    expectedEntryKey: "main:0:0",
    expectedAttemptId: teamControl.attemptId,
  });
  assert.equal(continuedTeam.changed, true);
  assert.equal(continuedTeam.eventPayload.bracket.competitionJudgeControl.status, "idle");
  const firstContinueSyncStamp = continuedTeam.syncStamp;
  const duplicateTeamContinue = await eventAdmin.call("adminCompetitionDecision", {
    eventId: teamEventId,
    decision: "continue",
    expectedEntryKey: "main:0:0",
    expectedAttemptId: teamControl.attemptId,
  });
  assert.equal(duplicateTeamContinue.changed, false);
  assert.equal(duplicateTeamContinue.syncStamp, firstContinueSyncStamp);
  assert.equal(duplicateTeamContinue.eventPayload.bracket.mainBracket.rounds[0].matches[0].winner.id, "team-left");

  const locked = event(`battle-locked-${crypto.randomUUID()}`, "solo", driver("locked-left", 1), driver("locked-right", 2));
  locked.status = "completed";
  locked.results.completedAt = new Date().toISOString();
  await adminDb.doc(soloPath).set({ status: "completed", results: locked.results }, { merge: true });
  await expectCallableError(judges.j1.call("submitJudgeVote", {
    eventId: soloEventId,
    role: "j1",
    deviceId: "solo-j1-device",
    side: "left",
    expectedEntryKey: "main:0:0",
  }), "failed-precondition");

  console.log("battle callable authorization integration tests passed");
} finally {
  await Promise.all(clients.map((entry) => deleteApp(entry.app).catch(() => {})));
  await Promise.all([
    adminDb.doc(soloPath).delete().catch(() => {}),
    adminDb.doc(teamPath).delete().catch(() => {}),
  ]);
  await deleteAdminApp(adminApp);
}
