"use strict";

const crypto = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const {
  activeJudgeRoles,
  clampJudgeScore,
  clone,
  continueDecision,
  recordScorecard,
  recordVote,
  reviewDecision,
} = require("./competition");
const {
  emailEventResultsSummary,
  parseVoiceDeductions,
} = require("./legacy-http");
const {
  buildRound3RepairVerification,
  HISTORICAL_BRACKET_UNAVAILABLE,
  ROUND3_EVENT_ID,
  bracketHash,
  collectRound3BracketDiagnostics,
  inspectRound3SyntheticBracket,
  repairFingerprintMatches,
} = require("./historical-bracket");

initializeApp();

const db = getFirestore();
const adminAuth = getAuth();
const websiteAdminPassword = defineSecret("WEBSITE_ADMIN_PASSWORD");
const PRODIGY_APP_ID = "1:292850527697:web:6b9cb5249f2716e42e44f0";
const ROLE_NAMES = ["admin", "j1", "j2", "j3", "streamOperator"];
const JUDGE_ROLES = ["j1", "j2", "j3"];
const AUTH_FAILURE_LIMIT = 5;
const AUTH_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const AUTH_BLOCK_MS = 15 * 60 * 1000;
const OWNER_SESSION_MS = 8 * 60 * 60 * 1000;
const MAX_EVENT_BYTES = 900 * 1024;
const MAX_CUSTOM_CLAIMS_BYTES = 900;

function fail(code, message, details) {
  throw new HttpsError(code, message, details);
}

function requireAuth(request) {
  if (!request.auth?.uid) fail("unauthenticated", "Sign in before using this operation.");
  return request.auth;
}

function requireAppId(value) {
  const appId = String(value || "").trim();
  if (appId !== PRODIGY_APP_ID) fail("permission-denied", "This app identifier is not authorized.");
  return appId;
}

function requireEventId(value) {
  const eventId = String(value || "").trim();
  if (!eventId || eventId.length > 180 || eventId.includes("/")) fail("invalid-argument", "A valid event is required.");
  return eventId;
}

function normalizeRole(value) {
  const role = String(value || "").trim();
  if (role === "eventAdmin") return "admin";
  if (role === "stream" || role === "streamer") return "streamOperator";
  return ROLE_NAMES.includes(role) ? role : "";
}

function isOwnerToken(token = {}) {
  return (token.owner === true || token.websiteAdmin === true)
    && Number(token.ownerExpiresAt || 0) > Date.now();
}

function scopedRoles(token = {}, eventId) {
  const roles = token.eventRoles?.[eventId];
  return new Set(Array.isArray(roles) ? roles.map(normalizeRole).filter(Boolean) : []);
}

function hasEventRole(token, eventId, role) {
  const normalized = normalizeRole(role);
  if (isOwnerToken(token)) return true;
  const scoped = scopedRoles(token, eventId);
  return normalized === "streamOperator"
    ? scoped.has("streamOperator") || scoped.has("admin")
    : scoped.has(normalized);
}

function requireOwner(request) {
  const auth = requireAuth(request);
  if (!isOwnerToken(auth.token)) fail("permission-denied", "Website administrator access is required.");
  return auth;
}

function requireEventAdmin(request, eventId) {
  const auth = requireAuth(request);
  if (!hasEventRole(auth.token, eventId, "admin")) fail("permission-denied", "Event administrator access is required for this event.");
  return auth;
}

function requireJudge(request, eventId, role) {
  const auth = requireAuth(request);
  const normalized = normalizeRole(role);
  if (!JUDGE_ROLES.includes(normalized) || !hasEventRole(auth.token, eventId, normalized)) {
    fail("permission-denied", "The signed-in judge is not assigned to this event role.");
  }
  return { auth, role: normalized };
}

function eventRef(appId, eventId) {
  return db.doc(`artifacts/${appId}/public/data/events/${eventId}`);
}

function directoryRef(appId) {
  return db.doc(`artifacts/${appId}/public/data/meta/eventDirectory`);
}

function selectionRef(appId) {
  return db.doc(`artifacts/${appId}/public/data/meta/activeEventSelection`);
}

function archiveRef(appId) {
  return db.doc(`artifacts/${appId}/public/data/meta/resultsArchive`);
}

function accessRef(appId, eventId) {
  return db.doc(`artifacts/${appId}/private/eventAccess/events/${eventId}`);
}

function authAttemptRef(appId, clientKey, key) {
  const digest = crypto.createHash("sha256").update(`${clientKey}:${String(key || "")}`).digest("hex");
  return db.doc(`artifacts/${appId}/private/authAttempts/clients/${digest}`);
}

function registrationDeviceRef(appId, deviceToken) {
  const digest = crypto.createHash("sha256").update(String(deviceToken || "")).digest("hex");
  return db.doc(`artifacts/${appId}/private/registrationDevices/tokens/${digest}`);
}

function requireRegistrationDeviceToken(value) {
  const deviceToken = safeText(value, 180);
  // Older production clients generated nine-character device IDs. Keep those
  // registrations usable while newer clients move to stronger UUID tokens.
  if (deviceToken.length < 8) fail("invalid-argument", "A valid registration device token is required.");
  return deviceToken;
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "").trim()).digest("hex");
}

function createRolePasswordCredential(value) {
  const salt = crypto.randomBytes(16).toString("base64");
  return {
    algorithm: "scrypt-v1",
    salt,
    passwordHash: crypto.scryptSync(String(value || "").trim(), salt, 64, { maxmem: 64 * 1024 * 1024 }).toString("base64"),
    updatedAt: new Date().toISOString(),
  };
}

function rolePasswordMatches(value, credential = {}) {
  if (!credential?.passwordHash) return false;
  if (credential.algorithm === "scrypt-v1" && credential.salt) {
    const candidate = crypto.scryptSync(String(value || "").trim(), credential.salt, 64, { maxmem: 64 * 1024 * 1024 }).toString("base64");
    return safeEqual(candidate, credential.passwordHash);
  }
  return safeEqual(sha256(value), credential.passwordHash);
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function cleanObject(value) {
  if (Array.isArray(value)) return value.map(cleanObject).filter((entry) => entry !== undefined);
  if (!value || typeof value !== "object") return value;
  const result = {};
  Object.entries(value).forEach(([key, entry]) => {
    if (entry !== undefined) result[key] = cleanObject(entry);
  });
  return result;
}

function publicRoleAccess(roleAccess = {}, privateRoles = {}) {
  const result = {};
  ["admin", "j1", "j2", "j3"].forEach((role) => {
    const entry = roleAccess?.[role] || {};
    result[role] = {
      passwordConfigured: Boolean(privateRoles?.[role]?.passwordHash || entry.passwordConfigured || entry.passwordHash),
      claimedAt: entry.claimedAt || privateRoles?.[role]?.updatedAt || null,
      accessVersion: privateRoles?.[role]?.accessVersion || entry.accessVersion || null,
    };
  });
  return result;
}

function sanitizePublicEvent(payload, remote = {}) {
  const candidate = cleanObject(clone(payload || {}));
  // Authorization metadata is server-owned. Generic event snapshot saves must
  // never rotate role versions or restore stale role state supplied by a client.
  candidate.roleAccess = publicRoleAccess(remote.roleAccess || {});
  candidate.judgeRoleClaims = clone(remote.judgeRoleClaims || candidate.judgeRoleClaims || {});
  return candidate;
}

function sanitizeEventMeta(meta, eventPayload) {
  const candidate = cleanObject(clone(meta || {}));
  ["drivers", "bracket", "twinComp", "qualifyingFlow", "formatMode", "lowerCount"].forEach((key) => delete candidate[key]);
  candidate.id = eventPayload.id;
  candidate.roleAccess = publicRoleAccess(eventPayload.roleAccess);
  candidate.judgeRoleClaims = clone(eventPayload.judgeRoleClaims || {});
  return candidate;
}

function historicalBracketRepairAuditRef(appId, eventId) {
  return db.doc(`artifacts/${appId}/private/historicalBracketRepairs/events/${eventId}`);
}

function activeSelectionPayload(eventId, eventData, syncStamp) {
  const selectionEvent = { ...(eventData || {}), id: eventId, syncStamp };
  return {
    activeEventId: eventId,
    eventMeta: sanitizeEventMeta(selectionEvent, selectionEvent),
    syncStamp,
  };
}

function assertEventSize(payload) {
  const bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
  if (bytes > MAX_EVENT_BYTES) fail("invalid-argument", "The event state is too large to save safely.");
}

function eventLocked(eventData = {}) {
  const status = String(eventData.status || "active").toLowerCase();
  return status === "completed" || status === "archived" || Boolean(eventData.results?.completedAt);
}

function nextServerSyncStamp(...previousValues) {
  const previous = Math.max(0, ...previousValues.map(Number).filter(Number.isFinite));
  return Math.max(Date.now(), previous + 1);
}

async function checkAuthRateLimit(appId, request, key) {
  const uid = requireAuth(request).uid;
  const ip = String(request.rawRequest?.ip || request.rawRequest?.socket?.remoteAddress || "unknown");
  const refs = [...new Map([
    authAttemptRef(appId, `uid:${uid}`, key),
    authAttemptRef(appId, `ip:${ip}`, key),
  ].map((ref) => [ref.path, ref])).values()];
  const snapshots = await Promise.all(refs.map((ref) => ref.get()));
  const now = Date.now();
  if (snapshots.some((snap) => Number(snap.data()?.blockedUntil || 0) > now)) {
    fail("resource-exhausted", "Too many unsuccessful attempts. Wait before trying again.");
  }
  return refs;
}

async function recordAuthFailure(refs) {
  await Promise.all(refs.map((ref) => db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const now = Date.now();
    const previous = snap.data() || {};
    const withinWindow = now - Number(previous.windowStartedAt || 0) < AUTH_FAILURE_WINDOW_MS;
    const failures = withinWindow ? Number(previous.failures || 0) + 1 : 1;
    transaction.set(ref, {
      failures,
      windowStartedAt: withinWindow ? Number(previous.windowStartedAt || now) : now,
      blockedUntil: failures >= AUTH_FAILURE_LIMIT ? now + AUTH_BLOCK_MS : 0,
      updatedAt: now,
    });
  })));
}

