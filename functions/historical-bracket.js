"use strict";

const crypto = require("node:crypto");

const ROUND3_EVENT_ID = "sdc-round-3-las-vegas";
const ROUND3_SYNTHETIC_BRACKET_CREATED_AT = "2026-07-22T12:53:23.500Z";
const ROUND3_SYNTHETIC_BRACKET_HASH = "988b8bd232911ee6fbb5a42d26ffbc314054cc6e0b11b22ba4aea97f5c1d7f6a";
const HISTORICAL_BRACKET_UNAVAILABLE = "unavailable";

function normalizeTimestamp(value) {
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (value && typeof value.toDate === "function") return normalizeTimestamp(value.toDate());
  const seconds = Number(value?.seconds ?? value?._seconds);
  const nanoseconds = Number(value?.nanoseconds ?? value?._nanoseconds ?? 0);
  if (Number.isFinite(seconds) && Number.isFinite(nanoseconds)) {
    return new Date((seconds * 1000) + Math.floor(nanoseconds / 1e6)).toISOString();
  }
  return null;
}

function normalizeCanonicalValue(value) {
  const timestamp = normalizeTimestamp(value);
  if (timestamp) return timestamp;
  if (Array.isArray(value)) return value.map(normalizeCanonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalizeCanonicalValue(entry)]));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function bracketHash(bracket) {
  return crypto.createHash("sha256").update(canonicalJson(normalizeCanonicalValue(bracket))).digest("hex");
}

function countBracketWinners(value) {
  if (Array.isArray(value)) return value.reduce((total, entry) => total + countBracketWinners(entry), 0);
  if (!value || typeof value !== "object") return 0;
  return Object.entries(value).reduce((total, [key, entry]) => (
    total + (key === "winner" && entry ? 1 : countBracketWinners(entry))
  ), 0);
}

function repairFingerprintMatches(current = {}, expected = {}) {
  return String(expected.bracketHash || "") === String(current.bracketHash || "")
    && normalizeTimestamp(expected.createdAt) === normalizeTimestamp(current.createdAt)
    && Number(expected.syncStamp) === Number(current.syncStamp);
}

function inspectRound3SyntheticBracket(eventId, eventData = {}, expected = {}) {
  const expectedBracketHash = expected.bracketHash || ROUND3_SYNTHETIC_BRACKET_HASH;
  const expectedCreatedAt = normalizeTimestamp(expected.createdAt || ROUND3_SYNTHETIC_BRACKET_CREATED_AT);
  if (eventId !== ROUND3_EVENT_ID) return { valid: false, reason: "wrong-event" };
  if (eventData.historicalBracketStatus === HISTORICAL_BRACKET_UNAVAILABLE && !eventData.bracket) {
    return { valid: true, alreadyRepaired: true };
  }
  if (String(eventData.status || "").toLowerCase() !== "completed") return { valid: false, reason: "not-completed" };
  if (!eventData.bracket) return { valid: false, reason: "missing-bracket" };
  if (Number(eventData.results?.totalBattles) !== 0 || Number(eventData.results?.completedBattles) !== 0) {
    return { valid: false, reason: "battle-counts-changed" };
  }
  if (countBracketWinners(eventData.bracket) !== 0) return { valid: false, reason: "bracket-has-winners" };
  const actualBracketHash = bracketHash(eventData.bracket);
  if (actualBracketHash !== expectedBracketHash) return { valid: false, reason: "unexpected-bracket-hash" };
  if (normalizeTimestamp(eventData.bracket.createdAt) !== expectedCreatedAt) return { valid: false, reason: "unexpected-created-at" };
  return {
    valid: true,
    alreadyRepaired: false,
    bracketHash: actualBracketHash,
  };
}

module.exports = {
  HISTORICAL_BRACKET_UNAVAILABLE,
  ROUND3_EVENT_ID,
  ROUND3_SYNTHETIC_BRACKET_CREATED_AT,
  ROUND3_SYNTHETIC_BRACKET_HASH,
  bracketHash,
  canonicalJson,
  countBracketWinners,
  inspectRound3SyntheticBracket,
  normalizeTimestamp,
  repairFingerprintMatches,
};
