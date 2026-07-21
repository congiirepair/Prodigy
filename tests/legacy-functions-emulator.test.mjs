import assert from "node:assert/strict";

const baseUrl = "http://127.0.0.1:5001/prodigy-rc-competitions/us-central1";

const wrongMethodResponse = await fetch(`${baseUrl}/parseVoiceDeductions`);
assert.equal(wrongMethodResponse.status, 405);
assert.deepEqual(await wrongMethodResponse.json(), { error: "Method not allowed" });

const emptyVoiceResponse = await fetch(`${baseUrl}/parseVoiceDeductions`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ transcript: "" }),
});
assert.equal(emptyVoiceResponse.status, 200);
assert.deepEqual(await emptyVoiceResponse.json(), { commands: [] });

const invalidEmailResponse = await fetch(`${baseUrl}/emailEventResultsSummary`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ eventName: "Emulator Test", pdfBase64: "not base64!" }),
});
assert.equal(invalidEmailResponse.status, 400);
assert.deepEqual(await invalidEmailResponse.json(), { error: "Missing or invalid pdfBase64" });

const hostingVoiceResponse = await fetch("http://127.0.0.1:5000/api/parse-voice-deductions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ transcript: "" }),
});
assert.equal(hostingVoiceResponse.status, 200);
assert.deepEqual(await hostingVoiceResponse.json(), { commands: [] });

const hostingEmailResponse = await fetch("http://127.0.0.1:5000/api/email-event-results", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ eventName: "Hosting Rewrite Test", pdfBase64: "not base64!" }),
});
assert.equal(hostingEmailResponse.status, 400);
assert.deepEqual(await hostingEmailResponse.json(), { error: "Missing or invalid pdfBase64" });

console.log("Legacy HTTPS function and Hosting rewrite emulator checks passed.");