async function clearAuthFailures(refs) {
  await Promise.all(refs.map((ref) => ref.delete().catch(() => {})));
}

async function replaceCustomClaims(uid, transform) {
  const user = await adminAuth.getUser(uid);
  const current = { ...(user.customClaims || {}) };
  const next = transform(current) || current;
  if (Buffer.byteLength(JSON.stringify(next), "utf8") > MAX_CUSTOM_CLAIMS_BYTES) {
    fail("resource-exhausted", "Too many event-role assignments are active for this account. Sign out of an older event role first.");
  }
  await adminAuth.setCustomUserClaims(uid, next);
  return next;
}

async function grantOwner(uid) {
  return replaceCustomClaims(uid, (claims) => ({
    ...claims,
    owner: true,
    websiteAdmin: true,
    ownerExpiresAt: Date.now() + OWNER_SESSION_MS,
  }));
}

async function grantEventRole(uid, eventId, role, accessVersion) {
  return replaceCustomClaims(uid, (claims) => {
    const eventRoles = { ...(claims.eventRoles || {}) };
    const eventRoleVersions = { ...(claims.eventRoleVersions || {}) };
    const roles = new Set(Array.isArray(eventRoles[eventId]) ? eventRoles[eventId].map(normalizeRole).filter(Boolean) : []);
    const normalizedRole = normalizeRole(role);
    roles.add(normalizedRole);
    eventRoles[eventId] = [...roles];
    eventRoleVersions[eventId] = { ...(eventRoleVersions[eventId] || {}), [normalizedRole]: accessVersion };
    return { ...claims, eventRoles, eventRoleVersions };
  });
}

function assertRoleGrantCurrent(auth, eventData, eventId, role) {
  if (isOwnerToken(auth.token)) return;
  const normalizedRole = normalizeRole(role);
  const expectedVersion = eventData?.roleAccess?.[normalizedRole]?.accessVersion;
  const claimVersion = auth.token?.eventRoleVersions?.[eventId]?.[normalizedRole];
  if (!expectedVersion || !claimVersion || !safeEqual(expectedVersion, claimVersion)) {
    fail("permission-denied", "This event-role session expired or was superseded. Unlock the role again.");
  }
}

async function migrateLegacyEventSecrets(appId, eventId) {
  const eventDocument = eventRef(appId, eventId);
  const secretDocument = accessRef(appId, eventId);
  await db.runTransaction(async (transaction) => {
    const [eventSnap, secretSnap] = await Promise.all([transaction.get(eventDocument), transaction.get(secretDocument)]);
    if (!eventSnap.exists) return;
    const eventData = eventSnap.data() || {};
    const existingSecrets = secretSnap.data()?.roles || {};
    const nextSecrets = { ...existingSecrets };
    let foundLegacy = false;
    ["admin", "j1", "j2", "j3"].forEach((role) => {
      const legacyHash = eventData.roleAccess?.[role]?.passwordHash;
      if (legacyHash && !nextSecrets[role]?.passwordHash) {
        nextSecrets[role] = { passwordHash: legacyHash, updatedAt: new Date().toISOString() };
        foundLegacy = true;
      }
      if (nextSecrets[role]?.passwordHash && !nextSecrets[role]?.accessVersion) {
        nextSecrets[role] = { ...nextSecrets[role], accessVersion: crypto.randomUUID() };
        foundLegacy = true;
      }
    });
    const sanitizedAccess = publicRoleAccess(eventData.roleAccess, nextSecrets);
    const accessChanged = JSON.stringify(cleanObject(eventData.roleAccess || {})) !== JSON.stringify(cleanObject(sanitizedAccess));
    if (foundLegacy || !secretSnap.exists) {
      transaction.set(secretDocument, { roles: nextSecrets, updatedAt: new Date().toISOString() }, { merge: true });
    }
    if (accessChanged) {
      const sanitizedEvent = { ...eventData, roleAccess: sanitizedAccess };
      transaction.update(eventDocument, { roleAccess: sanitizedAccess });
      transaction.set(directoryRef(appId), { events: { [eventId]: sanitizeEventMeta(sanitizedEvent, sanitizedEvent) } }, { merge: true });
    }
  });
}

async function migrateAllLegacySecrets(appId) {
  const snapshot = await db.collection(`artifacts/${appId}/public/data/events`).get();
  for (const docSnap of snapshot.docs) await migrateLegacyEventSecrets(appId, docSnap.id);
}

async function ensureRoleAccessVersion(appId, eventId, role) {
  let credential = null;
  await db.runTransaction(async (transaction) => {
    const eventDocument = eventRef(appId, eventId);
    const secretDocument = accessRef(appId, eventId);
    const [eventSnap, secretSnap] = await Promise.all([transaction.get(eventDocument), transaction.get(secretDocument)]);
    if (!eventSnap.exists) fail("not-found", "This event no longer exists.");
    const eventData = eventSnap.data() || {};
    const roles = { ...(secretSnap.data()?.roles || {}) };
    credential = roles[role] || {};
    if (credential.accessVersion) return;
    credential = { ...credential, accessVersion: crypto.randomUUID(), updatedAt: new Date().toISOString() };
    roles[role] = credential;
    const roleAccess = publicRoleAccess(eventData.roleAccess, roles);
    transaction.set(secretDocument, { roles, updatedAt: new Date().toISOString() });
    transaction.update(eventDocument, { roleAccess });
    const sanitizedEvent = { ...eventData, roleAccess };
    transaction.set(directoryRef(appId), { events: { [eventId]: sanitizeEventMeta(sanitizedEvent, sanitizedEvent) } }, { merge: true });
  });
  return credential;
}

async function upgradeLegacyRoleCredential(appId, eventId, role, password) {
  let credential = null;
  await db.runTransaction(async (transaction) => {
    const secretDocument = accessRef(appId, eventId);
    const secretSnap = await transaction.get(secretDocument);
    const roles = { ...(secretSnap.data()?.roles || {}) };
    const current = roles[role] || {};
    if (!current.passwordHash || current.algorithm || !rolePasswordMatches(password, current)) {
      credential = current;
      return;
    }
    credential = {
      ...createRolePasswordCredential(password),
      accessVersion: current.accessVersion || crypto.randomUUID(),
    };
    roles[role] = credential;
    transaction.set(secretDocument, { roles, updatedAt: new Date().toISOString() });
  });
  return credential;
}

async function authorizeAccess(request) {
  const auth = requireAuth(request);
  const data = request.data || {};
  const appId = requireAppId(data.appId);
  const password = String(data.password || "");
  if (!password || password.length > 256) fail("invalid-argument", "Enter a valid password.");

  if (data.kind === "websiteAdmin") {
    const attempts = await checkAuthRateLimit(appId, request, "websiteAdmin");
    if (!safeEqual(sha256(password), sha256(websiteAdminPassword.value()))) {
      await recordAuthFailure(attempts);
      fail("permission-denied", "Incorrect password.");
    }
    await clearAuthFailures(attempts);
    await grantOwner(auth.uid);
    await migrateAllLegacySecrets(appId);
    return { ok: true, owner: true };
  }

  const eventId = requireEventId(data.eventId);
  const role = normalizeRole(data.role);
  if (!role) fail("invalid-argument", "A valid event role is required.");
  const attempts = await checkAuthRateLimit(appId, request, `${eventId}:${role}`);
  await migrateLegacyEventSecrets(appId, eventId);
  const [secretSnap, eventSnap] = await Promise.all([accessRef(appId, eventId).get(), eventRef(appId, eventId).get()]);
  if (!eventSnap.exists) fail("not-found", "This event no longer exists.");
  let expectedCredential = secretSnap.data()?.roles?.[role] || {};
  const masterMatches = safeEqual(sha256(password), sha256(websiteAdminPassword.value()));
  const roleMatches = rolePasswordMatches(password, expectedCredential);
  if (!roleMatches && !masterMatches) {
    await recordAuthFailure(attempts);
    fail("permission-denied", "Incorrect password.");
  }
  await clearAuthFailures(attempts);
  if (roleMatches && !expectedCredential.algorithm) {
    expectedCredential = await upgradeLegacyRoleCredential(appId, eventId, role, password);
  }
  if (!expectedCredential.accessVersion) {
    expectedCredential = await ensureRoleAccessVersion(appId, eventId, role);
  }
  await grantEventRole(auth.uid, eventId, role, expectedCredential.accessVersion);
  return { ok: true, eventId, role, accessVersion: expectedCredential.accessVersion };
}

