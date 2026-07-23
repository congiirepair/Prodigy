import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const RELEASE_PARAMETER = "v";
const RELEASE_TOKEN_LENGTH = 12;
const NORMALIZED_RELEASE_TOKEN = "__PRODIGY_ASSET_RELEASE__";
const TEXT_SOURCE_EXTENSIONS = new Set([".html", ".js", ".css"]);

export const MANAGED_ASSET_EXTENSIONS = Object.freeze([
  "js",
  "css",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "ico",
  "woff",
  "woff2",
  "otf",
  "ttf",
  "zip",
  "txt",
]);

export const KNOWN_MISSING_ASSET_PATHS = Object.freeze([
  "assets/rcdriftsync-logo-transparent.png",
  "assets/streamer/prodigy-event-complete.svg",
  "assets/streamer/prodigy-intermission.svg",
  "assets/streamer/prodigy-lower-third.svg",
  "assets/streamer/prodigy-starting-soon.svg",
  "assets/streamer/prodigy-streamer-quick-start.txt",
  "assets/streamer/prodigy-streamer-starter-pack.zip",
]);

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function createReferencePattern() {
  const extensions = MANAGED_ASSET_EXTENSIONS.join("|");
  return new RegExp(
    `(?:(?:\\.\\.\\/|\\.\\/|\\/assets\\/|assets\\/)[A-Za-z0-9_@%+.,~/-]+\\.(?:${extensions})|client-config\\.js)(?:\\?[^"'\\\`()\\s<>#]*)?(?:#[^"'\\\`()\\s<>]*)?`,
    "gi",
  );
}

function splitSpecifier(specifier) {
  const hashIndex = specifier.indexOf("#");
  const beforeHash = hashIndex >= 0 ? specifier.slice(0, hashIndex) : specifier;
  const fragment = hashIndex >= 0 ? specifier.slice(hashIndex) : "";
  const queryIndex = beforeHash.indexOf("?");
  return {
    pathname: queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash,
    query: queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : "",
    fragment,
  };
}

function isInsideExternalUrl(source, matchIndex) {
  const prefix = source.slice(Math.max(0, matchIndex - 512), matchIndex);
  const boundary = Math.max(
    prefix.lastIndexOf('"'),
    prefix.lastIndexOf("'"),
    prefix.lastIndexOf("`"),
    prefix.lastIndexOf("("),
    prefix.lastIndexOf(" "),
    prefix.lastIndexOf("\n"),
    prefix.lastIndexOf("\r"),
    prefix.lastIndexOf("\t"),
  );
  const currentTokenPrefix = prefix.slice(boundary + 1);
  return currentTokenPrefix.includes("://") || currentTokenPrefix.startsWith("//");
}

function resolveTargetPath(repoRoot, sourcePath, specifier) {
  const { pathname } = splitSpecifier(specifier);
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const absoluteTarget = decodedPath.startsWith("/")
    ? path.resolve(repoRoot, `.${decodedPath}`)
    : path.resolve(repoRoot, path.dirname(sourcePath), decodedPath);
  const relativeTarget = path.relative(repoRoot, absoluteTarget);
  if (!relativeTarget || relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) return null;
  return toPosixPath(relativeTarget);
}

function queryParts(specifier) {
  const { query } = splitSpecifier(specifier);
  return query ? query.split("&").filter(Boolean) : [];
}

export function getAssetVersion(specifier) {
  const versions = queryParts(specifier)
    .filter((part) => part.split("=", 1)[0] === RELEASE_PARAMETER)
    .map((part) => part.slice(part.indexOf("=") + 1));
  return versions.length === 1 ? versions[0] : null;
}

export function withAssetVersion(specifier, releaseToken) {
  const { pathname, query, fragment } = splitSpecifier(specifier);
  const retainedParts = query
    .split("&")
    .filter(Boolean)
    .filter((part) => part.split("=", 1)[0] !== RELEASE_PARAMETER);
  retainedParts.push(`${RELEASE_PARAMETER}=${releaseToken}`);
  return `${pathname}?${retainedParts.join("&")}${fragment}`;
}

export function findAssetReferences(source, sourcePath, repoRoot) {
  const references = [];
  for (const match of source.matchAll(createReferencePattern())) {
    if (isInsideExternalUrl(source, match.index)) continue;
    const specifier = match[0];
    const targetPath = resolveTargetPath(repoRoot, sourcePath, specifier);
    if (!targetPath) continue;
    references.push({
      sourcePath: toPosixPath(sourcePath),
      targetPath,
      specifier,
      start: match.index,
      end: match.index + specifier.length,
      targetExists: fs.existsSync(path.join(repoRoot, targetPath)),
    });
  }
  return references;
}

export function rewriteAssetReferences(source, sourcePath, repoRoot, releaseToken) {
  const references = findAssetReferences(source, sourcePath, repoRoot)
    .filter((reference) => reference.targetExists)
    .sort((left, right) => right.start - left.start);
  let rewritten = source;
  for (const reference of references) {
    rewritten = `${rewritten.slice(0, reference.start)}${withAssetVersion(reference.specifier, releaseToken)}${rewritten.slice(reference.end)}`;
  }
  return rewritten;
}

