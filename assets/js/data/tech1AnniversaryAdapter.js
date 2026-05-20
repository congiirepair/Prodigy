import { TECH1DRIFT_ANNIVERSARY_CONFIG } from "../config/specialEvents.js";

const PUBLIC_STATUS_REGISTERED = "registered";
const PUBLIC_STATUS_CHECKED_IN = "checked-in";

export function normalizeTech1String(value, maxLength = 80) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

export function normalizeInstagramHandle(value) {
  const trimmed = normalizeTech1String(value, 40).replace(/^@+/, "");
  return trimmed ? `@${trimmed}` : "";
}

export function getTech1RegistrationDisplayName(registration = {}) {
  return normalizeTech1String(registration.displayName || registration.name, 80) || "Unnamed Driver";
}

export function buildTech1RegistrationDoc(input = {}, options = {}) {
  const nowIso = options.nowIso || new Date().toISOString();
  const id = normalizeTech1String(input.id || options.registrationId, 120);
  const eventId = options.eventId || TECH1DRIFT_ANNIVERSARY_CONFIG.eventId;
  const paidTickets = Math.max(0, Number.parseInt(input.paidTickets || 0, 10) || 0);
  const freeTickets = TECH1DRIFT_ANNIVERSARY_CONFIG.freeTicketsPerRegistration;
  return {
    id,
    eventId,
    mode: TECH1DRIFT_ANNIVERSARY_CONFIG.mode,
    name: normalizeTech1String(input.name, 80),
    teamName: normalizeTech1String(input.teamName, 80),
    chassis: normalizeTech1String(input.chassis, 80),
    instagram: normalizeInstagramHandle(input.instagram),
    checkedIn: Boolean(input.checkedIn),
    bracketEligible: Boolean(input.bracketEligible ?? input.checkedIn),
    bracketSeed: input.bracketSeed == null ? null : Number(input.bracketSeed),
    freeTickets,
    paidTickets,
    totalTickets: freeTickets + paidTickets,
    amountPaid: paidTickets * TECH1DRIFT_ANNIVERSARY_CONFIG.raffleTicketPrice,
    paymentStatus: input.paymentStatus || (paidTickets ? "paid" : "free-only"),
    paymentMethod: normalizeTech1String(input.paymentMethod, 40),
    staffNotes: normalizeTech1String(input.staffNotes, 240),
    ownerUid: options.ownerUid || input.ownerUid || null,
    createdAt: input.createdAt || nowIso,
    updatedAt: nowIso,
  };
}

export function buildTech1PublicRegistrationIndexDoc(registration = {}, options = {}) {
  const nowIso = options.nowIso || registration.updatedAt || new Date().toISOString();
  const registrationId = normalizeTech1String(registration.id || options.registrationId, 120);
  const checkedIn = Boolean(registration.checkedIn);
  return {
    publicId: registrationId,
    registrationId,
    eventId: options.eventId || registration.eventId || TECH1DRIFT_ANNIVERSARY_CONFIG.eventId,
    mode: TECH1DRIFT_ANNIVERSARY_CONFIG.mode,
    displayName: getTech1RegistrationDisplayName(registration),
    teamName: normalizeTech1String(registration.teamName, 80),
    chassis: normalizeTech1String(registration.chassis, 80),
    instagram: normalizeInstagramHandle(registration.instagram),
    checkedIn,
    bracketEligible: Boolean(registration.bracketEligible ?? checkedIn),
    bracketSeed: registration.bracketSeed == null ? null : Number(registration.bracketSeed),
    publicStatus: checkedIn ? PUBLIC_STATUS_CHECKED_IN : PUBLIC_STATUS_REGISTERED,
    createdAt: registration.createdAt || nowIso,
    updatedAt: nowIso,
  };
}

export function buildTech1RaffleTransactionDoc(input = {}, options = {}) {
  const nowIso = options.nowIso || new Date().toISOString();
  const paidTicketsAdded = Math.max(0, Number.parseInt(input.paidTicketsAdded || 0, 10) || 0);
  return {
    id: normalizeTech1String(input.id || options.transactionId, 120),
    eventId: options.eventId || input.eventId || TECH1DRIFT_ANNIVERSARY_CONFIG.eventId,
    registrationId: normalizeTech1String(input.registrationId, 120),
    paidTicketsAdded,
    amountPaid: paidTicketsAdded * TECH1DRIFT_ANNIVERSARY_CONFIG.raffleTicketPrice,
    paymentMethod: normalizeTech1String(input.paymentMethod || "cash", 40),
    confirmedBy: normalizeTech1String(options.confirmedBy || input.confirmedBy || "event-staff", 120),
    createdAt: nowIso,
  };
}

export function mergeTech1RegistrationTicketPurchase(registration = {}, transaction = {}, options = {}) {
  const paidTickets = Math.max(0, Number(registration.paidTickets || 0)) + Math.max(0, Number(transaction.paidTicketsAdded || 0));
  return buildTech1RegistrationDoc({
    ...registration,
    paidTickets,
    paymentStatus: options.paymentStatus || "paid",
    paymentMethod: transaction.paymentMethod || registration.paymentMethod || "cash",
  }, {
    eventId: registration.eventId || transaction.eventId || TECH1DRIFT_ANNIVERSARY_CONFIG.eventId,
    registrationId: registration.id || transaction.registrationId,
    ownerUid: registration.ownerUid || null,
    nowIso: options.nowIso || transaction.createdAt || new Date().toISOString(),
  });
}

export function sortTech1RegistrationsForDisplay(registrations = []) {
  return [...registrations].sort((left, right) => {
    if (Boolean(right.checkedIn) !== Boolean(left.checkedIn)) return Number(right.checkedIn) - Number(left.checkedIn);
    const leftSeed = Number(left.bracketSeed || Number.POSITIVE_INFINITY);
    const rightSeed = Number(right.bracketSeed || Number.POSITIVE_INFINITY);
    if (leftSeed !== rightSeed) return leftSeed - rightSeed;
    return getTech1RegistrationDisplayName(left).localeCompare(getTech1RegistrationDisplayName(right));
  });
}