async function revokeAccess(request) {
  const auth = requireAuth(request);
  const data = request.data || {};
  const appId = requireAppId(data.appId);
  const eventId = data.eventId ? requireEventId(data.eventId) : "";
  const role = normalizeRole(data.role);
  if (eventId && JUDGE_ROLES.includes(role)) {
    await db.runTransaction(async (transaction) => {
      const document = eventRef(appId, eventId);
      const snap = await transaction.get(document);
      if (!snap.exists) return;
      const eventData = snap.data() || {};
      if (eventData.judgeRoleClaims?.[role]?.uid !== auth.uid) return;
      const judgeRoleClaims = clone(eventData.judgeRoleClaims || {});
      judgeRoleClaims[role] = null;
      const syncStamp = nextServerSyncStamp(eventData.syncStamp);
      const next = { ...eventData, judgeRoleClaims, updatedAt: new Date().toISOString(), syncStamp };
      transaction.set(document, next);
      transaction.set(directoryRef(appId), { events: { [eventId]: sanitizeEventMeta(next, next) }, syncStamp }, { merge: true });
    });
  }
  await replaceCustomClaims(auth.uid, (claims) => {
    const next = { ...claims };
    if (data.kind === "websiteAdmin") {
      delete next.owner;
      delete next.websiteAdmin;
      delete next.ownerExpiresAt;
    }
    if (eventId && role) {
      const eventRoles = { ...(next.eventRoles || {}) };
      eventRoles[eventId] = (eventRoles[eventId] || []).map(normalizeRole).filter((entry) => entry && entry !== role);
      if (!eventRoles[eventId].length) delete eventRoles[eventId];
      next.eventRoles = eventRoles;
      const eventRoleVersions = { ...(next.eventRoleVersions || {}) };
      if (eventRoleVersions[eventId]) {
        delete eventRoleVersions[eventId][role];
        if (!Object.keys(eventRoleVersions[eventId]).length) delete eventRoleVersions[eventId];
      }
      next.eventRoleVersions = eventRoleVersions;
    }
    return next;
  });
  return { ok: true };
}

async function manageRoleSecret(request) {
  requireOwner(request);
  const data = request.data || {};
  const appId = requireAppId(data.appId);
  const eventId = requireEventId(data.eventId);
  const role = normalizeRole(data.role);
  if (!role || role === "streamOperator") fail("invalid-argument", "A configurable event role is required.");
  const password = String(data.password || "").trim();
  if (!data.clear && (password.length < 6 || password.length > 256)) fail("invalid-argument", "Use a password with at least 6 characters.");
  let accessVersion = null;
  await db.runTransaction(async (transaction) => {
    const eventDocument = eventRef(appId, eventId);
    const secretDocument = accessRef(appId, eventId);
    const [eventSnap, secretSnap] = await Promise.all([transaction.get(eventDocument), transaction.get(secretDocument)]);
    if (!eventSnap.exists) fail("not-found", "This event no longer exists.");
    const eventData = eventSnap.data() || {};
    const roles = { ...(secretSnap.data()?.roles || {}) };
    if (data.clear) delete roles[role];
    else roles[role] = { ...createRolePasswordCredential(password), accessVersion: crypto.randomUUID() };
    accessVersion = roles[role]?.accessVersion || null;
    const roleAccess = publicRoleAccess(eventData.roleAccess, roles);
    roleAccess[role] = {
      passwordConfigured: !data.clear,
      claimedAt: data.clear ? null : new Date().toISOString(),
      accessVersion: data.clear ? null : roles[role].accessVersion,
    };
    const judgeRoleClaims = clone(eventData.judgeRoleClaims || {});
    if (JUDGE_ROLES.includes(role)) judgeRoleClaims[role] = null;
    transaction.set(secretDocument, { roles, updatedAt: new Date().toISOString() });
    transaction.update(eventDocument, { roleAccess, judgeRoleClaims });
    const sanitizedEvent = { ...eventData, roleAccess, judgeRoleClaims };
    transaction.set(directoryRef(appId), { events: { [eventId]: sanitizeEventMeta(sanitizedEvent, sanitizedEvent) } }, { merge: true });
  });
  return { ok: true, role, passwordConfigured: !data.clear, accessVersion };
}

async function commitEventSnapshot(request) {
  const data = request.data || {};
  const appId = requireAppId(data.appId);
  const eventId = requireEventId(data.eventId);
  const auth = requireEventAdmin(request, eventId);
  const expectedSyncStamp = Number(data.expectedSyncStamp || 0);
  let response;
  await db.runTransaction(async (transaction) => {
    const document = eventRef(appId, eventId);
    const snap = await transaction.get(document);
    if (!snap.exists) fail("not-found", "This event no longer exists.");
    const remote = snap.data() || {};
    assertRoleGrantCurrent(auth, remote, eventId, "admin");
    if (Number(remote.syncStamp || 0) !== expectedSyncStamp) {
      response = { ok: false, stale: true, eventPayload: remote };
      return;
    }
    const publishSyncStamp = nextServerSyncStamp(remote.syncStamp);
    const eventPayload = sanitizePublicEvent({ ...(data.eventPayload || {}), id: eventId, syncStamp: publishSyncStamp }, remote);
    const eventMeta = sanitizeEventMeta({ ...(data.eventMeta || {}), syncStamp: publishSyncStamp }, eventPayload);
    assertEventSize(eventPayload);
    transaction.set(document, eventPayload);
    transaction.set(directoryRef(appId), { events: { [eventId]: eventMeta }, syncStamp: publishSyncStamp }, { merge: true });
    if (data.archivedResultsChanged || Object.prototype.hasOwnProperty.call(data, "archivedResultRecord")) {
      const archiveUpdate = data.archivedResultsChanged
        ? FieldValue.delete()
        : cleanObject(clone(data.archivedResultRecord || null));
      transaction.set(archiveRef(appId), { events: { [eventId]: archiveUpdate }, syncStamp: publishSyncStamp }, { merge: true });
    }
    response = { ok: true, eventPayload, eventMeta, syncStamp: publishSyncStamp };
  });
  return response;
}

async function createEvent(request) {
  requireOwner(request);
  const data = request.data || {};
  const appId = requireAppId(data.appId);
  const eventId = requireEventId(data.eventId);
  const publishSyncStamp = nextServerSyncStamp();
  const eventPayload = sanitizePublicEvent({ ...(data.eventPayload || {}), id: eventId, syncStamp: publishSyncStamp });
  eventPayload.roleAccess = publicRoleAccess({});
  eventPayload.judgeRoleClaims = {};
  const eventMeta = sanitizeEventMeta({ ...(data.eventMeta || {}), syncStamp: publishSyncStamp }, eventPayload);
  assertEventSize(eventPayload);
  await db.runTransaction(async (transaction) => {
    const document = eventRef(appId, eventId);
    const snap = await transaction.get(document);
    if (snap.exists) fail("already-exists", "An event with this identifier already exists.");
    transaction.create(document, eventPayload);
    transaction.set(directoryRef(appId), {
      events: { [eventId]: eventMeta },
      ...(data.makeActive ? { activeEventId: eventId } : {}),
      syncStamp: publishSyncStamp,
    }, { merge: true });
    if (data.makeActive) transaction.set(selectionRef(appId), activeSelectionPayload(eventId, eventPayload, publishSyncStamp));
  });
  return { ok: true, eventPayload, eventMeta, syncStamp: publishSyncStamp };
}

async function setActiveSelection(request) {
  requireOwner(request);
  const data = request.data || {};
  const appId = requireAppId(data.appId);
  const eventId = requireEventId(data.eventId);
  let response;
  await db.runTransaction(async (transaction) => {
    const [eventSnap, directorySnap] = await Promise.all([
      transaction.get(eventRef(appId, eventId)),
      transaction.get(directoryRef(appId)),
    ]);
    if (!eventSnap.exists) fail("not-found", "This event no longer exists.");
    const eventData = eventSnap.data() || {};
    if (String(eventData.status || "active") === "archived") fail("failed-precondition", "Archived events cannot become active.");
    const syncStamp = nextServerSyncStamp(directorySnap.data()?.syncStamp);
    transaction.set(selectionRef(appId), activeSelectionPayload(eventId, eventData, syncStamp));
    transaction.set(directoryRef(appId), { activeEventId: eventId, syncStamp }, { merge: true });
    response = { ok: true, activeEventId: eventId, eventMeta: sanitizeEventMeta(eventData, eventData), syncStamp };
  });
  return response;
}

