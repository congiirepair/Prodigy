// Focused regression coverage for the judge-UI qualifying desync bug:
// after a Run 1 submission of 84 was accepted, further deduction taps
// could still mutate the local draft to 50 while "Your submitted score"
// kept showing 84 and the Submit button remained enabled — because
// (a) the deduction/input mutators had no guard against an already-
// finalized run, (b) submitJudgeRun optimistically overwrote the local
// "submitted" value before the server confirmed, and (c) the card-
// visibility logic re-showed an editable, submit-enabled card whenever
// local draft state diverged from the submitted score, regardless of
// why it diverged.
//
// This extracts the REAL, current source of each implicated function
// directly out of index.html (by name, with brace matching) and
// executes it in an isolated sandbox, so a regression in the shipped
// file fails this test, not just a stale copy of the logic.
//
// Run: node tests/qualifying-run-finalization.test.mjs

import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const indexHtmlPath = `${repoRoot}index.html`;
const source = fs.readFileSync(indexHtmlPath, "utf8");

// ---- tiny source extractor -------------------------------------------------

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

function buildSandbox(sourceSnippets, extraGlobals = {}) {
  const context = { ...extraGlobals };
  vm.createContext(context);
  new vm.Script(sourceSnippets.join("\n\n")).runInContext(context);
  return context;
}

function makeDriver() {
  return {
    id: "driver-1",
    scores: {
      j1: { run1: null, run2: null, runoff: null, submitted: { run1: null, run2: null, runoff: null }, deductionHistory: { run1: [], run2: [], runoff: [] } },
    },
    runFlags: { run1: null, run2: null, runoff: null },
  };
}

// ---- 1. applyJudgeScoreDeduction refuses to touch a finalized run ---------

// Uses a real appDrivers array so the deduction actually has a driver
// to find, proving the guard specifically blocks an ALREADY-SUBMITTED run
// while still allowing a normal (unsubmitted) deduction.
function testDeductionGuardWithRoster() {
  const driver = makeDriver();
  const sandbox = buildSandbox([
    "var currentRole = 'j1';",
    "var activeEventMeta = {};",
    `var appDrivers = ${JSON.stringify([driver])};`,
    "function getRunKey(runRef) { if (runRef === 'r1') return 'run1'; if (runRef === 'r2') return 'run2'; return typeof runRef === 'string' ? runRef : `run${runRef}`; }",
    extractFunctionSource("hasSubmittedJudgeRun"),
    extractFunctionSource("getSubmittedScoreValue"),
    extractFunctionSource("getJudgeDraftScoreValue"),
    "function getJudgeDefaultRunScore() { return 100; }",
    "function clampJudgeScoreValue(value) { return value; }",
    "function appendJudgeDeductionHistory() {}",
    extractFunctionSource("applyJudgeScoreDeduction"),
  ]);

  // Not yet submitted: a deduction is applied normally.
  const beforeSubmit = sandbox.applyJudgeScoreDeduction("driver-1", "r1", 5, "j1");
  assert.equal(beforeSubmit, true, "a deduction on an unsubmitted run must still apply");
  assert.equal(sandbox.appDrivers[0].scores.j1.run1, 95, "draft must reflect the applied deduction");

  // Finalize Run 1 the same way a real submission would (submitted set).
  sandbox.appDrivers[0].scores.j1.submitted.run1 = 95;

  // Now attempt a further deduction on the SAME, now-finalized run.
  const afterSubmit = sandbox.applyJudgeScoreDeduction("driver-1", "r1", 45, "j1");
  assert.equal(afterSubmit, false, "a deduction on an already-submitted run must be refused");
  assert.equal(sandbox.appDrivers[0].scores.j1.run1, 95, "the draft must remain untouched (never becomes 50)");
  assert.equal(sandbox.appDrivers[0].scores.j1.submitted.run1, 95, "the submitted score must remain the authoritative 95");
}

// ---- 2. submitJudgeRun never optimistically overwrites a finalized run ----

function testSubmitJudgeRunGuard() {
  const driver = makeDriver();
  driver.scores.j1.run1 = 50; // simulates a stale draft that slipped through some other path
  driver.scores.j1.submitted.run1 = 84; // authoritative, already finalized

  const sandbox = buildSandbox([
    "var currentRole = 'j1';",
    "var activeEventMeta = {};",
    `var appDrivers = ${JSON.stringify([driver])};`,
    "function getRunKey(runRef) { if (runRef === 'r1') return 'run1'; if (runRef === 'r2') return 'run2'; return typeof runRef === 'string' ? runRef : `run${runRef}`; }",
    "function isJudgeAccessLocked() { return false; }",
    extractFunctionSource("getSubmittedScoreValue"),
    extractFunctionSource("getJudgeDraftScoreValue"),
    "function getJudgeDefaultRunScore() { return null; }",
    "function clampJudgeScoreValue(value) { return value; }",
    "function triggerJudgeSubmissionFeedback() {}",
    extractFunctionSource("submitJudgeRun"),
  ]);

  sandbox.submitJudgeRun("driver-1", "run1", "j1");

  assert.equal(sandbox.appDrivers[0].scores.j1.submitted.run1, 84, "submitted score must stay the authoritative 84, never optimistically become 50");
  console.log("ok - submitJudgeRun refuses to re-finalize an already-submitted run (no optimistic 50 overwrite)");
}

// ---- 3. render logic never resurrects a finalized run's editable card -----

