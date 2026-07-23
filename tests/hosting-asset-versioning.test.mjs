import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  KNOWN_MISSING_ASSET_PATHS,
  buildAssetRelease,
} from "../scripts/version-first-party-assets.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, "firebase.json"), "utf8"));
const hosting = firebaseConfig.hosting;
const baseUrl = process.env.PRODIGY_HOSTING_TEST_URL || "http://127.0.0.1:5000";

assert.equal(hosting.public, ".");
assert.deepEqual(hosting.predeploy, ["npm run assets:check"]);
for (const ignoredPath of [
  ".git/**",
  ".claude/**",
  ".agents/**",
  ".codex/**",
  ".tmp/**",
  ".qa-streamer/**",
  "qa-artifacts/**",
  "*.log",
  "**/*.log",
]) {
  assert.ok(hosting.ignore.includes(ignoredPath), `Hosting must ignore ${ignoredPath}`);
}
assert.deepEqual(hosting.rewrites.at(-1), { source: "**", destination: "/index.html" });
const rootCacheRule = hosting.headers.find((rule) => rule.source === "/");
const indexCacheRule = hosting.headers.find((rule) => rule.source === "/index.html");
const immutableCacheRule = hosting.headers.find((rule) => rule.source.includes("png|jpg|jpeg"));
assert.match(
  rootCacheRule.headers.find((header) => header.key === "Cache-Control").value,
  /no-cache, no-store, must-revalidate/,
);
assert.match(
  indexCacheRule.headers.find((header) => header.key === "Cache-Control").value,
  /no-cache, no-store, must-revalidate/,
);
assert.equal(
  immutableCacheRule.headers.find((header) => header.key === "Cache-Control").value,
  "public, max-age=31536000, immutable",
);

const release = buildAssetRelease(repoRoot);
assert.deepEqual(release.validation.errors, []);
const indexBytes = fs.readFileSync(path.join(repoRoot, "index.html"));
const indexHash = sha256(indexBytes);

const rootResponse = await fetch(new URL("/", baseUrl));
assert.equal(rootResponse.status, 200);
const rootBytes = Buffer.from(await rootResponse.arrayBuffer());
assert.equal(sha256(rootBytes), indexHash);

const indexResponse = await fetch(new URL("/index.html", baseUrl));
assert.equal(indexResponse.status, 200);
const servedIndex = await indexResponse.text();
assert.match(servedIndex, new RegExp(`\\?v=${release.releaseToken}`));

const rewriteResponse = await fetch(new URL("/asset-versioning/spa-rewrite-check", baseUrl));
assert.equal(rewriteResponse.status, 200);
assert.match(rewriteResponse.headers.get("content-type") || "", /text\/html/);
assert.equal(sha256(Buffer.from(await rewriteResponse.arrayBuffer())), indexHash);

const uniqueTargets = [...new Set(
  release.graph.references
    .filter((reference) => reference.targetExists)
    .map((reference) => reference.targetPath),
)].sort();

for (const targetPath of uniqueTargets) {
  const localBytes = fs.readFileSync(path.join(repoRoot, targetPath));
  const requestPath = `/${targetPath}?v=${release.releaseToken}`;
  const productionUrl = new URL(requestPath, "https://www.prodigyrccomp.com/");
  const localUrl = new URL(requestPath, baseUrl);
  assert.equal(localUrl.pathname, productionUrl.pathname);
  assert.equal(localUrl.search, productionUrl.search);

  const response = await fetch(localUrl);
  assert.equal(response.status, 200, targetPath);
  assert.doesNotMatch(response.headers.get("content-type") || "", /text\/html/, targetPath);
  const servedBytes = Buffer.from(await response.arrayBuffer());
  assert.equal(sha256(servedBytes), sha256(localBytes), targetPath);
}

for (const missingPath of KNOWN_MISSING_ASSET_PATHS) {
  const response = await fetch(new URL(`/${missingPath}`, baseUrl));
  assert.equal(response.status, 200, missingPath);
  assert.match(response.headers.get("content-type") || "", /text\/html/, missingPath);
  assert.equal(
    sha256(Buffer.from(await response.arrayBuffer())),
    indexHash,
    `${missingPath} must remain classified as a missing target, not a valid asset`,
  );
}

console.log(
  `Firebase Hosting asset URL regression tests passed (${uniqueTargets.length} versioned targets).`,
);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
