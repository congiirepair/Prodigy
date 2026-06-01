export const COMPETITION_MODE_SOLO = "solo";
export const COMPETITION_MODE_TEAM_TANDEM = "team-tandem";
export const COMPETITION_MODE_TWIN_TRIPLE = "twin-triple";
export const COMPETITION_MODE_TWIN_DOUBLE = "twin-double";
export const COMPETITION_MODE_TECH1_ANNIVERSARY = "tech1-anniversary";
export const LEGACY_TECH1_SPECIAL_EVENT_MODE = "tech1drift-anniversary";

export const TECH1_ANNIVERSARY_COMPETITION_MODE = Object.freeze({
  mode: COMPETITION_MODE_TECH1_ANNIVERSARY,
  legacySpecialEventMode: LEGACY_TECH1_SPECIAL_EVENT_MODE,
  competitionType: "random-single-elimination",
  qualifyingEnabled: false,
  registrationEnabled: true,
  raffleEnabled: true,
  raffleTicketPrice: 5,
  freeTicketsPerRegistration: 1,
  entryFee: 40,
  tech1DriverEntryFee: 30,
  bracketGeneration: "randomized-from-competing-drivers",
  bracketMode: "random-single-elimination",
  defaultBracketSource: "bracketEligible",
  specialEventId: "tech1drift-anniversary-may-30",
});

export function isTech1AnniversaryCompetitionMode(value) {
  return value === COMPETITION_MODE_TECH1_ANNIVERSARY
    || value === LEGACY_TECH1_SPECIAL_EVENT_MODE;
}

export function normalizeCompetitionModeValue(value) {
  if (value === COMPETITION_MODE_TEAM_TANDEM) return COMPETITION_MODE_TEAM_TANDEM;
  if (value === COMPETITION_MODE_TWIN_TRIPLE) return COMPETITION_MODE_TWIN_TRIPLE;
  if (value === COMPETITION_MODE_TWIN_DOUBLE) return COMPETITION_MODE_TWIN_DOUBLE;
  if (isTech1AnniversaryCompetitionMode(value)) return COMPETITION_MODE_TECH1_ANNIVERSARY;
  return COMPETITION_MODE_SOLO;
}