function testShowRunCardLogicInSource() {
  const cardSrc = extractFunctionSource("renderJudgeLaneCard");
  assert.match(
    cardSrc,
    /const showRun1Card = !run1SubmittedByMe;/,
    "showRun1Card must be keyed strictly on run1SubmittedByMe (no '|| run1Pending' escape hatch that resurrects a finalized run's card)",
  );
  assert.match(
    cardSrc,
    /const showRun2Editable = run1SubmittedByMe && !run2SubmittedByMe;/,
    "Run 2 must only render as an editable form before it has been submitted",
  );
  assert.match(
    cardSrc,
    /run2SubmittedByMe \? `[\s\S]*?renderJudgeFinalizedRunSummary/,
    "a finalized Run 2 must render the locked, non-editable finalized-run summary instead of the raw editable form",
  );
  assert.doesNotMatch(
    cardSrc,
    /\bshowRun2\b(?!Editable)/,
    "renderJudgeLaneCard must never reference a bare 'showRun2' identifier (only 'showRun2Editable' is declared) -- a stray reference throws ReferenceError and crashes the entire judge card render",
  );
  console.log("ok - renderJudgeLaneCard never re-shows an editable/submit-enabled card for an already-finalized run");
}

// ---- 3b. renderJudgeFinalizedRunSummary never emits an editable control ---

function testFinalizedRunSummaryNeverEditable() {
  const sandbox = buildSandbox([
    "function escapeHtml(value) { return String(value ?? '').replace(/[&<>\"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c])); }",
    "function formatScore(score) { const n = Number(score); return Number.isFinite(n) ? n.toFixed(1) : '-'; }",
    "let qualifyingRunSubmittingKey = null;",
    "function isJudgeSubmissionFeedbackActive() { return false; }",
    extractFunctionSource("renderJudgeFinalizedRunSummary"),
  ]);
  const html = sandbox.renderJudgeFinalizedRunSummary("driver-1", "j1", 2, "run2", 84, null);
  assert.doesNotMatch(html, /<input/, "the finalized-run summary must never render an <input>");
  assert.doesNotMatch(html, /score-deduction-btn/, "the finalized-run summary must never render deduction buttons");
  assert.doesNotMatch(html, /data-action="submit-judge-run"/, "the finalized-run summary must never render a submit button");
  assert.match(html, /84\.0/, "the finalized-run summary must still show the authoritative submitted value");
  console.log("ok - renderJudgeFinalizedRunSummary never emits an input, deduction button, or submit control");
}

// ---- 4. desktop + mobile score-input handlers refuse to edit a finalized run

function testInputHandlersGuardFinalizedRuns() {
  assert.ok(
    (source.match(/if \(currentRole\.startsWith\("j"\) && editingRunKey && hasSubmittedJudgeRun\(driver, currentRole, editingRunKey\)\) \{/g) || []).length >= 2,
    "both the desktop table and mobile judge-lane score-input handlers must refuse to mutate an already-submitted run's draft",
  );
  console.log("ok - raw score-input typing cannot corrupt an already-finalized run's draft on either surface");
}

// ---- 5. pending-submission protection on both submit-judge-run click paths

function testInFlightGuardOnRunSubmit() {
  const occurrences = (source.match(/if \(judgeSubmissionInFlight\) return;/g) || []).length;
  assert.ok(occurrences >= 3, "judgeSubmissionInFlight must gate the qualifying submit handlers (desktop submit-judge-scores, mobile submit-judge-scores, mobile submit-judge-run) in addition to the existing battle-voting guard");
  assert.match(
    source,
    /if \(driverForGuard && hasSubmittedJudgeRun\(driverForGuard, currentRole, runKey\)\) return;/,
    "the run-submit click handler must refuse to even attempt a network call for an already-finalized run",
  );
  console.log("ok - double-click / rapid re-submit cannot fire a competing qualifying submission");
}

// ---- 6. duplicate-rejection recovery reconciles with authoritative state --

function testDuplicateRejectionRecovery() {
  const syncSrc = extractFunctionSource("syncJudgeSubmission");
  assert.match(
    syncSrc,
    /error\.message\.includes\("already submitted"\)/,
    "the callable-path catch block must specifically detect the server's duplicate-rejection",
  );
  assert.match(
    syncSrc,
    /driverForReconcile\.scores\[role\]\[runKey\] = knownSubmitted;/,
    "on duplicate-rejection, the draft must be forced back to the known-authoritative submitted value rather than trusting a possibly-already-corrupted rollback snapshot",
  );
  console.log("ok - duplicate-rejection recovery reconciles the draft with the authoritative submitted score");
}

// ---- run --------------------------------------------------------------

const tests = [
  ["applyJudgeScoreDeduction refuses to edit a finalized run", testDeductionGuardWithRoster],
  ["submitJudgeRun never optimistically overwrites a finalized run", testSubmitJudgeRunGuard],
  ["renderJudgeLaneCard never resurrects a finalized run's editable card", testShowRunCardLogicInSource],
  ["renderJudgeFinalizedRunSummary never emits an editable control", testFinalizedRunSummaryNeverEditable],
  ["score-input handlers guard finalized runs on both surfaces", testInputHandlersGuardFinalizedRuns],
  ["pending-submission protection on run-submit paths", testInFlightGuardOnRunSubmit],
  ["duplicate-rejection recovery reconciles authoritative state", testDuplicateRejectionRecovery],
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
