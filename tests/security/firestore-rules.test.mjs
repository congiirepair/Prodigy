import assert from "node:assert/strict";
import fs from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from "firebase/firestore";

const projectId = "prodigy-rules-test";
const rules = fs.readFileSync("firestore.rules", "utf8");
const appId = "prodigy-test";
const prodLikeAppId = "prodigy-rc-competitions";
const basePath = `artifacts/${appId}/public/data`;
const prodLikeTestBasePath = `artifacts/${prodLikeAppId}/public/testData`;
const testBasePath = `artifacts/${appId}/public/testData`;
const eventPath = `${basePath}/events/main-event`;
const closedEventPath = `${basePath}/events/closed-event`;
const configPath = `${eventPath}/private/config`;
const registrationPath = `${eventPath}/registrations/reg-1`;
const registrationIndexPath = `${eventPath}/publicRegistrationIndex/reg-1`;
const closedRegistrationPath = `${closedEventPath}/registrations/reg-closed`;
const driverPath = `${eventPath}/drivers/driver-1`;
const runPath = `${eventPath}/qualifyingRuns/driver-1_run1`;
const judge1SubmissionPath = `${eventPath}/judgeSubmissions/driver-1_run1_j1`;
const judge2SubmissionPath = `${eventPath}/judgeSubmissions/driver-1_run1_j2`;
const battleVoteJ1Path = `${eventPath}/battleVotes/battle-1_j1`;
const bracketPath = `${eventPath}/brackets/main`;
const aggregatePath = `${eventPath}/publicAggregates/qualifyingStandings`;
const directoryPath = `${basePath}/meta/eventDirectory`;
const activeSelectionPath = `${basePath}/meta/activeEventSelection`;
const archivePath = `${basePath}/meta/resultsArchive`;
const streamPath = `${basePath}/liveStreams/main-event`;
const demoPath = `${basePath}/demoEvents/demo-session`;
const testDataEventPath = `${testBasePath}/events/main-event`;
const prodLikeTestDataEventPath = `${prodLikeTestBasePath}/events/main-event`;
const tech1EventId = "tech1drift-anniversary-may-30";
const tech1Path = `${basePath}/specialEvents/${tech1EventId}`;
const tech1RegistrationPath = `${tech1Path}/registrations/tech1-reg-1`;
const tech1PublicIndexPath = `${tech1Path}/publicRegistrationIndex/tech1-reg-1`;
const tech1RafflePath = `${tech1Path}/raffleTransactions/raffle-1`;
const tech1BracketPath = `${tech1Path}/brackets/main`;

const openEventShell = {
  id: "main-event",
  name: "Main Event",
  date: "2026-01-01",
  status: "active",
  schemaVersion: 2,
  judgeCount: 1,
  judgingMode: "average",
  competitionMode: "solo",
  registrationStatus: "open",
  liveStatus: "waiting",
  publicFlags: { registrationEnabled: true },
  updatedAt: "2026-01-01T00:00:00.000Z",
  syncStamp: 1,
};

const closedEventShell = {
  ...openEventShell,
  id: "closed-event",
  registrationStatus: "closed",
};

const tech1Shell = {
  title: "Tech 1 Drift Anniversary Competition",
  date: "2026-05-30",
  dateLabel: "May 30",
  mode: "tech1-anniversary",
  legacySpecialEventMode: "tech1drift-anniversary",
  competitionType: "random-single-elimination",
  competitionMode: "tech1-anniversary",
  branding: { name: "Tech 1 Drift" },
  registrationOpen: true,
  registrationEnabled: true,
  raffleEnabled: true,
  raffleTicketPrice: 5,
  freeTicketsPerRegistration: 1,
  bracketGeneration: "randomized-from-competing-drivers",
  bracketStatus: "not_generated",
  expectedDrivers: 60,
  qualifyingEnabled: false,
  updatedAt: "2026-05-30T00:00:00.000Z",
};

const testEnv = await initializeTestEnvironment({
  projectId,
  firestore: {
    host: "127.0.0.1",
    port: 8080,
    rules,
  },
});

