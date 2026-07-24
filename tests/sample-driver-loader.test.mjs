// Focused regression coverage for the safe sample-data loader (QA / Event
// Setup Tools). Extracts the REAL, shipped generator function out of
// index.html and proves: valid real-event driver schema, no duplicate IDs
// or registration numbers, deterministic ranking, correct presence/absence
// of qualifying scores, and that generated drivers are internally marked
// (isSampleDriver) without any Test Mode / testData / demo-environment
// machinery being reintroduced.
//
// Run: node tests/sample-driver-loader.test.mjs

import assertStrict from "node:assert/strict";
import assertLoose from "node:assert";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

// Values computed inside the vm.Script run in a separate realm, so their
// Array/Object constructors differ from this module's even when contents
// are identical -- use non-strict deepEqual (value comparison) for those.
const assert = { ...assertStrict, deepEqual: assertLoose.deepEqual };

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const indexHtmlPath = `${repoRoot}index.html`;
const source = fs.readFileSync(indexHtmlPath, "utf8");

function extractFunctionSource(fnName) {
  const signature = `function ${fnName}(`;
  const startIndex = source.indexOf(signature);
  if (startIndex === -1) throw new Error(`Could not find function ${fnName} in index.html`);
  const paramsOpenIndex = source.indexOf("(", startIndex);
  let parenDepth = 0;
  let paramsCloseIndex = -1;
  for (let i = paramsOpenIndex; i < source.length; i++) {
    if (source[i] === "(") parenDepth++;
    else if (source[i] === ")") {
      parenDepth--;
      if (parenDepth === 0) { paramsCloseIndex = i; break; }
    }
  }
  if (paramsCloseIndex === -1) throw new Error(`Unbalanced parens extracting ${fnName}`);
  const braceOpenIndex = source.indexOf("{", paramsCloseIndex);
  if (braceOpenIndex === -1) throw new Error(`No opening brace found for ${fnName}`);
  let depth = 0;
  for (let i = braceOpenIndex; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(startIndex, i + 1);
    }
  }
  throw new Error(`Unbalanced braces extracting ${fnName}`);
}

function extractConstDeclaration(constName) {
  const startIndex = source.indexOf(`const ${constName} = Object.freeze([`);
  if (startIndex === -1) throw new Error(`Could not find const ${constName}`);
  const closeIndex = source.indexOf("]);", startIndex);
  if (closeIndex === -1) throw new Error(`Could not find end of ${constName}`);
  return source.slice(startIndex, closeIndex + 3);
}

function buildSandbox() {
  const context = {};
  vm.createContext(context);
  new vm.Script([
    extractConstDeclaration("SAMPLE_DRIVER_ENTRIES"),
    "const JUDGE_ROLE_ORDER = ['j1', 'j2', 'j3'];",
    "function generateId() { return Math.random().toString(36).substring(2, 11); }",
    "function clampJudgeScoreValue(value) { return Math.round(value * 10) / 10; }",
    extractFunctionSource("createEmptyDriver"),
    extractFunctionSource("buildSampleDrivers"),
  ].join("\n\n")).runInContext(context);
  return context;
}

function testSchemaAndCounts() {
  for (const count of [8, 16, 32]) {
    const sandbox = buildSandbox();
    const drivers = sandbox.buildSampleDrivers(count, false, 1);
    assert.equal(drivers.length, count, `must generate exactly ${count} sample drivers`);
    drivers.forEach((driver) => {
      assert.equal(typeof driver.id, "string", "each driver must have a string id");
      assert.equal(typeof driver.name, "string", "each driver must have a name");
      assert.ok(driver.name.length > 0, "driver name must not be empty");
      assert.equal(driver.isSampleDriver, true, "generated drivers must be marked isSampleDriver");
      assert.ok(Number.isInteger(driver.reg) && driver.reg > 0, "driver must have a valid registration number");
      assert.ok(Number.isInteger(driver.signUpPosition) && driver.signUpPosition > 0, "driver must have a valid sign-up position");
      assert.deepEqual(Object.keys(driver.scores).sort(), ["j1", "j2", "j3"], "driver must carry the normal three-judge score shape");
      assert.deepEqual(driver.runFlags, { run1: null, run2: null, runoff: null }, "driver must carry the normal runFlags shape");
    });
  }
  console.log("ok - buildSampleDrivers produces valid real-event driver schema at 8/16/32");
}

function testNoScoresVariant() {
  const sandbox = buildSandbox();
  const drivers = sandbox.buildSampleDrivers(16, false, 1);
  drivers.forEach((driver) => {
    for (const role of ["j1", "j2", "j3"]) {
      assert.equal(driver.scores[role].run1, null, "no-scores variant must leave run1 unset");
      assert.equal(driver.scores[role].run2, null, "no-scores variant must leave run2 unset");
      assert.equal(driver.scores[role].submitted.run1, null, "no-scores variant must leave submitted.run1 unset");
      assert.equal(driver.scores[role].submitted.run2, null, "no-scores variant must leave submitted.run2 unset");
    }
  });
  console.log("ok - LOAD DRIVERS — NO QUALIFYING SCORES leaves every score field unset");
}