async function restoreMissingEvent(request) {
  requireOwner(request);
  const data = request.data || {};
  const appId = requireAppId(data.appId);
  const eventId = requireEventId(data.eventId);
  let response;
  await db.runTransaction(async (transaction) => {
    const document = eventRef(appId, eventId);
    const directoryDocument = directoryRef(appId);
    const [eventSnap, directorySnap] = await Promise.all([
      transaction.get(document),
      transaction.get(directoryDocument),
    ]);
    const directoryData = directorySnap.data() || {};
    const directoryMeta = directoryData.events?.[eventId];
    if (!directoryMeta) fail("not-found", "This event is absent from the authoritative directory.");

    const existingEvent = eventSnap.exists ? eventSnap.data() || {} : null;
    const recoveredEvent = existingEvent || sanitizePublicEvent({ ...(data.eventPayload || {}), id: eventId }, directoryMeta);
    if (!existingEvent && (!recoveredEvent.name || String(recoveredEvent.status || "") !== "completed")) {
      fail("failed-precondition", "Only a complete, known event recovery snapshot can restore a missing event.");
    }
    if (String(recoveredEvent.status || "active") === "archived") {
      fail("failed-precondition", "Archived events cannot become active.");
    }
    if (!existingEvent && String(recoveredEvent.status || "").toLowerCase() === "completed"
      && recoveredEvent.qualifyingFlow?.completed && recoveredEvent.results?.championName && recoveredEvent.results?.completedAt) {
      if (recoveredEvent.bracket) {
        const suppliedHash = String(data.validatedBracketHash || "");
        if (data.validatedHistoricalBracket !== true || suppliedHash !== bracketHash(recoveredEvent.bracket)) {
          fail("failed-precondition", "A completed historical bracket requires a validated snapshot hash.");
        }
        recoveredEvent.historicalBracketStatus = "available";
      } else {
        recoveredEvent.historicalBracketStatus = HISTORICAL_BRACKET_UNAVAILABLE;
      }
    }

    const syncStamp = nextServerSyncStamp(directoryData.syncStamp, recoveredEvent.syncStamp);
    const eventPayload = existingEvent
      ? recoveredEvent
      : sanitizePublicEvent({ ...recoveredEvent, id: eventId, syncStamp }, directoryMeta);
    const eventMeta = sanitizeEventMeta({ ...directoryMeta, ...(data.eventMeta || {}), syncStamp }, eventPayload);
    assertEventSize(eventPayload);

    if (!existingEvent) transaction.create(document, eventPayload);
    transaction.set(directoryDocument, {
      events: { [eventId]: eventMeta },
      activeEventId: eventId,
      syncStamp,
    }, { merge: true });
    transaction.set(selectionRef(appId), activeSelectionPayload(eventId, eventPayload, syncStamp));
    if (!existingEvent && Object.prototype.hasOwnProperty.call(data, "archivedResultRecord")) {
      transaction.set(archiveRef(appId), {
        events: { [eventId]: cleanObject(clone(data.archivedResultRecord || null)) },
        syncStamp,
      }, { merge: true });
    }
    response = { ok: true, restored: !existingEvent, eventPayload, eventMeta, syncStamp };
  });
  return response;
}

async function repairHistoricalBracketUnavailable(request) {
  requireOwner(request);
  const data = request.data || {};
  const appId = requireAppId(data.appId);
  const eventId = requireEventId(data.eventId);
  if (eventId !== ROUND3_EVENT_ID) fail("invalid-argument", "This guarded repair is only valid for the verified Round 3 recovery event.");

  const execute = data.execute === true;
  const verifyOnly = data.verifyOnly === true;
  let response;
  await db.runTransaction(async (transaction) => {
    const document = eventRef(appId, eventId);
    const auditDocument = historicalBracketRepairAuditRef(appId, eventId);
    const [eventSnap, auditSnap] = await Promise.all([
      transaction.get(document),
      transaction.get(auditDocument),
    ]);
    if (!eventSnap.exists) fail("not-found", "The Round 3 event does not exist.");

    const eventData = eventSnap.data() || {};
    const verification = buildRound3RepairVerification(eventId, eventData, { updateTime: eventSnap.updateTime });
    if (verifyOnly) {
      response = {
        ok: true,
        changed: false,
        verify: verification,
      };
      return;
    }
    const inspection = inspectRound3SyntheticBracket(eventId, eventData);
    if (!inspection.valid) {
      const details = (!execute && inspection.reason === "unexpected-bracket-hash")
        ? {
          reason: inspection.reason,
          diagnostic: collectRound3BracketDiagnostics(eventData),
        }
        : { reason: inspection.reason };
      fail("failed-precondition", `The Round 3 event no longer matches the guarded repair state (${inspection.reason}).`, details);
    }
    if (inspection.alreadyRepaired) {
      response = {
        ok: true,
        changed: false,
        alreadyRepaired: true,
        historicalBracketStatus: HISTORICAL_BRACKET_UNAVAILABLE,
      };
      return;
    }

    const dryRun = {
      eventId,
      bracketHash: inspection.bracketHash,
      bracketCreatedAt: eventData.bracket.createdAt,
      currentSyncStamp: Number(eventData.syncStamp || 0),
      remove: ["bracket"],
      add: { historicalBracketStatus: HISTORICAL_BRACKET_UNAVAILABLE },
      preserve: ["drivers", "qualifyingFlow", "results", "roleAccess", "judgeRoleClaims", "registration", "directory", "resultsArchive"],
    };
    if (!execute) {
      response = { ok: true, changed: false, dryRun };
      return;
    }

    if (auditSnap.exists) fail("failed-precondition", "A repair audit already exists while the synthetic bracket is still present.");
    if (!repairFingerprintMatches({
      bracketHash: inspection.bracketHash,
      createdAt: eventData.bracket.createdAt,
      syncStamp: eventData.syncStamp,
    }, {
      bracketHash: data.expectedBracketHash,
      createdAt: data.expectedBracketCreatedAt,
      syncStamp: data.expectedSyncStamp,
    })) {
      fail("failed-precondition", "The expected bracket hash, timestamp, or sync stamp does not match the current production event.");
    }

    const repairedAt = new Date().toISOString();
    const syncStamp = nextServerSyncStamp(eventData.syncStamp);
    transaction.create(auditDocument, {
      eventId,
      repairType: "historical-bracket-unavailable",
      bracketHash: inspection.bracketHash,
      bracketCreatedAt: eventData.bracket.createdAt,
      previousSyncStamp: Number(eventData.syncStamp || 0),
      previousStatus: eventData.status,
      previousResults: cleanObject(clone(eventData.results || {})),
      syntheticBracket: cleanObject(clone(eventData.bracket)),
      createdAt: repairedAt,
    });
    transaction.update(document, {
      bracket: FieldValue.delete(),
      historicalBracketStatus: HISTORICAL_BRACKET_UNAVAILABLE,
      historicalBracketUpdatedAt: repairedAt,
      updatedAt: repairedAt,
      syncStamp,
    });
    response = {
      ok: true,
      changed: true,
      alreadyRepaired: false,
      historicalBracketStatus: HISTORICAL_BRACKET_UNAVAILABLE,
      syncStamp,
      dryRun,
    };
  });
  return response;
}

async function deleteEvent(request) {
  requireOwner(request);
  const data = request.data || {};
  const appId = requireAppId(data.appId);
  const eventId = requireEventId(data.eventId);
  const replacementEventId = data.replacementEventId ? requireEventId(data.replacementEventId) : "";
  await db.runTransaction(async (transaction) => {
    const directory = await transaction.get(directoryRef(appId));
    const events = { ...(directory.data()?.events || {}) };
    if (!events[eventId]) fail("not-found", "This event no longer exists.");
    if (Object.keys(events).length <= 1) fail("failed-precondition", "The final event cannot be deleted.");
    const syncStamp = nextServerSyncStamp(directory.data()?.syncStamp);
    delete events[eventId];
    const nextActive = replacementEventId && events[replacementEventId]
      ? replacementEventId
      : Object.keys(events)[0];
    transaction.delete(eventRef(appId, eventId));
    transaction.delete(accessRef(appId, eventId));
    transaction.set(directoryRef(appId), { events, activeEventId: nextActive, syncStamp });
    transaction.set(selectionRef(appId), {
      activeEventId: nextActive,
      eventMeta: cleanObject(clone(events[nextActive] || null)),
      syncStamp,
    });
    transaction.set(archiveRef(appId), { events: { [eventId]: FieldValue.delete() }, syncStamp }, { merge: true });
  });
  return { ok: true, deletedEventId: eventId, syncStamp };
}

function validateJudgeDevice(eventData, role, deviceId, uid) {
  if (eventData.judgingMode !== "line-angle-style" || activeJudgeRoles(eventData).length <= 1) return;
  const claim = eventData.judgeRoleClaims?.[role];
  if (!claim?.deviceId || claim.deviceId !== String(deviceId || "") || claim.uid !== uid) {
    fail("permission-denied", "This judge role is assigned to another device or has expired.");
  }
}