async function seedData() {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, eventPath), openEventShell),
      setDoc(doc(db, closedEventPath), closedEventShell),
      setDoc(doc(db, configPath), {
        eventId: "main-event",
        schemaVersion: 2,
        roleAccess: {},
        venueConfig: {},
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
      setDoc(doc(db, registrationPath), registrationDoc()),
      setDoc(doc(db, registrationIndexPath), registrationIndexDoc()),
      setDoc(doc(db, judge2SubmissionPath), judgeSubmission("j2", 88)),
      setDoc(doc(db, directoryPath), { events: { "main-event": { id: "main-event", name: "Main Event" } }, activeEventId: "main-event", deletedEventIds: [], syncStamp: 1 }),
      setDoc(doc(db, activeSelectionPath), { activeEventId: "main-event", eventMeta: { id: "main-event", name: "Main Event" }, syncStamp: 1 }),
      setDoc(doc(db, archivePath), { events: {}, syncStamp: 1 }),
      setDoc(doc(db, tech1Path), tech1Shell),
    ]);
  });
}

function unauthDb() {
  return testEnv.unauthenticatedContext().firestore();
}

function anonDb(uid = "anon-driver", token = {}) {
  return testEnv.authenticatedContext(uid, token).firestore();
}

function roleDb(uid, token) {
  return testEnv.authenticatedContext(uid, token).firestore();
}

function ownerDb() {
  return roleDb("owner-1", { role: "owner", roles: ["owner"] });
}

function adminDb() {
  return roleDb("admin-1", { role: "eventAdmin", roles: ["eventAdmin"] });
}

function eventAdminDb(eventId = "main-event") {
  return roleDb(`admin-${eventId}`, { eventRoles: { [eventId]: ["eventAdmin"] } });
}

function eventJudgeDb(slot = "j1", eventId = "main-event") {
  return roleDb(`${slot}-${eventId}`, { eventRoles: { [eventId]: [slot] } });
}

function eventStreamDb(eventId = "main-event") {
  return roleDb(`stream-${eventId}`, { eventRoles: { [eventId]: ["streamOperator"] } });
}

function judgeDb(slot = "j1") {
  return roleDb(`${slot}-uid`, { role: slot, roles: ["judge", slot] });
}

function streamDb() {
  return roleDb("stream-1", { role: "streamOperator", roles: ["streamOperator"] });
}

function registrationDoc(overrides = {}) {
  return {
    id: "reg-1",
    eventId: "main-event",
    schemaVersion: 2,
    status: "pending",
    name: "Driver One",
    driverNumber: "7",
    teamName: "",
    chassis: "RDX",
    deviceToken: "device-1",
    ownerUid: "anon-driver",
    selfRegisteredAt: "2026-01-01T00:01:00.000Z",
    arrivedAt: null,
    checkedInAt: null,
    arrivalSource: null,
    approvalRequired: true,
    paidAt: null,
    selfRegisteredDistanceMeters: null,
    checkedInDistanceMeters: null,
    needsReviewAt: null,
    reviewReason: null,
    rejectedAt: null,
    rejectedReason: null,
    updatedAt: "2026-01-01T00:01:00.000Z",
    ...overrides,
  };
}

function registrationIndexDoc(overrides = {}) {
  return {
    publicId: "reg-1",
    registrationId: "reg-1",
    eventId: "main-event",
    schemaVersion: 2,
    displayName: "Driver One",
    driverNumber: "7",
    teamName: "",
    chassis: "RDX",
    teamRegistrationId: "",
    teamMemberOrder: null,
    teamMemberCount: null,
    status: "pending",
    checkedIn: false,
    updatedAt: "2026-01-01T00:01:00.000Z",
    ...overrides,
  };
}

function judgeSubmission(slot = "j1", score = 96, overrides = {}) {
  return {
    eventId: "main-event",
    runId: "driver-1_run1",
    driverId: "driver-1",
    runKey: "run1",
    judgeSlot: slot,
    score,
    submittedScore: score,
    schemaVersion: 2,
    submittedAt: "2026-01-01T00:02:00.000Z",
    updatedAt: "2026-01-01T00:02:00.000Z",
    ...overrides,
  };
}

