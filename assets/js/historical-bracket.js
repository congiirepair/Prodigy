export const HISTORICAL_BRACKET_UNAVAILABLE = "unavailable";
export const HISTORICAL_BRACKET_AVAILABLE = "available";

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function resolveRecoveredBracket({
  eventStatus,
  hasVerifiedQualifying = false,
  hasVerifiedResults = false,
  validatedBracket = null,
  createBracket = null,
} = {}) {
  if (validatedBracket) {
    return {
      bracket: clone(validatedBracket),
      historicalBracketStatus: HISTORICAL_BRACKET_AVAILABLE,
    };
  }

  const completedWithoutBracketEvidence = String(eventStatus || "").toLowerCase() === "completed"
    && hasVerifiedQualifying
    && hasVerifiedResults;
  if (completedWithoutBracketEvidence) {
    return {
      bracket: null,
      historicalBracketStatus: HISTORICAL_BRACKET_UNAVAILABLE,
    };
  }

  return {
    bracket: typeof createBracket === "function" ? createBracket() : null,
    historicalBracketStatus: null,
  };
}

export function shouldPreserveUnavailableHistoricalBracket(eventMeta) {
  return String(eventMeta?.status || "").toLowerCase() === "completed"
    && eventMeta?.historicalBracketStatus === HISTORICAL_BRACKET_UNAVAILABLE;
}

export function isHistoricalBracketUnavailable(eventMeta, bracket) {
  return shouldPreserveUnavailableHistoricalBracket(eventMeta) && !bracket;
}