async function claimJudgeRole(request) {
  const data = request.data || {};
  const appId = requireAppId(data.appId);
  const eventId = requireEventId(data.eventId);
  const { auth, role } = requireJudge(request, eventId, data.role);
  const deviceId = String(data.deviceId || "").trim();
  if (!deviceId || deviceId.length > 180) fail("invalid-argument", "A valid judge device identifier is required.");
  const release = data.release === true;
  let result;
  await db.runTransaction(async (transaction) => {
    const document = eventRef(appId, eventId);
    const snap = await transaction.get(document);
    if (!snap.exists) fail("not-found", "This event no longer exists.");
    const eventData = snap.data() || {};
    assertRoleGrantCurrent(auth, eventData, eventId, role);
    if (eventLocked(eventData)) fail("failed-precondition", "Judging is locked for this event.");
    const claims = clone(eventData.judgeRoleClaims || {});
    activeJudgeRoles(eventData).forEach((judgeRole) => {
      if (claims[judgeRole]?.deviceId === deviceId && claims[judgeRole]?.uid === auth.uid) claims[judgeRole] = null;
    });
    if (release) {
      const existing = claims[role];
      if (existing && (existing.deviceId !== deviceId || existing.uid !== auth.uid)) {
        fail("permission-denied", "Only the device that owns this judge assignment can release it.");
      }
      claims[role] = null;
    } else {
      const existing = claims[role];
      const lastSeen = Date.parse(existing?.lastSeenAt || existing?.claimedAt || "") || 0;
      const activeElsewhere = existing?.deviceId
        && (existing.deviceId !== deviceId || existing.uid !== auth.uid)
        && Date.now() - lastSeen < 5 * 60 * 1000;
      if (activeElsewhere) fail("already-exists", "This judge role is already assigned on another device.");
      const now = new Date().toISOString();
      claims[role] = { uid: auth.uid, deviceId, claimedAt: existing?.deviceId === deviceId && existing?.uid === auth.uid ? (existing.claimedAt || now) : now, lastSeenAt: now };
    }
    const syncStamp = nextServerSyncStamp(eventData.syncStamp);
    const next = { ...eventData, judgeRoleClaims: claims, updatedAt: new Date().toISOString(), syncStamp };
    transaction.set(document, next);
    transaction.set(directoryRef(appId), { events: { [eventId]: sanitizeEventMeta(next, next) }, syncStamp }, { merge: true });
    result = { ok: true, claimedRole: release ? null : role, eventPayload: next };
  });
  return result;
}

function normalizeSubmittedScores(raw, role, eventData) {
  const result = { run1: null, run2: null, runoff: null, submitted: { run1: null, run2: null, runoff: null }, deductionHistory: { run1: [], run2: [], runoff: [] } };
  ["run1", "run2", "runoff"].forEach((runKey) => {
    result[runKey] = clampJudgeScore(raw?.[runKey], role, eventData);
    result.submitted[runKey] = clampJudgeScore(raw?.submitted?.[runKey] ?? raw?.[runKey], role, eventData);
    result.deductionHistory[runKey] = Array.isArray(raw?.deductionHistory?.[runKey])
      ? raw.deductionHistory[runKey].map((entry) => String(entry).slice(0, 40)).slice(-20)
      : [];
  });
  return result;
}

function allRolesSubmitted(driver, roles, runKeys) {
  return roles.length > 0 && roles.every((role) => runKeys.every((runKey) => driver?.scores?.[role]?.submitted?.[runKey] !== null && driver?.scores?.[role]?.submitted?.[runKey] !== undefined));
}

async function submitJudgeQualifying(request) {
  const data = request.data || {};
  const appId = requireAppId(data.appId);
  const eventId = requireEventId(data.eventId);
  const { auth, role } = requireJudge(request, eventId, data.role);
  const driverId = String(data.driverId || "").trim();
  const runKey = ["run1", "run2", "runoff"].includes(data.runKey) ? data.runKey : null;
  if (!driverId) fail("invalid-argument", "A valid qualifying entry is required.");
  let response;
  await db.runTransaction(async (transaction) => {
    const document = eventRef(appId, eventId);
    const snap = await transaction.get(document);
    if (!snap.exists) fail("not-found", "This event no longer exists.");
    const eventData = snap.data() || {};
    assertRoleGrantCurrent(auth, eventData, eventId, role);
    if (eventLocked(eventData)) fail("failed-precondition", "Judging is locked for this event.");
    validateJudgeDevice(eventData, role, data.deviceId, auth.uid);
    const drivers = clone(Array.isArray(eventData.drivers) ? eventData.drivers : []);
    const driver = drivers.find((entry) => entry.id === driverId);
    if (!driver) fail("failed-precondition", "This driver is no longer in the qualifying queue.");
    driver.scores = driver.scores || {};
    const submitted = normalizeSubmittedScores(data.scores || {}, role, eventData);
    if (runKey) {
      driver.scores[role] = driver.scores[role] || normalizeSubmittedScores({}, role, eventData);
      if (driver.scores[role]?.submitted?.[runKey] !== null && driver.scores[role]?.submitted?.[runKey] !== undefined) {
        fail("aborted", "This qualifying score was already submitted for the current run.");
      }
      driver.scores[role][runKey] = submitted[runKey];
      driver.scores[role].submitted = driver.scores[role].submitted || {};
      driver.scores[role].submitted[runKey] = submitted.submitted[runKey];
      driver.scores[role].deductionHistory = driver.scores[role].deductionHistory || {};
      driver.scores[role].deductionHistory[runKey] = submitted.deductionHistory[runKey];
    } else {
      driver.scores[role] = submitted;
    }
    const qualifyingFlow = clone(eventData.qualifyingFlow || { currentDriverId: null, readyRoles: {}, started: false, completed: false });
    qualifyingFlow.readyRoles = { ...(qualifyingFlow.readyRoles || {}) };
    delete qualifyingFlow.readyRoles[role];
    if (eventData.competitionMode !== "twin-triple" && qualifyingFlow.currentDriverId === driverId) {
      const roles = activeJudgeRoles(eventData);
      const shouldAdvance = runKey === "run2"
        ? allRolesSubmitted(driver, roles, ["run2"])
        : !runKey && allRolesSubmitted(driver, roles, ["run1", "run2"]);
      if (shouldAdvance) {
        const queue = drivers.filter((entry) => String(entry.name || "").trim());
        const currentIndex = queue.findIndex((entry) => entry.id === driverId);
        const nextDriverId = currentIndex >= 0 ? (queue[currentIndex + 1]?.id || null) : null;
        qualifyingFlow.currentDriverId = nextDriverId;
        qualifyingFlow.readyRoles = {};
        qualifyingFlow.started = true;
        qualifyingFlow.completed = !nextDriverId;
      }
    }
    const syncStamp = nextServerSyncStamp(eventData.syncStamp);
    const next = { ...eventData, drivers, qualifyingFlow, updatedAt: new Date().toISOString(), syncStamp };
    transaction.set(document, next);
    transaction.set(directoryRef(appId), { events: { [eventId]: sanitizeEventMeta(next, next) }, syncStamp }, { merge: true });
    response = { ok: true, eventPayload: next, syncStamp };
  });
  return response;
}

async function submitJudgeCompetition(request, scorecard = false) {
  const data = request.data || {};
  const appId = requireAppId(data.appId);
  const eventId = requireEventId(data.eventId);
  const { auth, role } = requireJudge(request, eventId, data.role);
  let response;
  await db.runTransaction(async (transaction) => {
    const document = eventRef(appId, eventId);
    const snap = await transaction.get(document);
    if (!snap.exists) fail("not-found", "This event no longer exists.");
    const eventData = snap.data() || {};
    assertRoleGrantCurrent(auth, eventData, eventId, role);
    if (eventLocked(eventData)) fail("failed-precondition", "Judging is locked for this event.");
    validateJudgeDevice(eventData, role, data.deviceId, auth.uid);
    if (!eventData.bracket?.mainBracket?.rounds?.length) fail("failed-precondition", "The current battle is no longer available.");
    const expectedEntryKey = String(data.expectedEntryKey || "");
    const expectedAttemptId = String(data.expectedAttemptId || "");
    if (!expectedEntryKey || !expectedAttemptId) {
      fail("failed-precondition", "This judge screen is out of date. Wait for the latest battle before submitting.");
    }
    const result = scorecard
      ? recordScorecard(eventData.bracket, eventData, role, data.submission, expectedEntryKey, expectedAttemptId)
      : recordVote(eventData.bracket, eventData, role, String(data.side || ""), expectedEntryKey, expectedAttemptId);
    if (!result.changed) fail("aborted", result.stale ? "The battle or judging attempt changed before this submission arrived. Wait for the latest battle." : "Voting is closed or the battle changed.");
    const syncStamp = nextServerSyncStamp(eventData.syncStamp);
    const next = { ...eventData, bracket: result.state, updatedAt: new Date().toISOString(), syncStamp };
    transaction.set(document, next);
    transaction.set(directoryRef(appId), { events: { [eventId]: sanitizeEventMeta(next, next) }, syncStamp }, { merge: true });
    response = { ok: true, eventPayload: next, resolution: result.resolution, entry: result.entry, syncStamp };
  });
  return response;
}

