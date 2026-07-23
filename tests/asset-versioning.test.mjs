import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  KNOWN_MISSING_ASSET_PATHS,
  applyAssetRelease,
  buildAssetRelease,
  computeAssetReleaseToken,
  getAssetVersion,
  validateAssetRelease,
  withAssetVersion,
} from "../scripts/version-first-party-assets.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const release = buildAssetRelease(repoRoot);
assert.match(release.releaseToken, /^[0-9a-f]{12}$/);
assert.deepEqual(release.validation.errors, []);
assert.equal(computeAssetReleaseToken(release.graph), release.releaseToken);
const indexWithCrLf = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8")
  .replace(/\r\n?/g, "\n")
  .replace(/\n/g, "\r\n");
const indexWithLf = indexWithCrLf.replace(/\r\n/g, "\n");
assert.equal(
  computeAssetReleaseToken(release.graph, { overrides: new Map([["index.html", indexWithCrLf]]) }),
  computeAssetReleaseToken(release.graph, { overrides: new Map([["index.html", indexWithLf]]) }),
);
assert.notEqual(
  computeAssetReleaseToken(release.graph, {
    overrides: new Map([["index.html", `${indexWithLf}\n<!-- simulated next release -->\n`]]),
  }),
  release.releaseToken,
);

const expectedRuntimeFiles = [
  "index.html",
  "client-config.js",
  "assets/fonts/Ethnocentric-Regular.otf",
  "assets/js/event-selection-sync.js",
  "assets/js/historical-bracket.js",
  "assets/js/legacy-client-features.js",
  "assets/prodigy-rc-logo-transparent.png",
  "assets/prodigy-rc-logo-white-transparent.png",
  "assets/track-background.png",
];
for (const expectedFile of expectedRuntimeFiles) {
  assert.ok(release.graph.files.has(expectedFile), `Asset graph must include ${expectedFile}`);
}
assert.deepEqual(release.validation.missingPaths, [...KNOWN_MISSING_ASSET_PATHS].sort());

const resolvedReferences = release.graph.references.filter((reference) => reference.targetExists);
assert.ok(resolvedReferences.length > expectedRuntimeFiles.length);
for (const reference of resolvedReferences) {
  assert.equal(
    getAssetVersion(reference.specifier),
    release.releaseToken,
    `${reference.sourcePath} -> ${reference.targetPath}`,
  );
  assert.equal(fs.existsSync(path.join(repoRoot, reference.targetPath)), true);
}

const historicalModuleReference = resolvedReferences.find(
  (reference) => reference.sourcePath === "index.html"
    && reference.targetPath === "assets/js/historical-bracket.js",
);
assert.ok(historicalModuleReference);
const productionOrigin = "https://www.prodigyrccomp.com/";
const staleUnversionedUrl = new URL("./assets/js/historical-bracket.js", productionOrigin);
const currentVersionedUrl = new URL(historicalModuleReference.specifier, productionOrigin);
assert.notEqual(currentVersionedUrl.href, staleUnversionedUrl.href);
const simulatedLegacyCache = new Map([[staleUnversionedUrl.href, "old cached module"]]);
assert.equal(simulatedLegacyCache.has(currentVersionedUrl.href), false);

