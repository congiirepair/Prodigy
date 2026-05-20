export const TECH1DRIFT_ANNIVERSARY_CONFIG = Object.freeze({
  eventId: "tech1drift-anniversary-may-30",
  title: "Tech 1 Drift Anniversary Competition",
  date: "2026-05-30",
  dateLabel: "May 30",
  mode: "tech1drift-anniversary",
  branding: {
    name: "Tech 1 Drift",
    accent: "#e11d2e",
    gold: "#f6c453",
    ink: "#101010",
  },
  registrationOpen: true,
  expectedDrivers: 60,
  raffleTicketPrice: 5,
  freeTicketsPerRegistration: 1,
  bracketMode: "random-single-elimination",
  qualifyingEnabled: false,
  defaultBracketSource: "checkedIn",
  heroTitle: "Tech 1 Drift Anniversary Competition",
  heroSubtitle: "Register for the event, get 1 free raffle ticket, and enter the randomized battle bracket.",
  additionalTicketCopy: "Additional raffle tickets are $5 each and can be purchased from event staff.",
});

export function buildTech1AnniversaryShell(overrides = {}) {
  const nowIso = overrides.updatedAt || new Date().toISOString();
  return {
    title: TECH1DRIFT_ANNIVERSARY_CONFIG.title,
    date: TECH1DRIFT_ANNIVERSARY_CONFIG.date,
    dateLabel: TECH1DRIFT_ANNIVERSARY_CONFIG.dateLabel,
    mode: TECH1DRIFT_ANNIVERSARY_CONFIG.mode,
    branding: { ...TECH1DRIFT_ANNIVERSARY_CONFIG.branding },
    registrationOpen: TECH1DRIFT_ANNIVERSARY_CONFIG.registrationOpen,
    raffleTicketPrice: TECH1DRIFT_ANNIVERSARY_CONFIG.raffleTicketPrice,
    freeTicketsPerRegistration: TECH1DRIFT_ANNIVERSARY_CONFIG.freeTicketsPerRegistration,
    bracketStatus: "not_generated",
    expectedDrivers: TECH1DRIFT_ANNIVERSARY_CONFIG.expectedDrivers,
    qualifyingEnabled: false,
    updatedAt: nowIso,
    ...overrides,
  };
}
