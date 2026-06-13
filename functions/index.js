const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const geminiApiKey = defineSecret("GEMINI_API_KEY");

function sendJson(response, status, payload) {
  response.status(status).set("Content-Type", "application/json").send(JSON.stringify(payload));
}

function normalizeCommands(commands) {
  if (!Array.isArray(commands)) return [];
  return commands
    .map((command) => {
      const type = command?.type === "set" ? "set" : "deduction";
      const value = type === "deduction" && String(command?.value || "").toLowerCase() === "crash"
        ? "crash"
        : Number(command?.value);
      if (value !== "crash" && !Number.isFinite(value)) return null;
      return { type, value };
    })
    .filter(Boolean)
    .slice(0, 24);
}

function sanitizeGeminiError(status, detail) {
  try {
    const parsed = JSON.parse(detail);
    const message = String(parsed?.error?.message || "")
      .replace(/AIza[0-9A-Za-z_\-]+/g, "[redacted]")
      .replace(/sk-[A-Za-z0-9_\-]+/g, "[redacted]");
    return {
      status,
      code: parsed?.error?.code || null,
      statusText: parsed?.error?.status || null,
      message,
    };
  } catch (error) {
    return {
      status,
      message: String(detail || "")
        .slice(0, 500)
        .replace(/AIza[0-9A-Za-z_\-]+/g, "[redacted]")
        .replace(/sk-[A-Za-z0-9_\-]+/g, "[redacted]"),
    };
  }
}

exports.parseVoiceDeductions = onRequest({
  region: "us-central1",
  cors: true,
  maxInstances: 10,
  timeoutSeconds: 20,
  secrets: [geminiApiKey],
}, async (request, response) => {
  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const transcript = String(request.body?.transcript || "").trim().slice(0, 1200);
  if (!transcript) {
    sendJson(response, 200, { commands: [] });
    return;
  }

  const maxScore = Number.isFinite(Number(request.body?.maxScore)) ? Number(request.body.maxScore) : 100;
  const currentScore = Number.isFinite(Number(request.body?.currentScore)) ? Number(request.body.currentScore) : null;

  try {
    const model = process.env.GEMINI_VOICE_MODEL || "gemini-2.5-flash-lite";
    const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiApiKey.value())}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{
              text: [
              "Convert RC drift judge voice dictation into score commands.",
              "Return only commands the judge intended.",
              "Deductions subtract points from the current score.",
              "Examples: 'minus two five crash' means deduction 2, deduction 5, deduction crash.",
              "'set score eighty seven' means set 87.",
              "Ignore filler words, driver names, timing words, and uncertain non-score chatter.",
                "Return JSON only.",
                JSON.stringify({ transcript, maxScore, currentScore }),
              ].join(" "),
            }],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              commands: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: {
                      type: "string",
                      enum: ["deduction", "set"],
                    },
                    value: {
                      type: "string",
                      description: "A number as text, or the word crash.",
                    },
                  },
                  required: ["type", "value"],
                },
              },
            },
            required: ["commands"],
          },
        },
      }),
    });

    if (!aiResponse.ok) {
      const detail = await aiResponse.text();
      const sanitizedError = sanitizeGeminiError(aiResponse.status, detail);
      console.error("Gemini voice parsing failed", sanitizedError);
      sendJson(response, 502, { error: "Voice AI failed", detail: sanitizedError });
      return;
    }

    const payload = await aiResponse.json();
    const outputText = payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("");
    const parsed = outputText ? JSON.parse(outputText) : { commands: [] };
    sendJson(response, 200, { commands: normalizeCommands(parsed.commands) });
  } catch (error) {
    console.error("Voice AI parser error", error);
    sendJson(response, 500, { error: "Voice AI unavailable" });
  }
});