async function adminCompetitionDecision(request) {
  const data = request.data || {};
  const appId = requireAppId(data.appId);
  const eventId = requireEventId(data.eventId);
  const decision = data.decision === "review" ? "review"
    : data.decision === "continue" ? "continue"
      : data.decision === "timeout" ? "timeout"
        : null;
  if (!decision) fail("invalid-argument", "Choose a valid competition decision action.");
  // A timeout does not select a result or reopen a review. It only applies the
  // already persisted winner/OMT outcome after its server-recorded deadline,
  // so any signed-in connected client may safely make the idempotent call.
  // Manual Continue and Contest remain Event Admin-only.
  const auth = decision === "timeout" ? requireAuth(request) : requireEventAdmin(request, eventId);
  const expectedEntryKey = String(data.expectedEntryKey || "");
  const expectedAttemptId = String(data.expectedAttemptId || "");
  let response;
  await db.runTransaction(async (transaction) => {
    const document = eventRef(appId, eventId);
    const snap = await transaction.get(document);
    if (!snap.exists) fail("not-found", "This event no longer exists.");
    const eventData = snap.data() || {};
    if (decision !== "timeout") assertRoleGrantCurrent(auth, eventData, eventId, "admin");
    if (!eventData.bracket?.mainBracket?.rounds?.length) fail("failed-precondition", "The current battle is no longer available.");
    if (decision === "timeout") {
      const control = eventData.bracket?.competitionJudgeControl || {};
      // Timeout is only the automatic acknowledgement of an unchallenged
      // resolved decision. It must never reopen a staff-created review hold.
      if (control.status !== "admin_decision") {
        response = { ok: true, changed: false, eventPayload: eventData, syncStamp: Number(eventData.syncStamp || 0) };
        return;
      }
      const deadlineAt = Date.parse(control.reviewDeadlineAt || "");
      if (!expectedEntryKey || !expectedAttemptId) {
        fail("invalid-argument", "The current decision fingerprint is required for an automatic timeout.");
      }
      if (!Number.isFinite(deadlineAt) || deadlineAt > Date.now()) {
        fail("failed-precondition", "The competition decision contest window has not expired.");
      }
    }
    const result = decision === "review"
      ? reviewDecision(eventData.bracket, expectedEntryKey, expectedAttemptId)
      : continueDecision(eventData.bracket, expectedEntryKey, expectedAttemptId);
    if (!result.changed) {
      response = { ok: true, changed: false, eventPayload: eventData, syncStamp: Number(eventData.syncStamp || 0) };
      return;
    }
    const syncStamp = nextServerSyncStamp(eventData.syncStamp);
    const next = { ...eventData, bracket: result.state, updatedAt: new Date().toISOString(), syncStamp };
    transaction.set(document, next);
    transaction.set(directoryRef(appId), { events: { [eventId]: sanitizeEventMeta(next, next) }, syncStamp }, { merge: true });
    response = { ok: true, changed: true, eventPayload: next, syncStamp };
  });
  return response;
}

function safeText(value, max = 160) {
  return String(value || "").trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max);
}

function normalizeName(value) {
  return safeText(value, 100).toLocaleLowerCase().replace(/\s+/g, " ");
}

function registrationIdentityNames(entries = []) {
  const names = new Set();
  entries.forEach((entry) => {
    [entry?.name, entry?.teamName, ...(Array.isArray(entry?.tandemMembers) ? entry.tandemMembers : [])]
      .map(normalizeName)
      .filter(Boolean)
      .forEach((name) => names.add(name));
  });
  return names;
}

function assertRegistrationShape(entries, eventData, { direct = false, existing = false } = {}) {
  const invalid = (message) => fail(existing ? "failed-precondition" : "invalid-argument", message);
  const mode = String(eventData?.competitionMode || "solo");
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 3) invalid("Registration must contain between one and three entries.");
  if (mode === "twin-triple" && direct) {
    if (entries.length !== 1) invalid("Twin Comp direct registration must contain one team entry.");
    const members = Array.isArray(entries[0]?.tandemMembers) ? entries[0].tandemMembers.map((name) => safeText(name, 100)).filter(Boolean) : [];
    if (!safeText(entries[0]?.name, 100) || members.length < 2 || members.length > 3 || registrationIdentityNames(members.map((name) => ({ name }))).size !== members.length) {
      invalid("Twin Comp teams require a team name and two or three unique drivers.");
    }
    return;
  }
  if (mode === "team-tandem" || mode === "twin-triple") {
    if (entries.length < 2 || entries.length > 3) invalid("Team registration requires two or three drivers.");
    const teamNames = new Set(entries.map((entry) => normalizeName(entry?.teamName)).filter(Boolean));
    if (teamNames.size !== 1 || entries.some((entry) => !normalizeName(entry?.teamName))) invalid("Every team member must use the same team name.");
    const memberNames = entries.map((entry) => normalizeName(entry?.name));
    if (memberNames.some((name) => !name) || new Set(memberNames).size !== memberNames.length) invalid("Team driver names must be present and unique.");
    return;
  }
  if (entries.length !== 1) invalid("Solo registration accepts exactly one driver.");
  if (!normalizeName(entries[0]?.name)) invalid("A driver name is required.");
}

function newDriver(entry, position) {
  const id = safeText(entry?.id, 180) || crypto.randomUUID();
  return {
    id,
    name: safeText(entry?.name, 100),
    teamName: safeText(entry?.teamName, 100),
    chassis: safeText(entry?.chassis, 100),
    reg: position,
    registrationNumber: position,
    signUpPosition: position,
    teamRegistrationId: safeText(entry?.teamRegistrationId, 180) || null,
    teamMemberOrder: Number.isInteger(Number(entry?.teamMemberOrder)) ? Math.max(1, Math.min(3, Number(entry.teamMemberOrder))) : null,
    teamMemberCount: Number.isInteger(Number(entry?.teamMemberCount)) ? Math.max(1, Math.min(3, Number(entry.teamMemberCount))) : null,
    tandemMembers: Array.isArray(entry?.tandemMembers) ? entry.tandemMembers.map((name) => safeText(name, 100)).filter(Boolean).slice(0, 3) : [],
    memberCount: Number(entry?.memberCount || entry?.teamMemberCount || entry?.tandemMembers?.length || 0),
    tandemBonusPoints: Number(entry?.tandemBonusPoints || 0),
    tandemType: entry?.tandemType === "team" ? "team" : null,
    runFlags: { run1: null, run2: null, runoff: null },
    scores: {
      j1: normalizeSubmittedScores({}, "j1", {}),
      j2: normalizeSubmittedScores({}, "j2", {}),
      j3: normalizeSubmittedScores({}, "j3", {}),
    },
  };
}

function registrationClosed(eventData) {
  return eventLocked(eventData)
    || Boolean(eventData.qualifyingFlow?.started)
    || Boolean(eventData.qualifyingFlow?.completed)
    || Boolean(eventData.bracket?.mainBracket?.rounds?.length);
}

function publicRegistrationCloseReason(eventData) {
  if (!eventData?.venueConfig?.enabled) return "Public registration is not enabled for this event.";
  const venueLatitude = coordinateValue(eventData.venueConfig.latitude);
  const venueLongitude = coordinateValue(eventData.venueConfig.longitude);
  const radiusMeters = coordinateValue(eventData.venueConfig.radiusMeters);
  if (!validCoordinatePair(venueLatitude, venueLongitude) || radiusMeters === null || radiusMeters <= 0) {
    return "Public registration venue location is not configured safely for this event.";
  }
  if (registrationClosed(eventData)) return "Registration is closed because qualifying or competition has started.";
  const closeAt = Date.parse(eventData?.venueConfig?.closeAt || "");
  if (Number.isFinite(closeAt) && Date.now() >= closeAt) return "Registration is closed because the scheduled close time has passed.";
  return "";
}

function validCoordinatePair(latitude, longitude) {
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90
    && Math.abs(longitude) <= 180;
}

function coordinateValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function distanceMetersBetween(latitudeA, longitudeA, latitudeB, longitudeB) {
  const toRadians = (degrees) => degrees * (Math.PI / 180);
  const earthRadiusMeters = 6_371_000;
  const deltaLatitude = toRadians(latitudeB - latitudeA);
  const deltaLongitude = toRadians(longitudeB - longitudeA);
  const a = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(toRadians(latitudeA)) * Math.cos(toRadians(latitudeB)) * Math.sin(deltaLongitude / 2) ** 2;
  const clamped = Math.min(1, Math.max(0, a));
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped));
}