const historicalModuleContents = fs.readFileSync(
  path.join(repoRoot, "assets/js/historical-bracket.js"),
);
const simulatedNextToken = computeAssetReleaseToken(release.graph, {
  overrides: new Map([[
    "assets/js/historical-bracket.js",
    Buffer.concat([historicalModuleContents, Buffer.from("\n// simulated next release\n")]),
  ]]),
});
assert.notEqual(simulatedNextToken, release.releaseToken);
assert.notEqual(
  withAssetVersion(historicalModuleReference.specifier, simulatedNextToken),
  historicalModuleReference.specifier,
);

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prodigy-asset-release-"));
assert.equal(path.dirname(fixtureRoot), path.resolve(os.tmpdir()));
try {
  fs.mkdirSync(path.join(fixtureRoot, "assets", "nested"), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, "index.html"), `<!doctype html>
<link rel="stylesheet" href="./assets/styles.css">
<script type="module">
  import { result } from "./assets/entry.js";
  console.log(result);
</script>
<img src="./assets/badge.png?theme=dark#logo">
<script src="https://cdn.example.com/assets/external.js"></script>
<img src="data:image/png;base64,AAAA">
`);
  fs.writeFileSync(
    path.join(fixtureRoot, "assets", "entry.js"),
    'export { result } from "./nested/child.js";\n',
  );
  fs.writeFileSync(
    path.join(fixtureRoot, "assets", "nested", "child.js"),
    'import { leaf } from "./leaf.js";\nexport const result = leaf;\n',
  );
  fs.writeFileSync(
    path.join(fixtureRoot, "assets", "nested", "leaf.js"),
    'export const leaf = "release-a";\n',
  );
  fs.writeFileSync(
    path.join(fixtureRoot, "assets", "styles.css"),
    '@import "./theme.css";\n.badge { background-image: url("./badge.png"); }\n',
  );
  fs.writeFileSync(
    path.join(fixtureRoot, "assets", "theme.css"),
    '.theme { background-image: url("./badge.png"); }\n',
  );
  fs.writeFileSync(path.join(fixtureRoot, "assets", "badge.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const releaseA = applyAssetRelease(fixtureRoot);
  assert.deepEqual(releaseA.validation.errors, []);
  assert.ok(releaseA.changedFiles.includes("index.html"));
  assert.ok(releaseA.changedFiles.includes("assets/entry.js"));
  assert.ok(releaseA.changedFiles.includes("assets/nested/child.js"));
  assert.ok(releaseA.changedFiles.includes("assets/styles.css"));
  assert.ok(releaseA.changedFiles.includes("assets/theme.css"));
  for (const reference of releaseA.graph.references.filter((candidate) => candidate.targetExists)) {
    assert.equal(getAssetVersion(reference.specifier), releaseA.releaseToken);
  }

  const versionedIndexA = fs.readFileSync(path.join(fixtureRoot, "index.html"), "utf8");
  assert.match(versionedIndexA, /badge\.png\?theme=dark&v=[0-9a-f]{12}#logo/);
  assert.match(versionedIndexA, /https:\/\/cdn\.example\.com\/assets\/external\.js/);
  assert.match(versionedIndexA, /data:image\/png;base64,AAAA/);
  const normalizedTokenOverride = versionedIndexA.replaceAll(releaseA.releaseToken, "000000000000");
  assert.equal(
    computeAssetReleaseToken(releaseA.graph, {
      overrides: new Map([["index.html", normalizedTokenOverride]]),
    }),
    releaseA.releaseToken,
  );

  const idempotentRelease = applyAssetRelease(fixtureRoot);
  assert.equal(idempotentRelease.releaseToken, releaseA.releaseToken);
  assert.deepEqual(idempotentRelease.changedFiles, []);

  const entryPath = path.join(fixtureRoot, "assets", "entry.js");
  const versionedEntry = fs.readFileSync(entryPath, "utf8");
  fs.writeFileSync(entryPath, versionedEntry.replace(/\?v=[0-9a-f]{12}/, ""));
  const mixedRelease = buildAssetRelease(fixtureRoot);
  assert.ok(mixedRelease.validation.errors.some((error) => error.includes("assets/entry.js")));
  applyAssetRelease(fixtureRoot);

  const releaseACache = new Map(
    [...new Set(
      releaseA.graph.references
        .filter((reference) => reference.targetExists)
        .map((reference) => `/${reference.targetPath}?v=${releaseA.releaseToken}`),
    )].map((url) => [url, "release-a"]),
  );
  fs.writeFileSync(
    path.join(fixtureRoot, "assets", "nested", "leaf.js"),
    'export const leaf = "release-b";\n',
  );
  const releaseB = applyAssetRelease(fixtureRoot);
  assert.notEqual(releaseB.releaseToken, releaseA.releaseToken);
  for (const reference of releaseB.graph.references.filter((candidate) => candidate.targetExists)) {
    assert.equal(getAssetVersion(reference.specifier), releaseB.releaseToken);
    assert.equal(
      releaseACache.has(`/${reference.targetPath}?v=${releaseB.releaseToken}`),
      false,
    );
  }
  assert.deepEqual(validateAssetRelease(releaseB.graph).errors, []);
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log("first-party asset versioning regression tests passed");
