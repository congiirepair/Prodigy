#!/usr/bin/env node
import admin from "firebase-admin";

const ROLE_ALIASES = new Map([
  ["owner", "owner"],
  ["websiteadmin", "websiteAdmin"],
  ["website-admin", "websiteAdmin"],
  ["eventadmin", "eventAdmin"],
  ["event-admin", "eventAdmin"],
  ["admin", "eventAdmin"],
  ["judge", "judge"],
  ["judge1", "j1"],
  ["judge2", "j2"],
  ["judge3", "j3"],
  ["j1", "j1"],
  ["j2", "j2"],
  ["j3", "j3"],
  ["stream", "streamOperator"],
  ["streamer", "streamOperator"],
  ["streamoperator", "streamOperator"],
  ["stream-operator", "streamOperator"],
]);

const GLOBAL_ROLES = new Set(["owner", "websiteAdmin"]);
const EVENT_ROLES = new Set(["eventAdmin", "j1", "j2", "j3", "judge", "streamOperator"]);

function parseArgs(argv) {
  const parsed = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      parsed._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function normalizeRole(value) {
  const raw = String(value || "").trim();
  const normalized = ROLE_ALIASES.get(raw.toLowerCase());
  if (!normalized) {
    throw new Error(`Unsupported role "${raw}". Use owner, websiteAdmin, eventAdmin, judge1, judge2, judge3, or streamOperator.`);
  }
  return normalized;
}

function usage() {
  return `
Usage:
  node scripts/manage-claims.mjs list (--uid <uid> | --email <email>) --project <projectId>
  node scripts/manage-claims.mjs set (--uid <uid> | --email <email>) --role <role> [--event <eventId>] --project <projectId> --yes
  node scripts/manage-claims.mjs revoke (--uid <uid> | --email <email>) --role <role> [--event <eventId>] --project <projectId> --yes

Authentication:
  Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path, or use Application Default Credentials.
  Never commit service account JSON files.
`.trim();
}

function ensureProjectId(args) {
  const projectId = String(args.project || "").trim();
  if (!projectId) {
    throw new Error("Missing --project <projectId>. Refusing to run without an explicit Firebase project.");
  }
  return projectId;
}

function getRequestedUid(args) {
  const uid = String(args.uid || "").trim();
  return uid || "";
}

function getRequestedEmail(args) {
  const email = String(args.email || "").trim();
  return email || "";
}

function ensureSingleUserSelector(args) {
  const uid = getRequestedUid(args);
  const email = getRequestedEmail(args);
  if (!uid && !email) throw new Error("Missing --uid <uid> or --email <email>.");
  if (uid && email) throw new Error("Use either --uid <uid> or --email <email>, not both.");
  return { uid, email };
}

function cloneClaims(claims = {}) {
  return JSON.parse(JSON.stringify(claims || {}));
}

function getRolesList(claims) {
  return Array.isArray(claims.roles) ? [...new Set(claims.roles.map(String))] : [];
}

function setRole(claims, role, eventId) {
  const next = cloneClaims(claims);
  const roles = new Set(getRolesList(next));
  if (GLOBAL_ROLES.has(role) && !eventId) {
    roles.add(role);
    next[role] = true;
  } else {
    if (!eventId) {
      throw new Error(`Role "${role}" requires --event <eventId> unless it is owner or websiteAdmin.`);
    }
    if (!EVENT_ROLES.has(role)) {
      throw new Error(`Role "${role}" is not valid as an event-scoped role.`);
    }
    next.eventRoles = next.eventRoles && typeof next.eventRoles === "object" ? next.eventRoles : {};
    const eventRoles = new Set(Array.isArray(next.eventRoles[eventId]) ? next.eventRoles[eventId].map(String) : []);
    eventRoles.add(role);
    next.eventRoles[eventId] = [...eventRoles].sort();
  }
  next.roles = [...roles].sort();
  return next;
}

function revokeRole(claims, role, eventId) {
  const next = cloneClaims(claims);
  const roles = new Set(getRolesList(next));
  if (GLOBAL_ROLES.has(role) && !eventId) {
    roles.delete(role);
    delete next[role];
  } else {
    if (!eventId) {
      throw new Error(`Revoking event role "${role}" requires --event <eventId>.`);
    }
    const eventRoles = new Set(Array.isArray(next.eventRoles?.[eventId]) ? next.eventRoles[eventId].map(String) : []);
    eventRoles.delete(role);
    if (eventRoles.size) {
      next.eventRoles[eventId] = [...eventRoles].sort();
    } else if (next.eventRoles) {
      delete next.eventRoles[eventId];
    }
    if (next.eventRoles && !Object.keys(next.eventRoles).length) delete next.eventRoles;
  }
  next.roles = [...roles].sort();
  if (!next.roles.length) delete next.roles;
  return next;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command || args.help) {
    console.log(usage());
    return;
  }
  const projectId = ensureProjectId(args);
  const userSelector = ensureSingleUserSelector(args);
  if (!["list", "set", "revoke"].includes(command)) {
    throw new Error(`Unknown command "${command}".\n${usage()}`);
  }
  const role = command === "list" ? null : normalizeRole(args.role);
  const eventId = args.event ? String(args.event).trim() : "";

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  });

  const user = userSelector.email
    ? await admin.auth().getUserByEmail(userSelector.email)
    : await admin.auth().getUser(userSelector.uid);
  const uid = user.uid;
  const currentClaims = user.customClaims || {};

  if (command === "list") {
    console.log(JSON.stringify({ uid, email: user.email || null, projectId, claims: currentClaims }, null, 2));
    return;
  }

  const nextClaims = command === "set"
    ? setRole(currentClaims, role, eventId)
    : revokeRole(currentClaims, role, eventId);

  console.log(JSON.stringify({
    command,
    uid,
    email: user.email || null,
    projectId,
    role,
    eventId: eventId || null,
    before: currentClaims,
    after: nextClaims,
  }, null, 2));

  if (!args.yes) {
    throw new Error("Dry run only. Re-run with --yes to apply this claim change.");
  }

  await admin.auth().setCustomUserClaims(uid, nextClaims);
  console.log("Custom claims updated. The user must refresh their ID token or sign out and back in.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