function isTextSource(filePath) {
  return TEXT_SOURCE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function collectAssetGraph(repoRoot = DEFAULT_REPO_ROOT, entryPath = "index.html") {
  const resolvedRoot = path.resolve(repoRoot);
  const normalizedEntry = toPosixPath(entryPath);
  const queue = [normalizedEntry];
  const files = new Map();
  const references = [];
  const missingReferences = [];

  while (queue.length) {
    const sourcePath = queue.shift();
    if (files.has(sourcePath)) continue;
    const absolutePath = path.join(resolvedRoot, sourcePath);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      throw new Error(`Asset graph entry does not exist: ${sourcePath}`);
    }
    const contents = fs.readFileSync(absolutePath);
    const text = isTextSource(sourcePath) ? contents.toString("utf8") : null;
    files.set(sourcePath, { path: sourcePath, contents, text });
    if (text == null) continue;

    for (const reference of findAssetReferences(text, sourcePath, resolvedRoot)) {
      references.push(reference);
      if (!reference.targetExists) {
        missingReferences.push(reference);
        continue;
      }
      if (!files.has(reference.targetPath) && !queue.includes(reference.targetPath)) {
        queue.push(reference.targetPath);
      }
    }
  }

  return {
    repoRoot: resolvedRoot,
    entryPath: normalizedEntry,
    files,
    references,
    missingReferences,
  };
}

export function computeAssetReleaseToken(graph, { overrides = new Map() } = {}) {
  const hash = crypto.createHash("sha256");
  hash.update("prodigy-first-party-assets-v1\0");
  for (const filePath of [...graph.files.keys()].sort()) {
    const file = graph.files.get(filePath);
    const override = overrides.get(filePath);
    const contents = override == null
      ? file.contents
      : (Buffer.isBuffer(override) ? override : Buffer.from(String(override)));
    const normalizedContents = isTextSource(filePath)
      ? Buffer.from(rewriteAssetReferences(
        contents.toString("utf8"),
        filePath,
        graph.repoRoot,
        NORMALIZED_RELEASE_TOKEN,
      ).replace(/\r\n?/g, "\n"))
      : contents;
    hash.update(filePath);
    hash.update("\0");
    hash.update(normalizedContents);
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, RELEASE_TOKEN_LENGTH);
}

function uniqueMissingPaths(references) {
  return [...new Set(references.map((reference) => reference.targetPath))].sort();
}

export function validateAssetRelease(graph, releaseToken = computeAssetReleaseToken(graph), {
  knownMissingAssetPaths = KNOWN_MISSING_ASSET_PATHS,
} = {}) {
  const errors = [];
  const knownMissing = new Set(knownMissingAssetPaths);
  const missingPaths = uniqueMissingPaths(graph.missingReferences);
  const unexpectedMissingPaths = missingPaths.filter((filePath) => !knownMissing.has(filePath));
  const resolvedKnownMissingPaths = [...knownMissing].filter((filePath) => !missingPaths.includes(filePath));

  for (const missingPath of unexpectedMissingPaths) {
    errors.push(`Missing first-party asset target: ${missingPath}`);
  }
  for (const reference of graph.references.filter((candidate) => candidate.targetExists)) {
    const version = getAssetVersion(reference.specifier);
    if (version !== releaseToken) {
      errors.push(
        `${reference.sourcePath} references ${reference.targetPath} with release ${version || "(none)"}; expected ${releaseToken}`,
      );
    }
  }

  return {
    releaseToken,
    errors,
    missingPaths,
    unexpectedMissingPaths,
    resolvedKnownMissingPaths,
  };
}

export function buildAssetRelease(repoRoot = DEFAULT_REPO_ROOT) {
  const graph = collectAssetGraph(repoRoot);
  const releaseToken = computeAssetReleaseToken(graph);
  return {
    graph,
    releaseToken,
    validation: validateAssetRelease(graph, releaseToken),
  };
}

export function applyAssetRelease(repoRoot = DEFAULT_REPO_ROOT) {
  const initial = buildAssetRelease(repoRoot);
  if (initial.validation.unexpectedMissingPaths.length) {
    throw new Error(initial.validation.errors.join("\n"));
  }

  const changedFiles = [];
  for (const [filePath, file] of initial.graph.files) {
    if (file.text == null) continue;
    const rewritten = rewriteAssetReferences(
      file.text,
      filePath,
      initial.graph.repoRoot,
      initial.releaseToken,
    );
    if (rewritten === file.text) continue;
    fs.writeFileSync(path.join(initial.graph.repoRoot, filePath), rewritten);
    changedFiles.push(filePath);
  }

  const final = buildAssetRelease(repoRoot);
  if (final.releaseToken !== initial.releaseToken) {
    throw new Error(`Asset release token was not stable: ${initial.releaseToken} -> ${final.releaseToken}`);
  }
  if (final.validation.errors.length) {
    throw new Error(final.validation.errors.join("\n"));
  }
  return {
    ...final,
    changedFiles: changedFiles.sort(),
  };
}

function printKnownMissing(validation) {
  if (!validation.missingPaths.length) return;
  console.warn(
    `Known missing legacy asset targets (${validation.missingPaths.length}): ${validation.missingPaths.join(", ")}`,
  );
}

function runCli() {
  const mode = process.argv[2] || "--check";
  if (!["--check", "--write"].includes(mode)) {
    throw new Error("Usage: node scripts/version-first-party-assets.mjs [--check|--write]");
  }

  if (mode === "--write") {
    const result = applyAssetRelease(DEFAULT_REPO_ROOT);
    console.log(
      `First-party asset release ${result.releaseToken} written to ${result.changedFiles.length} source files.`,
    );
    printKnownMissing(result.validation);
    return;
  }

  const result = buildAssetRelease(DEFAULT_REPO_ROOT);
  if (result.validation.errors.length) {
    for (const error of result.validation.errors) console.error(error);
    process.exitCode = 1;
    return;
  }
  console.log(
    `First-party asset release ${result.releaseToken} verified across ${result.graph.files.size} files and ${result.graph.references.filter((reference) => reference.targetExists).length} references.`,
  );
  printKnownMissing(result.validation);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  runCli();
}