function battleVote(slot = "j1", side = "left", overrides = {}) {
  return {
    eventId: "main-event",
    battleId: "battle-1",
    judgeSlot: slot,
    side,
    scorecard: null,
    cycle: 1,
    schemaVersion: 2,
    submittedAt: "2026-01-01T00:03:00.000Z",
    updatedAt: "2026-01-01T00:03:00.000Z",
    ...overrides,
  };
}

function tech1RegistrationDoc(overrides = {}) {
  return {
    id: "tech1-reg-1",
    eventId: tech1EventId,
    mode: "tech1-anniversary",
    name: "Tech Driver",
    teamName: "Tech Team",
    chassis: "RDX",
    instagram: "@techdriver",
    checkedIn: false,
    bracketEligible: false,
    tech1Driver: false,
    entryFee: 40,
    bracketSeed: null,
    freeTickets: 1,
    paidTickets: 0,
    totalTickets: 1,
    amountPaid: 0,
    paymentStatus: "free-only",
    paymentMethod: "",
    staffNotes: "",
    ownerUid: "tech-driver",
    createdAt: "2026-05-30T00:01:00.000Z",
    updatedAt: "2026-05-30T00:01:00.000Z",
    ...overrides,
  };
}

function tech1PublicIndexDoc(overrides = {}) {
  return {
    publicId: "tech1-reg-1",
    registrationId: "tech1-reg-1",
    eventId: tech1EventId,
    mode: "tech1-anniversary",
    displayName: "Tech Driver",
    teamName: "Tech Team",
    chassis: "RDX",
    instagram: "@techdriver",
    checkedIn: false,
    bracketEligible: false,
    bracketSeed: null,
    publicStatus: "registered",
    createdAt: "2026-05-30T00:01:00.000Z",
    updatedAt: "2026-05-30T00:01:00.000Z",
    ...overrides,
  };
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("unauthenticated spectator can read public event summary", async () => {
  await assertSucceeds(getDoc(doc(unauthDb(), eventPath)));
});

test("unauthenticated spectator cannot write event summary", async () => {
  await assertFails(setDoc(doc(unauthDb(), eventPath), openEventShell));
});

test("anonymous driver can create pending registration when registration is open", async () => {
  await assertSucceeds(setDoc(doc(anonDb("driver-2"), `${eventPath}/registrations/reg-2`), registrationDoc({ id: "reg-2", deviceToken: "device-2", ownerUid: "driver-2" })));
  await assertSucceeds(setDoc(doc(anonDb("driver-2"), `${eventPath}/publicRegistrationIndex/reg-2`), registrationIndexDoc({ publicId: "reg-2", registrationId: "reg-2" })));
});

test("anonymous driver cannot create registration when registration is closed", async () => {
  await assertFails(setDoc(doc(anonDb("driver-closed"), closedRegistrationPath), {
    ...registrationDoc({ id: "reg-closed", eventId: "closed-event", deviceToken: "device-closed", ownerUid: "driver-closed" }),
  }));
  await assertFails(setDoc(doc(anonDb("driver-closed"), `${closedEventPath}/publicRegistrationIndex/reg-closed`), {
    ...registrationIndexDoc({ publicId: "reg-closed", registrationId: "reg-closed", eventId: "closed-event" }),
  }));
});

test("public can read only safe registration index, not full registration details", async () => {
  await assertSucceeds(getDoc(doc(unauthDb(), registrationIndexPath)));
  await assertFails(getDoc(doc(unauthDb(), registrationPath)));
});

test("anonymous driver cannot approve themselves", async () => {
  await assertFails(setDoc(doc(anonDb(), `${eventPath}/registrations/reg-3`), registrationDoc({
    id: "reg-3",
    status: "approved",
    approvedAt: "2026-01-01T00:04:00.000Z",
    approvedDriverIds: ["driver-3"],
  })));
});

test("anonymous driver cannot write checked-in status unless validated", async () => {
  await assertSucceeds(updateDoc(doc(anonDb(), registrationPath), {
    ...registrationDoc({ status: "checkedIn", checkedInAt: "2026-01-01T00:05:00.000Z", arrivalSource: "qr" }),
  }));
  await assertFails(updateDoc(doc(anonDb(), registrationPath), {
    ...registrationDoc({ status: "checkedIn", deviceToken: "other-device", checkedInAt: "2026-01-01T00:05:00.000Z" }),
  }));
});

test("anonymous driver cannot write judge submission", async () => {
  await assertFails(setDoc(doc(anonDb(), judge1SubmissionPath), judgeSubmission("j1")));
});

test("judge1 can write judge1 qualifying submission", async () => {
  await assertSucceeds(setDoc(doc(judgeDb("j1"), judge1SubmissionPath), judgeSubmission("j1")));
});

test("event-scoped judge1 claim can write only judge1 qualifying submission", async () => {
  await assertSucceeds(setDoc(doc(eventJudgeDb("j1"), judge1SubmissionPath), judgeSubmission("j1")));
  await assertFails(setDoc(doc(eventJudgeDb("j1"), judge2SubmissionPath), judgeSubmission("j2")));
  await assertFails(setDoc(doc(eventJudgeDb("j1", "other-event"), judge1SubmissionPath), judgeSubmission("j1")));
});

test("judge1 cannot write judge2 qualifying submission", async () => {
  await assertFails(setDoc(doc(judgeDb("j1"), judge2SubmissionPath), judgeSubmission("j2")));
});

test("judge cannot edit another judge's existing score", async () => {
  await assertFails(updateDoc(doc(judgeDb("j1"), judge2SubmissionPath), judgeSubmission("j2", 91)));
});

test("judge cannot write bracket advancement", async () => {
  await assertFails(setDoc(doc(judgeDb("j1"), bracketPath), { eventId: "main-event", state: {}, schemaVersion: 2, updatedAt: "now" }));
});

test("judge cannot write event config", async () => {
  await assertFails(setDoc(doc(judgeDb("j1"), configPath), { eventId: "main-event", roleAccess: {}, schemaVersion: 2 }));
});

test("stream operator can write stream status and layout fields", async () => {
  await assertSucceeds(setDoc(doc(streamDb(), streamPath), {
    active: true,
    eventId: "main-event",
    sessionId: "session-1",
    layoutKey: "battle",
    phaseLabel: "Battle",
    eventName: "Main Event",
    transportMode: "webrtc-p2p",
    audioMuted: false,
    cameraEnabled: true,
    hasVideoTrack: true,
    hasAudioTrack: true,
    startedAt: 1,
    heartbeatAt: 2,
    updatedAt: 3,
  }));
});

test("event-scoped stream operator can write only matching stream state", async () => {
  await assertSucceeds(setDoc(doc(eventStreamDb(), streamPath), {
    active: true,
    eventId: "main-event",
    sessionId: "session-2",
    layoutKey: "qualifying",
    phaseLabel: "Qualifying",
    eventName: "Main Event",
    transportMode: "webrtc-p2p",
    audioMuted: false,
    cameraEnabled: true,
    hasVideoTrack: true,
    hasAudioTrack: true,
    startedAt: 1,
    heartbeatAt: 2,
    updatedAt: 3,
  }));
  await assertFails(setDoc(doc(eventStreamDb("other-event"), streamPath), {
    active: true,
    eventId: "main-event",
    sessionId: "session-3",
    layoutKey: "qualifying",
    updatedAt: 4,
  }));
});

test("stream operator cannot write scores", async () => {
  await assertFails(setDoc(doc(streamDb(), judge1SubmissionPath), judgeSubmission("j1")));
});

test("stream operator cannot write event config", async () => {
  await assertFails(setDoc(doc(streamDb(), configPath), { eventId: "main-event", schemaVersion: 2 }));
});

test("event admin can approve registration", async () => {
  await assertSucceeds(updateDoc(doc(adminDb(), registrationPath), {
    ...registrationDoc({
      status: "approved",
      paidAt: "2026-01-01T00:06:00.000Z",
      approvedAt: "2026-01-01T00:06:00.000Z",
      approvedDriverIds: ["driver-1"],
    }),
  }));
});

test("event admin can write bracket state", async () => {
  await assertSucceeds(setDoc(doc(adminDb(), bracketPath), { eventId: "main-event", schemaVersion: 2, state: { mainBracket: { rounds: [] } }, updatedAt: "2026-01-01T00:07:00.000Z" }));
});

test("event-scoped admin claim can manage only its event", async () => {
  await assertSucceeds(setDoc(doc(eventAdminDb(), bracketPath), { eventId: "main-event", schemaVersion: 2, state: { mainBracket: { rounds: [] } }, updatedAt: "2026-01-01T00:07:00.000Z" }));
  await assertFails(setDoc(doc(eventAdminDb("other-event"), bracketPath), { eventId: "main-event", schemaVersion: 2, state: {}, updatedAt: "2026-01-01T00:07:00.000Z" }));
});

test("event admin can publish public aggregates", async () => {
  await assertSucceeds(setDoc(doc(adminDb(), aggregatePath), { eventId: "main-event", schemaVersion: 2, standings: [], updatedAt: "2026-01-01T00:08:00.000Z" }));
});

test("non-admin cannot publish public aggregates", async () => {
  await assertFails(setDoc(doc(anonDb(), aggregatePath), { eventId: "main-event", schemaVersion: 2, standings: [], updatedAt: "2026-01-01T00:08:00.000Z" }));
  await assertFails(setDoc(doc(judgeDb("j1"), aggregatePath), { eventId: "main-event", schemaVersion: 2, standings: [], updatedAt: "2026-01-01T00:08:00.000Z" }));
  await assertFails(setDoc(doc(streamDb(), aggregatePath), { eventId: "main-event", schemaVersion: 2, standings: [], updatedAt: "2026-01-01T00:08:00.000Z" }));
});

test("website owner can write activeEventSelection", async () => {
  await assertSucceeds(setDoc(doc(ownerDb(), activeSelectionPath), { activeEventId: "main-event", eventMeta: { id: "main-event" }, syncStamp: 2 }));
});

test("normal anonymous user cannot write activeEventSelection", async () => {
  await assertFails(setDoc(doc(anonDb(), activeSelectionPath), { activeEventId: "main-event", eventMeta: { id: "main-event" }, syncStamp: 2 }));
  await assertFails(setDoc(doc(roleDb("plain-user", { roles: ["driver"] }), activeSelectionPath), { activeEventId: "main-event", eventMeta: { id: "main-event" }, syncStamp: 2 }));
});

test("demoRole and demoScenario-style claims do not grant production writes", async () => {
  const demoDb = anonDb("demo-user", { demoRole: "admin", demoScenario: "bracket" });
  await assertFails(setDoc(doc(demoDb, bracketPath), { eventId: "main-event", schemaVersion: 2, state: {}, updatedAt: "now" }));
});

test("demo events remain isolated from production events", async () => {
  const demoDb = anonDb("demo-user", { demoRole: "admin", demoScenario: "bracket" });
  await assertSucceeds(setDoc(doc(demoDb, demoPath), { id: "demo-session", syncStamp: 1 }));
  await assertFails(setDoc(doc(demoDb, eventPath), { ...openEventShell, name: "Demo Owned" }));
});

test("testData broadness is restricted to test app ids or owners", async () => {
  await assertSucceeds(setDoc(doc(anonDb("qa-user"), testDataEventPath), { id: "main-event", qa: true }));
  await assertFails(setDoc(doc(anonDb("qa-user"), prodLikeTestDataEventPath), { id: "main-event", qa: true }));
  await assertSucceeds(setDoc(doc(ownerDb(), prodLikeTestDataEventPath), { id: "main-event", qa: true }));
});

test("legacy monolithic event writes are deprecated and blocked for non-admins", async () => {
  await assertFails(updateDoc(doc(judgeDb("j1"), eventPath), {
    drivers: [{ id: "driver-1", scores: { j1: { run1: 100 } } }],
  }));
  await assertFails(updateDoc(doc(anonDb(), eventPath), {
    pendingRegistrations: [registrationDoc()],
  }));
});

test("archive and results writes require admin or owner permission", async () => {
  await assertFails(setDoc(doc(anonDb(), archivePath), { events: { "main-event": {} }, syncStamp: 9 }));
  await assertSucceeds(setDoc(doc(adminDb(), archivePath), { events: { "main-event": {} }, syncStamp: 9 }));
});

test("event admin can write the v2 public shell but not add private fields to it", async () => {
  await assertSucceeds(setDoc(doc(adminDb(), eventPath), { ...openEventShell, syncStamp: 3 }));
  await assertFails(setDoc(doc(adminDb(), eventPath), { ...openEventShell, roleAccess: {} }));
});

test("event admin can manage approved driver docs", async () => {
  await assertSucceeds(setDoc(doc(adminDb(), driverPath), {
    id: "driver-1",
    eventId: "main-event",
    schemaVersion: 2,
    name: "Driver One",
    status: "approved",
    updatedAt: "2026-01-01T00:10:00.000Z",
  }));
});

test("event admin can manage qualifying run metadata", async () => {
  await assertSucceeds(setDoc(doc(adminDb(), runPath), {
    eventId: "main-event",
    runId: "driver-1_run1",
    driverId: "driver-1",
    runKey: "run1",
    schemaVersion: 2,
    status: "scoring",
    updatedAt: "2026-01-01T00:11:00.000Z",
  }));
});

test("live viewer signaling remains available to signed-in anonymous viewers", async () => {
  const viewerPath = `${basePath}/liveStreams/main-event/sessions/session-1/viewers/viewer-1`;
  await assertSucceeds(setDoc(doc(anonDb("viewer-1"), viewerPath), {
    status: "requesting",
    eventId: "main-event",
    sessionId: "session-1",
    createdAt: 1,
    updatedAt: 2,
  }));
  await assertSucceeds(deleteDoc(doc(anonDb("viewer-1"), viewerPath)));
});

test("Tech 1 public can read shell and public registration index only", async () => {
  await assertSucceeds(getDoc(doc(unauthDb(), tech1Path)));
  await assertSucceeds(getDoc(doc(unauthDb(), tech1PublicIndexPath)));
  await assertFails(getDoc(doc(unauthDb(), tech1RegistrationPath)));
  await assertFails(getDoc(doc(unauthDb(), tech1RafflePath)));
});

test("Tech 1 event shell accepts the legacy special-event mode for existing data", async () => {
  await assertSucceeds(setDoc(doc(eventAdminDb(tech1EventId), tech1Path), {
    ...tech1Shell,
    mode: "tech1drift-anniversary",
    competitionMode: "tech1-anniversary",
  }));
});

test("Tech 1 anonymous driver can self-register with only the free raffle ticket", async () => {
  await assertSucceeds(setDoc(doc(anonDb("tech-driver"), tech1RegistrationPath), tech1RegistrationDoc()));
  await assertSucceeds(setDoc(doc(anonDb("tech-driver"), tech1PublicIndexPath), tech1PublicIndexDoc()));
  await assertFails(setDoc(doc(anonDb("tech-driver-2"), `${tech1Path}/registrations/tech1-reg-2`), tech1RegistrationDoc({
    id: "tech1-reg-2",
    ownerUid: "tech-driver-2",
    paidTickets: 5,
    totalTickets: 6,
    amountPaid: 25,
    paymentStatus: "paid",
  })));
});

test("Tech 1 public user cannot self-check-in or alter public bracket eligibility", async () => {
  await assertFails(setDoc(doc(anonDb("tech-driver"), `${tech1Path}/publicRegistrationIndex/tech1-reg-self-check`), tech1PublicIndexDoc({
    publicId: "tech1-reg-self-check",
    registrationId: "tech1-reg-self-check",
    checkedIn: true,
    bracketEligible: true,
    bracketSeed: 1,
    publicStatus: "checked-in",
  })));
});

test("Tech 1 public user cannot write bracket or battle winner data", async () => {
  await assertFails(setDoc(doc(anonDb("tech-driver"), tech1BracketPath), {
    status: "generated",
    generatedAt: "2026-05-30T00:03:00.000Z",
    lockedAt: null,
    driverCount: 2,
    bracketSize: 2,
    source: "bracketEligible",
    rounds: [],
    matches: {},
    randomizedSeedOrder: [],
    byes: [],
    createdBy: "public",
    updatedAt: "2026-05-30T00:03:00.000Z",
  }));
  await assertFails(setDoc(doc(anonDb("tech-driver"), `${tech1Path}/battleResults/r1m1`), {
    matchId: "r1m1",
    eventId: tech1EventId,
    round: 1,
    matchNumber: 1,
    driverA: { id: "driver-a" },
    driverB: { id: "driver-b" },
    winnerId: "driver-a",
    winnerName: "Driver A",
    resultStatus: "complete",
    notes: "",
    advancedToMatchId: null,
    updatedBy: "public",
    updatedAt: "2026-05-30T00:04:00.000Z",
  }));
});

test("Tech 1 event admin can manage raffle tickets and bracket", async () => {
  const admin = eventAdminDb(tech1EventId);
  await assertSucceeds(setDoc(doc(admin, tech1RegistrationPath), tech1RegistrationDoc({
    checkedIn: true,
    bracketEligible: true,
    paidTickets: 3,
    totalTickets: 4,
    amountPaid: 15,
    paymentStatus: "paid",
    paymentMethod: "cash",
  })));
  await assertSucceeds(setDoc(doc(admin, tech1RafflePath), {
    id: "raffle-1",
    eventId: tech1EventId,
    registrationId: "tech1-reg-1",
    paidTicketsAdded: 3,
    amountPaid: 15,
    paymentMethod: "cash",
    confirmedBy: "staff",
    createdAt: "2026-05-30T00:02:00.000Z",
  }));
  await assertSucceeds(setDoc(doc(admin, tech1BracketPath), {
    status: "generated",
    generatedAt: "2026-05-30T00:03:00.000Z",
    lockedAt: null,
    winnerRevealStatus: "hidden",
    winnerRevealedAt: null,
    winnerRevealUpdatedBy: "",
    driverCount: 60,
    bracketSize: 64,
    source: "bracketEligible",
    rounds: [],
    matches: {},
    randomizedSeedOrder: [],
    byes: [],
    createdBy: "staff",
    updatedAt: "2026-05-30T00:03:00.000Z",
  }));
  await assertSucceeds(updateDoc(doc(admin, tech1BracketPath), {
    winnerRevealStatus: "revealed",
    winnerRevealedAt: "2026-05-30T00:05:00.000Z",
    winnerRevealUpdatedBy: "staff",
    updatedAt: "2026-05-30T00:05:00.000Z",
  }));
});

test("Tech 1 judge and stream roles cannot manage raffle or bracket data", async () => {
  await assertFails(setDoc(doc(eventJudgeDb("j1", tech1EventId), tech1RafflePath), {
    id: "raffle-1",
    eventId: tech1EventId,
    registrationId: "tech1-reg-1",
    paidTicketsAdded: 1,
    amountPaid: 5,
    paymentMethod: "cash",
    confirmedBy: "judge",
    createdAt: "2026-05-30T00:04:00.000Z",
  }));
  await assertFails(setDoc(doc(eventStreamDb(tech1EventId), tech1BracketPath), {
    status: "generated",
    generatedAt: "2026-05-30T00:03:00.000Z",
    lockedAt: null,
    driverCount: 2,
    bracketSize: 2,
    source: "bracketEligible",
    rounds: [],
    matches: {},
    randomizedSeedOrder: [],
    byes: [],
    createdBy: "stream",
    updatedAt: "2026-05-30T00:03:00.000Z",
  }));
});

await seedData();
let failures = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`not ok - ${name}`);
    console.error(error);
  }
}

await testEnv.cleanup();
assert.equal(failures, 0, `${failures} Firestore rules test(s) failed`);
console.log(`${tests.length} Firestore rules tests passed`);
