import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import {
  parseVoiceCommandsWithFallback,
  sendResultsSummaryEmail,
} from "../assets/js/legacy-client-features.js";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, "firebase.json"), "utf8"));
const functionsIndex = fs.readFileSync(path.join(repoRoot, "functions", "index.js"), "utf8");
const legacyFunctions = fs.readFileSync(path.join(repoRoot, "functions", "legacy-http.js"), "utf8");
const html = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
const clientConfigSource = fs.readFileSync(path.join(repoRoot, "client-config.js"), "utf8");
const clientContext = { window: {} };
vm.runInNewContext(clientConfigSource, clientContext);
const clientConfig = clientContext.window.RC_DRIFT_CLIENT_CONFIG;

assert.match(html, /client-config\.js\?v=20260721a/);

assert.equal(clientConfig.voiceAi.enabled, true);
assert.equal(clientConfig.voiceAi.endpoint, "/api/parse-voice-deductions");
assert.equal(clientConfig.resultsEmail.enabled, true);
assert.equal(clientConfig.resultsEmail.endpoint, "/api/email-event-results");

assert.deepEqual(firebaseConfig.hosting.rewrites.slice(0, 3), [
  {
    source: "/api/parse-voice-deductions",
    function: { functionId: "parseVoiceDeductions", region: "us-central1" },
  },
  {
    source: "/api/email-event-results",
    function: { functionId: "emailEventResultsSummary", region: "us-central1" },
  },
  { source: "**", destination: "/index.html" },
]);

assert.match(functionsIndex, /exports\.parseVoiceDeductions = parseVoiceDeductions;/);
assert.match(functionsIndex, /exports\.emailEventResultsSummary = emailEventResultsSummary;/);
assert.match(legacyFunctions, /defineSecret\("GEMINI_API_KEY"\)/);
assert.match(legacyFunctions, /defineSecret\("RESEND_API_KEY"\)/);
assert.match(legacyFunctions, /const parseVoiceDeductions = onRequest\(\{/);
assert.match(legacyFunctions, /const emailEventResultsSummary = onRequest\(\{/);

let localParserCalls = 0;
let voiceRequest;
const aiCommands = await parseVoiceCommandsWithFallback({
  transcript: "minus two then crash",
  context: { maxScore: 100, currentScore: 96 },
  config: clientConfig.voiceAi,
  localParser: () => {
    localParserCalls += 1;
    return [{ type: "deduction", value: 99 }];
  },
  fetchImpl: async (url, options) => {
    voiceRequest = { url, options };
    return {
      ok: true,
      json: async () => ({ commands: [{ type: "deduction", value: "2" }, { type: "deduction", value: "crash" }] }),
    };
  },
});
assert.equal(voiceRequest.url, "/api/parse-voice-deductions");
assert.deepEqual(JSON.parse(voiceRequest.options.body), {
  transcript: "minus two then crash",
  maxScore: 100,
  currentScore: 96,
});
assert.deepEqual(aiCommands.map(({ type, value }) => ({ type, value })), [
  { type: "deduction", value: 2 },
  { type: "deduction", value: "crash" },
]);
assert.equal(localParserCalls, 0);

const warnings = [];
const fallbackCommands = await parseVoiceCommandsWithFallback({
  transcript: "five off",
  config: clientConfig.voiceAi,
  localParser: (transcript) => {
    localParserCalls += 1;
    assert.equal(transcript, "five off");
    return [{ type: "deduction", value: 5, sourceKey: "local" }];
  },
  fetchImpl: async () => ({ ok: false, status: 503 }),
  logger: { warn: (...args) => warnings.push(args) },
});
assert.deepEqual(fallbackCommands, [{ type: "deduction", value: 5, sourceKey: "local" }]);
assert.equal(localParserCalls, 1);
assert.equal(warnings.length, 1);

let emailRequest;
const emailResult = await sendResultsSummaryEmail({
  config: clientConfig.resultsEmail,
  eventName: "Summer Finals",
  pdfBlob: new Blob(["pdf"], { type: "application/pdf" }),
  encodeBlob: async () => "cGRm",
  fetchImpl: async (url, options) => {
    emailRequest = { url, options };
    return { ok: true, status: 200 };
  },
});
assert.deepEqual(emailResult, { attempted: true, ok: true });
assert.equal(emailRequest.url, "/api/email-event-results");
assert.deepEqual(JSON.parse(emailRequest.options.body), {
  eventName: "Summer Finals",
  pdfBase64: "cGRm",
});

await assert.rejects(() => sendResultsSummaryEmail({
  config: clientConfig.resultsEmail,
  eventName: "Failed Finals",
  pdfBlob: new Blob(["pdf"], { type: "application/pdf" }),
  encodeBlob: async () => "cGRm",
  fetchImpl: async () => ({ ok: false, status: 502 }),
}), /Results email endpoint returned 502/);

const finalizeStart = html.indexOf("async function finalizeCurrentEventResults()");
const finalizeEnd = html.indexOf("function syncSelfRegisterProfileCard()", finalizeStart);
const finalizeSource = html.slice(finalizeStart, finalizeEnd);
assert.match(finalizeSource, /await publishStateImmediately/);
assert.match(finalizeSource, /await emailResultsSummaryForFinalizedEvent\(activeEventId\)/);
assert.match(finalizeSource, /catch \(error\) \{\s*console\.warn\("Results summary email failed to send", error\);\s*\}/);
assert.ok(finalizeSource.indexOf("await publishStateImmediately") < finalizeSource.indexOf("await emailResultsSummaryForFinalizedEvent"));
assert.ok(finalizeSource.indexOf("await emailResultsSummaryForFinalizedEvent") < finalizeSource.indexOf("Current event results were finalized"));

assert.match(html, /parseVoiceCommandsWithFallback\(\{/);
assert.match(html, /localParser: parseJudgeVoiceCommands/);
assert.match(html, /data-action="toggle-voice-deduction"/);

console.log("Legacy production feature regression checks passed.");
