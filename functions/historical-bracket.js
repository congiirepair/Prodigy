"use strict";

const crypto = require("node:crypto");

const ROUND3_EVENT_ID = "sdc-round-3-las-vegas";
const ROUND3_SYNTHETIC_BRACKET_CREATED_AT = "2026-04-17T22:23:42.860Z";
const HISTORICAL_BRACKET_UNAVAILABLE = "unavailable";

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function bracketHash(bracket) {
  return crypto.createHash("sha256").update(canonicalJson(bracket)).digest("hex");
}

function countBracketWinners(value) {
  if (Array.isArray(value)) return value.reduce((total, entry) => total + countBracketWinners(entry), 0);
  if (!value || typeof value !== "object") return 0;
  return Object.entries(value).reduce((total, [key, entry]) => (
    total + (key === "winner" && entry ? 1 : countBracketWinners(entry))
  ), 0);
}

function inspectRound3SyntheticBracket(eventId, eventData = {}) {
  if (eventId !== ROUND3_EVENT_ID) return { valid: false, reason: "wrong-event" };
  if (eventData.historicalBracketStatus === HISTORICAL_BRACKET_UNAVAILABLE && !eventData.bracket) {
    return { valid: true, alreadyRepaired: true };
  }
  if (String(eventData.status || "").toLowerCase() !== "completed") return { valid: false, reason: "not-completed" };
  if (!eventData.bracket) return { valid: false, reason: "missing-bracket" };
  if (eventData.bracket.createdAt !== ROUND3_SYNTHETIC_BRACKET_CREATED_AT) return { valid: false, reason: "unexpected-created-at" };
  if (Number(eventData.results?.totalBattles) !== 0 || Number(eventData.results?.completedBattles) !== 0) {
    return { valid: false, reason: "battle-counts-changed" };
  }
  if (countBracketWinners(eventData.bracket) !== 0) return { valid: false, reason: "bracket-has-winners" };
  return {
    valid: true,
    alreadyRepaired: false,
    bracketHash: bracketHash(eventData.bracket),
  };
}

module.exports = {
  HISTORICAL_BRACKET_UNAVAILABLE,
  ROUND3_EVENT_ID,
  ROUND3_SYNTHETIC_BRACKET_CREATED_AT,
  bracketHash,
  canonicalJson,
  countBracketWinners,
  inspectRound3SyntheticBracket,
};
