#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const args = new Set(process.argv.slice(2));
const skipRulesDryRun = args.has("--skip-rules-dry-run");
const projectArg = process.argv.find((arg) => arg.startsWith("--project="));
const projectId = projectArg?.split("=").slice(1).join("=") || process.env.PRODIGY_FIREBASE_PROJECT_ID || "prodigy-rc-competitions";

const requiredScripts = [
  "test:unit",
  "test:e2e",
  "test:mobile",
  "test:rules",
  "claims:list",
  "claims:set",
  "claims:revoke",
];
const requiredDocs = [
  "docs/PRODUCTION_DEPLOYMENT.md",
  "docs/SECURITY_CHECKLIST.md",
  "docs/SCHEMA_V2.md",
];
const skippedDirs = new Set([".git", "node_modules", "qa-artifacts", ".firebase", ".emulator-data", "dist", "build"]);
const textExtensions = new Set([
  ".cjs",
  ".css",
  ".env",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".rules",
  ".toml",
  ".txt",
  ".yml",
  ".yaml",
]);
const serviceAccountPattern = new RegExp([
  `"type"\\s*:\\s*"${"service"}_${"account"}"`,
  `-----BEGIN ${"PRIVATE KEY"}-----`,
  `"${"private"}_${"key"}"\\s*:`,
].join("|"), "i");
const legacyPasswordPattern = new RegExp(`(@${"CBo"}|prodigy_${"judge"}|prodigy_${"event"}123)`, "i");

const results = [];

function record(status, label, detail = "") {
  results.push({ status, label, detail });
}

function run(command, commandArgs, options = {}) {
  return spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    ...options,
  });
}

function runCli(command, commandArgs, options = {}) {
  if (process.platform === "win32") {
    return run("cmd.exe", ["/d", "/s", "/c", command, ...commandArgs], options);
  }
  return run(command, commandArgs, options);
}

function versionMajor(versionText) {
  const match = String(versionText || "").match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  return match ? Number(match[1]) : null;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function walkFiles(dir = repoRoot, list = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skippedDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, list);
    } else {
      list.push(fullPath);
    }
  }
  return list;
}

function getRepoFiles() {
  const gitFiles = run("git", ["ls-files", "--cached", "--others", "--exclude-standard"]);
  if (gitFiles.status === 0 && gitFiles.stdout.trim()) {
    return gitFiles.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((file) => path.join(repoRoot, file))
      .filter((file) => fs.existsSync(file));
  }
  return walkFiles();
}

function relative(fullPath) {
  return path.relative(repoRoot, fullPath).replaceAll(path.sep, "/");
}

function isProbablyTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath);
  return textExtensions.has(ext) || basename.startsWith(".env") || [".firebaserc", ".gitignore"].includes(basename);
}