function validateArrivalProof(eventData, rawProof, { required = false } = {}) {
  if (!rawProof || typeof rawProof !== "object") {
    if (required) fail("invalid-argument", "Venue arrival verification is required.");
    return null;
  }
  const closeReason = publicRegistrationCloseReason(eventData);
  if (closeReason) fail("failed-precondition", closeReason);
  const venueConfig = eventData.venueConfig || {};
  const source = String(rawProof.source || "");
  if (source === "qr") {
    if (!venueConfig.qrCheckInEnabled) fail("failed-precondition", "Venue QR check-in is disabled for this event.");
    const expectedToken = safeText(venueConfig.qrToken, 180);
    const submittedToken = safeText(rawProof.qrToken, 180);
    if (!expectedToken || !submittedToken || !safeEqual(expectedToken, submittedToken)) {
      fail("permission-denied", "This venue QR code is invalid. Ask event staff for the latest check-in screen.");
    }
    const expiresAt = Date.parse(venueConfig.qrTokenExpiresAt || "");
    if (Number.isFinite(expiresAt) && Date.now() >= expiresAt) {
      fail("failed-precondition", "This venue QR code has expired. Ask event staff for a fresh check-in QR.");
    }
    return { source: "qr", distanceMeters: null };
  }
  if (source === "geofence") {
    const latitude = coordinateValue(rawProof.latitude);
    const longitude = coordinateValue(rawProof.longitude);
    const venueLatitude = coordinateValue(venueConfig.latitude);
    const venueLongitude = coordinateValue(venueConfig.longitude);
    const radiusMeters = coordinateValue(venueConfig.radiusMeters);
    if (!validCoordinatePair(latitude, longitude)
      || !validCoordinatePair(venueLatitude, venueLongitude)
      || radiusMeters === null
      || radiusMeters <= 0) {
      fail("failed-precondition", "Venue geofence verification is not configured safely for this event.");
    }
    const distanceMeters = distanceMetersBetween(latitude, longitude, venueLatitude, venueLongitude);
    if (distanceMeters > radiusMeters) {
      fail("permission-denied", "This device is outside the configured venue check-in area.");
    }
    return { source: "geofence", distanceMeters: Math.round(distanceMeters * 10) / 10 };
  }
  fail("invalid-argument", "A valid venue arrival method is required.");
}

function buildApprovedDrivers(group, drivers, eventData, markPaid) {
  const now = new Date().toISOString();
  const first = group[0];
  const basePosition = drivers.length + 1;
  const paidAt = markPaid ? now : (first?.paidAt || null);
  if (eventData.competitionMode === "twin-triple") {
    const names = group.map((entry) => safeText(entry.name, 100)).filter(Boolean);
    const driver = newDriver({
      ...first,
      name: safeText(first?.teamName, 100) || names.join(" / ") || "Twin Team",
      teamName: names.join(", "),
      chassis: `${names.length} driver${names.length === 1 ? "" : "s"}`,
      tandemMembers: names,
      memberCount: names.length,
      teamMemberCount: names.length,
      tandemBonusPoints: names.length >= 3 ? 3 : 0,
      tandemType: "team",
      paidAt,
      approvedToRosterAt: now,
    }, basePosition);
    driver.selfRegisteredAt = first?.selfRegisteredAt || first?.submittedAt || null;
    driver.selfRegisteredDistanceMeters = first?.selfRegisteredDistanceMeters ?? null;
    driver.checkedInAt = first?.checkedInAt || null;
    driver.checkedInDistanceMeters = first?.checkedInDistanceMeters ?? null;
    driver.paidAt = paidAt;
    driver.approvedToRosterAt = now;
    return [driver];
  }
  return group.map((entry, index) => ({
    ...newDriver(entry, basePosition + index),
    selfRegisteredAt: entry.selfRegisteredAt || entry.submittedAt || null,
    selfRegisteredDistanceMeters: entry.selfRegisteredDistanceMeters ?? null,
    checkedInAt: entry.checkedInAt || null,
    checkedInDistanceMeters: entry.checkedInDistanceMeters ?? null,
    paidAt: markPaid ? now : (entry.paidAt || null),
    approvedToRosterAt: now,
  }));
}

async function submitSelfRegistration(request) {
  const auth = requireAuth(request);
  const data = request.data || {};
  const appId = requireAppId(data.appId);
  const eventId = requireEventId(data.eventId);
  const deviceToken = requireRegistrationDeviceToken(data.deviceToken);
  const rawEntries = Array.isArray(data.entries) ? data.entries : [];
  if (!rawEntries.length || rawEntries.some((entry) => !safeText(entry?.name, 100))) fail("invalid-argument", "At least one driver name is required.");
  let response;
  await db.runTransaction(async (transaction) => {
    const document = eventRef(appId, eventId);
    const bindingRef = registrationDeviceRef(appId, deviceToken);
    const [snap, bindingSnap] = await Promise.all([transaction.get(document), transaction.get(bindingRef)]);
    if (!snap.exists) fail("not-found", "This event no longer exists.");
    if (bindingSnap.exists && bindingSnap.data()?.uid !== auth.uid) fail("permission-denied", "This registration profile belongs to another signed-in device.");
    const eventData = snap.data() || {};
    assertRegistrationShape(rawEntries, eventData);
    const closeReason = publicRegistrationCloseReason(eventData);
    if (closeReason) fail("failed-precondition", closeReason);
    const drivers = Array.isArray(eventData.drivers) ? eventData.drivers : [];
    const pending = Array.isArray(eventData.pendingRegistrations) ? clone(eventData.pendingRegistrations) : [];
    if (!bindingSnap.exists && pending.some((entry) => entry.deviceToken === deviceToken)) {
      fail("permission-denied", "This legacy registration must be verified by event staff before it can be changed.");
    }
    const ownedEntries = pending.filter((entry) => entry.deviceToken === deviceToken);
    const remaining = pending.filter((entry) => entry.deviceToken !== deviceToken);
    const existingNames = registrationIdentityNames([...drivers, ...remaining]);
    const candidateNames = rawEntries.map((entry) => normalizeName(entry.name));
    const candidateIdentities = registrationIdentityNames(rawEntries);
    if (new Set(candidateNames).size !== candidateNames.length || [...candidateIdentities].some((name) => existingNames.has(name))) {
      fail("already-exists", "A driver with this name is already registered or pending review.");
    }
    const arrival = validateArrivalProof(eventData, data.arrivalProof);
    const groupId = safeText(data.groupId, 180)
      || ownedEntries[0]?.registrationGroupId
      || ownedEntries[0]?.teamRegistrationId
      || crypto.randomUUID();
    const now = new Date().toISOString();
    const reservedIds = new Set([...drivers, ...remaining].map((entry) => String(entry?.id || "")).filter(Boolean));
    const nextEntries = rawEntries.map((entry, index) => {
      const requestedId = safeText(entry.id, 180);
      const existing = ownedEntries.find((candidate) => candidate.id === requestedId)
        || ownedEntries.find((candidate) => normalizeName(candidate.name) === normalizeName(entry.name))
        || ownedEntries[index]
        || null;
      let id = existing?.id || requestedId || crypto.randomUUID();
      if (reservedIds.has(id)) id = crypto.randomUUID();
      reservedIds.add(id);
      const checkedInAt = arrival ? now : (existing?.checkedInAt || null);
      const arrivedAt = arrival ? (existing?.arrivedAt || now) : (existing?.arrivedAt || null);
      return {
        id,
        registrationGroupId: groupId,
        deviceToken,
        name: safeText(entry.name, 100),
        teamName: safeText(entry.teamName, 100),
        chassis: safeText(entry.chassis, 100),
        teamRegistrationId: existing?.teamRegistrationId || safeText(entry.teamRegistrationId, 180) || groupId,
        teamMemberOrder: index + 1,
        teamMemberCount: rawEntries.length,
        selfRegisteredAt: existing?.selfRegisteredAt || existing?.submittedAt || now,
        submittedAt: now,
        updatedAt: now,
        approvalRequired: existing?.approvalRequired ?? true,
        paid: Boolean(existing?.paid || existing?.paidAt),
        paidAt: existing?.paidAt || null,
        arrived: Boolean(checkedInAt || arrivedAt),
        arrivedAt,
        checkedInAt,
        arrivalSource: arrival?.source || existing?.arrivalSource || "",
        rejectedAt: existing?.rejectedAt || null,
        rejectedReason: existing?.rejectedReason || "",
        needsReviewAt: existing?.needsReviewAt || null,
        reviewReason: existing?.reviewReason || "",
        selfRegisteredDistanceMeters: arrival?.distanceMeters ?? existing?.selfRegisteredDistanceMeters ?? null,
        checkedInDistanceMeters: arrival?.distanceMeters ?? existing?.checkedInDistanceMeters ?? null,
      };
    });
    const syncStamp = nextServerSyncStamp(eventData.syncStamp);
    const next = { ...eventData, pendingRegistrations: [...remaining, ...nextEntries], updatedAt: now, syncStamp };
    transaction.set(bindingRef, { uid: auth.uid, updatedAt: now }, { merge: true });
    transaction.set(document, next);
    transaction.set(directoryRef(appId), { events: { [eventId]: sanitizeEventMeta(next, next) }, syncStamp }, { merge: true });
    response = { ok: true, eventPayload: next, entries: nextEntries, syncStamp };
  });
  return response;
}

