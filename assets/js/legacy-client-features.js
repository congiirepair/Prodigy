export function normalizeVoiceAiCommands(commands) {
  if (!Array.isArray(commands)) return [];
  return commands.map((entry, index) => {
    const type = entry?.type === "set" ? "set" : "deduction";
    const rawValue = type === "deduction" && String(entry?.value || "").toLowerCase() === "crash"
      ? "crash"
      : Number(entry?.value);
    if (rawValue !== "crash" && !Number.isFinite(rawValue)) return null;
    return {
      type,
      value: rawValue,
      sourceKey: `ai:${index}:${type}:${rawValue}`,
    };
  }).filter(Boolean);
}

export async function parseVoiceCommandsWithFallback({
  transcript,
  context = {},
  config = {},
  localParser,
  fetchImpl = globalThis.fetch,
  logger = console,
}) {
  const normalizedTranscript = String(transcript || "").trim();
  const parseLocally = () => typeof localParser === "function" ? localParser(normalizedTranscript) : [];
  const endpoint = String(config?.endpoint || "").trim();
  if (!normalizedTranscript || !config?.enabled || !endpoint || typeof fetchImpl !== "function") {
    return parseLocally();
  }

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: normalizedTranscript,
        maxScore: Number.isFinite(Number(context.maxScore)) ? Number(context.maxScore) : 100,
        currentScore: Number.isFinite(Number(context.currentScore)) ? Number(context.currentScore) : null,
      }),
    });
    if (!response.ok) throw new Error(`Voice AI returned ${response.status}`);
    const payload = await response.json();
    const commands = normalizeVoiceAiCommands(payload?.commands);
    return commands.length ? commands : parseLocally();
  } catch (error) {
    logger?.warn?.("Voice AI parsing unavailable; using local parser.", error);
    return parseLocally();
  }
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error || new Error("Could not read PDF blob"));
    reader.readAsDataURL(blob);
  });
}

export async function sendResultsSummaryEmail({
  config = {},
  eventName,
  pdfBlob,
  fetchImpl = globalThis.fetch,
  encodeBlob = blobToBase64,
}) {
  const endpoint = String(config?.endpoint || "").trim();
  if (!config?.enabled || !endpoint || !(pdfBlob instanceof Blob) || !pdfBlob.size) {
    return { attempted: false, ok: false };
  }

  const pdfBase64 = await encodeBlob(pdfBlob);
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventName: String(eventName || "Prodigy Event"),
      pdfBase64,
    }),
  });
  if (!response.ok) throw new Error(`Results email endpoint returned ${response.status}`);
  return { attempted: true, ok: true };
}