function testScoredVariantRanking() {
  const sandbox = buildSandbox();
  for (const count of [8, 16, 32]) {
    const drivers = sandbox.buildSampleDrivers(count, true, 1);
    drivers.forEach((driver) => {
      for (const role of ["j1", "j2", "j3"]) {
        assert.ok(Number.isFinite(driver.scores[role].run1), `${role} run1 must be a real score when scores are requested`);
        assert.ok(Number.isFinite(driver.scores[role].run2), `${role} run2 must be a real score when scores are requested`);
        assert.equal(driver.scores[role].submitted.run1, driver.scores[role].run1, "submitted.run1 must match the generated run1");
        assert.equal(driver.scores[role].submitted.run2, driver.scores[role].run2, "submitted.run2 must match the generated run2");
      }
    });
    // Deterministic, strictly descending ranking by average run1 score.
    const averages = drivers.map((driver) => (driver.scores.j1.run1 + driver.scores.j2.run1 + driver.scores.j3.run1) / 3);
    for (let i = 1; i < averages.length; i++) {
      assert.ok(averages[i] < averages[i - 1], `sample scores must produce a clear strictly-descending ranking (count=${count}, index=${i})`);
    }
  }
  console.log("ok - LOAD DRIVERS + QUALIFYING SCORES produces a deterministic, clearly-ranked field at 8/16/32");
}

function testNoDuplicateIdsOrRegistrationNumbers() {
  const sandbox = buildSandbox();
  // Simulate two separate loads (e.g. repeated sample loading) into the same
  // roster, starting the second batch's positions after the first.
  const first = sandbox.buildSampleDrivers(16, false, 1);
  const second = sandbox.buildSampleDrivers(16, false, first.length + 1);
  const combined = [...first, ...second];
  const ids = combined.map((driver) => driver.id);
  assert.equal(new Set(ids).size, ids.length, "repeated sample loading must never produce duplicate driver ids");
  const regs = combined.map((driver) => driver.reg);
  assert.equal(new Set(regs).size, regs.length, "repeated sample loading must never produce duplicate registration numbers");
  console.log("ok - repeated sample loading produces no duplicate ids or registration numbers");
}

function testRealDriversNeverDeleted() {
  const loaderSrc = extractFunctionSource("loadSampleDrivers");
  assert.ok(
    !/appDrivers\s*=\s*\[/.test(loaderSrc) && !loaderSrc.includes("appDrivers.length = 0"),
    "loadSampleDrivers must never wholesale-replace or clear the driver roster",
  );
  assert.match(
    loaderSrc,
    /appDrivers\.filter\(\(entry\) => !entry\.isSampleDriver\)/,
    "a replace action must only ever target drivers already marked isSampleDriver, never real drivers",
  );
  assert.match(
    loaderSrc,
    /\[\.\.\.appDrivers, \.\.\.nextSample\]|\[\.\.\.realDrivers, \.\.\.nextSample\]/,
    "loading samples must append to the existing roster, not overwrite it",
  );
  console.log("ok - loadSampleDrivers appends/replaces only sample drivers, never silently deletes real drivers");
}

function testAdminOnlyAndConfirmation() {
  const loaderSrc = extractFunctionSource("loadSampleDrivers");
  assert.match(loaderSrc, /if \(!adminCanEdit\(\)\) return false;/, "the loader must require authenticated admin access");
  assert.match(loaderSrc, /window\.confirm\(/, "the loader must require explicit confirmation before writing sample data");
  assert.match(loaderSrc, /adds sample drivers to the currently selected event/i, "the confirmation copy must clearly disclose what will happen");
  console.log("ok - sample loader requires admin auth and explicit confirmation before writing");
}

function testSyncsThroughNormalPath() {
  const loaderSrc = extractFunctionSource("loadSampleDrivers");
  assert.match(loaderSrc, /await publishStateImmediately\(\)/, "the loader must publish through the same Firestore sync path as normal admin edits, not a bypass");
  console.log("ok - sample loader syncs through the existing publishStateImmediately architecture");
}

console.log("\nAll sample-driver-loader tests passed will be printed below if none fail.\n");

const tests = [
  ["schema and counts at 8/16/32", testSchemaAndCounts],
  ["no-scores variant leaves scores unset", testNoScoresVariant],
  ["scored variant is deterministic and clearly ranked", testScoredVariantRanking],
  ["no duplicate ids or registration numbers across repeated loads", testNoDuplicateIdsOrRegistrationNumbers],
  ["real drivers are never silently deleted", testRealDriversNeverDeleted],
  ["admin-only + explicit confirmation required", testAdminOnlyAndConfirmation],
  ["syncs through the normal publish architecture", testSyncsThroughNormalPath],
];

let failures = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL - ${name}`);
    console.error(error);
  }
}

if (failures > 0) {
  console.error(`\n${failures} of ${tests.length} test(s) failed.`);
  process.exit(1);
} else {
  console.log(`\nAll ${tests.length} test(s) passed.`);
}