async function adminRegistration(request) {
  const data = request.data || {};
  const appId = requireAppId(data.appId);
  const eventId = requireEventId(data.eventId);
  const auth = requireEventAdmin(request, eventId);
  const operation = String(data.operation || "");
  const allowedOperations = new Set(["direct", "approve", "remove", "markPaid", "needsReview", "reject", "resetArrival"]);
  if (!allowedOperations.has(operation)) fail("invalid-argument", "A valid registration operation is required.");
  let response;
  await db.runTransaction(async (transaction) => {
    const document = eventRef(appId, eventId);
    const snap = await transaction.get(document);
    if (!snap.exists) fail("not-found", "This event no longer exists.");
    const eventData = snap.data() || {};
    assertRoleGrantCurrent(auth, eventData, eventId, "admin");
    if (eventLocked(eventData)) fail("failed-precondition", "This event is read-only.");
    let drivers = clone(Array.isArray(eventData.drivers) ? eventData.drivers : []);
    let pending = clone(Array.isArray(eventData.pendingRegistrations) ? eventData.pendingRegistrations : []);
    if (operation === "direct") {
      if (registrationClosed(eventData)) fail("failed-precondition", "Registration is closed because competition activity has started.");
      const candidates = Array.isArray(data.entries) ? data.entries : [];
      assertRegistrationShape(candidates, eventData, { direct: true });
      const existing = registrationIdentityNames([...drivers, ...pending]);
      const names = candidates.map((entry) => normalizeName(entry.name));
      const candidateIdentities = registrationIdentityNames(candidates);
      if (!names.length || names.some((name) => !name) || [...candidateIdentities].some((name) => existing.has(name)) || new Set(names).size !== names.length) fail("already-exists", "A driver with this name is already registered or pending review.");
      candidates.forEach((entry) => drivers.push(newDriver(entry, drivers.length + 1)));
      if (eventData.bracket?.mainBracket?.rounds?.length) eventData.bracket = null;
    } else {
      const entryId = safeText(data.entryId, 180);
      const target = pending.find((entry) => entry.id === entryId);
      if (!target) fail("not-found", "This pending registration no longer exists.");
      const groupId = target.registrationGroupId || target.teamRegistrationId || target.id;
      const group = pending.filter((entry) => (entry.registrationGroupId || entry.teamRegistrationId || entry.id) === groupId);
      const groupIds = new Set(group.map((entry) => entry.id));
      if (operation === "approve") {
        assertRegistrationShape(group, eventData, { existing: true });
        if (group.some((entry) => !entry.checkedInAt)) fail("failed-precondition", "Venue check-in is required before approval.");
        if (group.some((entry) => entry.rejectedAt)) fail("failed-precondition", "This registration is rejected and cannot be approved.");
        if (group.some((entry) => entry.needsReviewAt)) fail("failed-precondition", "This registration still needs review.");
        const remainingPending = pending.filter((entry) => !groupIds.has(entry.id));
        const existing = registrationIdentityNames([...drivers, ...remainingPending]);
        const candidateIdentities = registrationIdentityNames(group);
        if ([...candidateIdentities].some((name) => existing.has(name))) fail("already-exists", "A matching driver or team is already registered or pending review.");
        const approvedDrivers = buildApprovedDrivers(group, drivers, eventData, data.markPaid === true);
        drivers.push(...approvedDrivers);
        pending = pending.filter((entry) => !groupIds.has(entry.id));
        eventData.latestApprovalToast = {
          id: `${approvedDrivers[0].id}:${new Date().toISOString()}`,
          name: group.length > 1 ? `${target.teamName || target.name} (${group.length} drivers)` : approvedDrivers[0].name,
          reg: approvedDrivers[0].reg,
          approvedAt: approvedDrivers[0].approvedToRosterAt || new Date().toISOString(),
        };
        if (eventData.bracket?.mainBracket?.rounds?.length) eventData.bracket = null;
      } else if (operation === "remove") {
        pending = pending.filter((entry) => !groupIds.has(entry.id));
      } else {
        const now = new Date().toISOString();
        pending = pending.map((entry) => {
          if (!groupIds.has(entry.id)) return entry;
          if (operation === "markPaid") return { ...entry, paid: data.paid !== false, paidAt: data.paid === false ? null : now, updatedAt: now };
          if (operation === "needsReview") return { ...entry, needsReviewAt: now, reviewReason: safeText(data.reason, 300), rejectedAt: null, rejectedReason: "", updatedAt: now };
          if (operation === "reject") return { ...entry, rejectedAt: now, rejectedReason: safeText(data.reason, 300), needsReviewAt: null, reviewReason: "", updatedAt: now };
          if (operation === "resetArrival") return { ...entry, arrived: false, arrivedAt: null, checkedInAt: null, arrivalSource: "", checkedInDistanceMeters: null, updatedAt: now };
          return entry;
        });
      }
    }
    const syncStamp = nextServerSyncStamp(eventData.syncStamp);
    const next = { ...eventData, drivers, pendingRegistrations: pending, updatedAt: new Date().toISOString(), syncStamp };
    transaction.set(document, next);
    transaction.set(directoryRef(appId), { events: { [eventId]: sanitizeEventMeta(next, next) }, syncStamp }, { merge: true });
    response = { ok: true, eventPayload: next, syncStamp };
  });
  return response;
}

async function spectatorArrival(request) {
  const auth = requireAuth(request);
  const data = request.data || {};
  const appId = requireAppId(data.appId);
  const eventId = requireEventId(data.eventId);
  const deviceToken = requireRegistrationDeviceToken(data.deviceToken);
  let response;
  await db.runTransaction(async (transaction) => {
    const document = eventRef(appId, eventId);
    const bindingRef = registrationDeviceRef(appId, deviceToken);
    const [snap, bindingSnap] = await Promise.all([transaction.get(document), transaction.get(bindingRef)]);
    if (!snap.exists) fail("not-found", "This event no longer exists.");
    if (!bindingSnap.exists || bindingSnap.data()?.uid !== auth.uid) fail("permission-denied", "This registration profile is not bound to the signed-in device. Ask event staff for help.");
    const eventData = snap.data() || {};
    const arrival = validateArrivalProof(eventData, data.arrivalProof, { required: true });
    const pending = clone(Array.isArray(eventData.pendingRegistrations) ? eventData.pendingRegistrations : []);
    const owned = pending.filter((entry) => entry.deviceToken === deviceToken);
    if (!owned.length) fail("not-found", "No pending registration belongs to this device.");
    const now = new Date().toISOString();
    const nextPending = pending.map((entry) => entry.deviceToken === deviceToken ? {
      ...entry,
      arrived: true,
      arrivedAt: now,
      checkedInAt: now,
      arrivalSource: arrival.source,
      checkedInDistanceMeters: arrival.distanceMeters,
      updatedAt: now,
    } : entry);
    const syncStamp = nextServerSyncStamp(eventData.syncStamp);
    const next = { ...eventData, pendingRegistrations: nextPending, updatedAt: now, syncStamp };
    transaction.update(bindingRef, { updatedAt: now });
    transaction.set(document, next);
    transaction.set(directoryRef(appId), { events: { [eventId]: sanitizeEventMeta(next, next) }, syncStamp }, { merge: true });
    response = { ok: true, eventPayload: next, syncStamp };
  });
  return response;
}

async function routeAction(request) {
  const action = String(request.data?.action || "");
  if (action === "authorizeAccess") return authorizeAccess(request);
  if (action === "revokeAccess") return revokeAccess(request);
  if (action === "manageRoleSecret") return manageRoleSecret(request);
  if (action === "commitEventSnapshot") return commitEventSnapshot(request);
  if (action === "createEvent") return createEvent(request);
  if (action === "setActiveSelection") return setActiveSelection(request);
  if (action === "restoreMissingEvent") return restoreMissingEvent(request);
  if (action === "repairHistoricalBracketUnavailable") return repairHistoricalBracketUnavailable(request);
  if (action === "deleteEvent") return deleteEvent(request);
  if (action === "claimJudgeRole") return claimJudgeRole(request);
  if (action === "submitJudgeQualifying") return submitJudgeQualifying(request);
  if (action === "submitJudgeVote") return submitJudgeCompetition(request, false);
  if (action === "submitJudgeScorecard") return submitJudgeCompetition(request, true);
  if (action === "adminCompetitionDecision") return adminCompetitionDecision(request);
  if (action === "submitSelfRegistration") return submitSelfRegistration(request);
  if (action === "adminRegistration") return adminRegistration(request);
  if (action === "spectatorArrival") return spectatorArrival(request);
  fail("invalid-argument", "Unknown Prodigy operation.");
}

exports.prodigyAction = onCall({
  region: "us-central1",
  maxInstances: 20,
  timeoutSeconds: 30,
  enforceAppCheck: false,
  secrets: [websiteAdminPassword],
}, routeAction);

exports.parseVoiceDeductions = parseVoiceDeductions;
exports.emailEventResultsSummary = emailEventResultsSummary;

exports._test = {
  activeJudgeRoles,
  hasEventRole,
  normalizeRole,
  publicRoleAccess,
  sanitizePublicEvent,
};