function readTextIfPossible(filePath) {
  if (!isProbablyTextFile(filePath)) return "";
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function checkNode() {
  const nodeVersion = process.version;
  const major = versionMajor(nodeVersion);
  if (major >= 22) {
    record("ok", "Node version", `${nodeVersion} (matches CI/runtime target)`);
  } else if (major >= 20) {
    record("warn", "Node version", `${nodeVersion}; CI uses Node 22`);
  } else {
    record("fail", "Node version", `${nodeVersion}; Node 20+ required, Node 22 recommended`);
  }
}

function checkJava() {
  const java = run("java", ["-version"]);
  const output = `${java.stdout || ""}${java.stderr || ""}`.trim();
  const quoted = output.match(/version\s+"([^"]+)"/)?.[1] || output.match(/openjdk\s+version\s+"([^"]+)"/)?.[1] || "";
  const major = quoted.startsWith("1.") ? Number(quoted.split(".")[1]) : versionMajor(quoted);
  if (!output) {
    record("fail", "Java/JDK", "Java not found; JDK 21+ is required for Firestore emulator rules tests");
  } else if (major >= 21) {
    record("ok", "Java/JDK", quoted || output.split(/\r?\n/)[0]);
  } else {
    record("fail", "Java/JDK", `${quoted || output.split(/\r?\n/)[0]}; JDK 21+ is required for npm run test:rules`);
  }
}

function checkPackageScripts() {
  const pkg = readJson("package.json");
  const missing = requiredScripts.filter((script) => !pkg.scripts?.[script]);
  if (missing.length) {
    record("fail", "Required npm scripts", `Missing: ${missing.join(", ")}`);
  } else {
    record("ok", "Required npm scripts", requiredScripts.join(", "));
  }
}

function checkDocs() {
  const missing = requiredDocs.filter((docPath) => !fs.existsSync(path.join(repoRoot, docPath)));
  if (missing.length) record("fail", "Required release docs", `Missing: ${missing.join(", ")}`);
  else record("ok", "Required release docs", requiredDocs.join(", "));
}

function checkRulesFile() {
  const rulesPath = path.join(repoRoot, "firestore.rules");
  if (!fs.existsSync(rulesPath)) {
    record("fail", "Firestore rules", "firestore.rules is missing");
    return;
  }
  record("ok", "Firestore rules", "firestore.rules exists");
  if (skipRulesDryRun) {
    record("warn", "Rules dry-run", "Skipped by --skip-rules-dry-run");
    return;
  }
  const dryRun = runCli("firebase", ["deploy", "--only", "firestore:rules", "--dry-run", "--project", projectId], { timeout: 120_000 });
  const output = `${dryRun.stdout || ""}${dryRun.stderr || ""}`;
  if (dryRun.status === 0 && /compiled successfully/i.test(output)) {
    record("ok", "Rules dry-run", `Compiled successfully for ${projectId}`);
  } else {
    record("fail", "Rules dry-run", `Dry-run failed for ${projectId}; run firebase deploy --only firestore:rules --dry-run --project ${projectId}`);
  }
}

function checkSecrets(files) {
  const serviceAccountFiles = [];
  const envFiles = [];
  const possibleSecretFiles = [];

  for (const file of files) {
    const name = path.basename(file).toLowerCase();
    const rel = relative(file);
    if (rel === "scripts/preflight.mjs") continue;
    if (name.startsWith(".env") && name !== ".env.example") {
      envFiles.push(rel);
    }

    const text = readTextIfPossible(file);
    if (!text) continue;
    if (serviceAccountPattern.test(text)) {
      serviceAccountFiles.push(rel);
    }
    if (legacyPasswordPattern.test(text)) {
      possibleSecretFiles.push(rel);
    }
  }

  if (serviceAccountFiles.length) {
    record("fail", "Service account files", `Possible service-account/private-key material in: ${serviceAccountFiles.join(", ")}`);
  } else {
    record("ok", "Service account files", "No service-account JSON/private key material found outside ignored folders");
  }

  if (envFiles.length) {
    record("fail", ".env files", `Do not commit local env files: ${envFiles.join(", ")}`);
  } else {
    record("ok", ".env files", "No committed/local .env files found except .env.example");
  }

  if (possibleSecretFiles.length) {
    record("fail", "Legacy role password strings", `Remove old hardcoded role passwords from: ${possibleSecretFiles.join(", ")}`);
  } else {
    record("ok", "Legacy role password strings", "No known legacy role password strings found");
  }
}

function checkProductionAppIds(files) {
  const candidates = [];
  for (const file of files) {
    const rel = relative(file);
    if (!["client-config.js", ".firebaserc", "docs/client-config.staging.example.js"].includes(rel)) continue;
    const text = readTextIfPossible(file);
    const matches = [...text.matchAll(/(?:projectId|appId)\s*["']?\s*[:=]\s*["']([^"']+)["']/g)].map((match) => match[1]);
    matches.forEach((value) => {
      if (/test/i.test(value) && !/REPLACE_WITH_STAGING/i.test(value)) candidates.push(`${rel}: ${value}`);
    });
  }
  if (candidates.length) {
    record("fail", "Production app/project IDs", `Dangerous test-like IDs found: ${candidates.join(", ")}`);
  } else {
    record("ok", "Production app/project IDs", "No production appId/projectId contains test");
  }
}

function checkRulesTestAttempt() {
  const javaResult = results.find((entry) => entry.label === "Java/JDK");
  if (javaResult?.status === "ok") {
    record("ok", "Rules test readiness", "JDK 21+ available; npm run test:rules can be attempted");
  } else {
    record("fail", "Rules test readiness", "JDK 21+ unavailable; npm run test:rules will not run locally");
  }
}

function printResults() {
  const icon = { ok: "OK", warn: "WARN", fail: "FAIL" };
  console.log("Prodigy production preflight");
  console.log("============================");
  for (const result of results) {
    console.log(`[${icon[result.status]}] ${result.label}${result.detail ? ` - ${result.detail}` : ""}`);
  }
  const failures = results.filter((result) => result.status === "fail");
  const warnings = results.filter((result) => result.status === "warn");
  console.log("");
  console.log(`${failures.length} failure(s), ${warnings.length} warning(s)`);
  if (failures.length) process.exit(1);
}

const files = getRepoFiles();
checkNode();
checkJava();
checkPackageScripts();
checkDocs();
checkSecrets(files);
checkProductionAppIds(files);
checkRulesFile();
checkRulesTestAttempt();
printResults();
