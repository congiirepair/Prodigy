#!/usr/bin/env node
import admin from "firebase-admin";
import { TECH1DRIFT_ANNIVERSARY_CONFIG, buildTech1AnniversaryShell } from "../assets/js/config/specialEvents.js";

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

function usage() {
  return `
Usage:
  node scripts/init-tech1-anniversary.mjs --project <projectId> --app-id <appId> --event tech1drift-anniversary-may-30 --registration-open true --yes

Authentication:
  Use GOOGLE_APPLICATION_CREDENTIALS or Application Default Credentials.
  Never commit service account JSON files.

Safety:
  Omitting --yes performs a dry run.
`.trim();
}

function parseBoolean(value, label) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "true" || normalized === "open" || normalized === "1") return true;
  if (normalized === "false" || normalized === "closed" || normalized === "0") return false;
  throw new Error(`Missing or invalid --${label}. Use true/open or false/closed.`);
}

function assertSafeTarget(args) {
  const projectId = String(args.project || "").trim();
  const appId = String(args["app-id"] || args.appId || "").trim();
  const eventId = String(args.event || "").trim();
  if (!projectId) throw new Error("Missing --project <projectId>. Refusing to run without an explicit Firebase project.");
  if (!appId) throw new Error("Missing --app-id <appId>. Refusing to run without an explicit app id.");
  if (eventId !== TECH1DRIFT_ANNIVERSARY_CONFIG.eventId) {
    throw new Error(`Missing or wrong --event. Expected ${TECH1DRIFT_ANNIVERSARY_CONFIG.eventId}.`);
  }
  const projectLooksProd = /prod/i.test(projectId) || projectId === "prodigy-rc-competitions";
  const appLooksTest = /test/i.test(appId);
  if (projectLooksProd && appLooksTest && !args["allow-test-app-id"]) {
    throw new Error("Refusing to initialize a test-like appId in a production-looking project. Re-run with --allow-test-app-id only if this is intentional.");
  }
  return { projectId, appId, eventId };
}

function buildNextShell(existing = null, registrationOpen) {
  const existingStatus = String(existing?.bracketStatus || "");
  const bracketStatus = ["generated", "locked", "in_progress", "complete"].includes(existingStatus)
    ? existingStatus
    : "not_generated";
  return buildTech1AnniversaryShell({
    registrationOpen,
    bracketStatus,
    updatedAt: new Date().toISOString(),
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const { projectId, appId, eventId } = assertSafeTarget(args);
  const registrationOpen = parseBoolean(args["registration-open"], "registration-open");

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  });

  const db = admin.firestore();
  const path = `artifacts/${appId}/public/data/specialEvents/${eventId}`;
  const ref = db.doc(path);
  const snapshot = await ref.get();
  const existing = snapshot.exists ? snapshot.data() : null;
  const nextShell = buildNextShell(existing, registrationOpen);

  console.log(JSON.stringify({
    action: snapshot.exists ? "merge" : "create",
    projectId,
    appId,
    path,
    willPreserveSubcollections: ["registrations", "publicRegistrationIndex", "raffleTransactions", "brackets", "battleResults"],
    existingBracketStatus: existing?.bracketStatus || null,
    next: nextShell,
  }, null, 2));

  if (!args.yes) {
    throw new Error("Dry run only. Re-run with --yes to initialize the Tech 1 event shell.");
  }

  await ref.set(nextShell, { merge: true });
  console.log("Tech 1 Drift Anniversary event shell initialized. Existing registrations, raffle transactions, bracket, and battle results were not overwritten.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
