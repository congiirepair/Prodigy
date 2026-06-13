import { TECH1DRIFT_ANNIVERSARY_CONFIG } from "../config/specialEvents.js";
import { getBracketDisplayWindow, getSingleEliminationBracketProjection } from "../competition/singleElimination.js";
import { sortTech1RegistrationsForDisplay } from "../data/tech1AnniversaryAdapter.js";
import { escapeAttributeValue, escapeHtml } from "../utils/dom.js";

function formatTicketMoney(value = 0) {
  return `$${Math.max(0, Number(value || 0)).toFixed(0)}`;
}

function getTech1EntryFeeForRegistration(entry = {}, config = TECH1DRIFT_ANNIVERSARY_CONFIG) {
  const standardEntryFee = Math.max(0, Number(config.entryFee || 0));
  const tech1DriverEntryFee = Math.max(0, Number(config.tech1DriverEntryFee || standardEntryFee));
  if (entry.entryFee != null && entry.entryFee !== "") return Math.max(0, Number(entry.entryFee || 0));
  return entry.tech1Driver ? tech1DriverEntryFee : standardEntryFee;
}

function renderStat(label, value, tone = "") {
  return `
    <div class="broadcast-match-pill ${escapeHtml(tone)}">
      <small>${escapeHtml(label)}</small>
      <strong>${escapeHtml(String(value))}</strong>
    </div>
  `;
}

function getBracketSourceLabel(source = "bracketEligible") {
  if (source === "allRegistered") return "all registered drivers";
  if (source === "checkedIn") return "checked-in drivers";
  return "drivers marked Competing";
}

function isBracketPoolLocked(bracket = null) {
  return ["locked", "in_progress", "complete"].includes(String(bracket?.status || ""));
}

function bracketExists(bracket = null) {
  return Boolean(bracket?.rounds?.length) || ["generated", "locked", "in_progress", "complete"].includes(String(bracket?.status || ""));
}

const TECH1_DEFAULT_JUDGE_ROLES = ["j1", "j2", "j3"];
const TECH1_BRACKET_DISPLAY_PAGE_SIZE = 32;
const TECH1_PAYMENT_METHOD_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "paypal", label: "PayPal" },
  { value: "zelle", label: "Zelle" },
];

function normalizeTech1PaymentMethodValue(value, fallback = "cash") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "pay pal") return "paypal";
  if (TECH1_PAYMENT_METHOD_OPTIONS.some((entry) => entry.value === normalized)) return normalized;
  return fallback;
}

function renderTech1PaymentMethodOptions(selectedValue = "cash") {
  const selected = normalizeTech1PaymentMethodValue(selectedValue, "cash");
  return TECH1_PAYMENT_METHOD_OPTIONS
    .map((entry) => `<option value="${escapeAttributeValue(entry.value)}" ${entry.value === selected ? "selected" : ""}>${escapeHtml(entry.label)}</option>`)
    .join("");
}

function getTech1ControlJudgeRoles(control = null) {
  const roles = Array.isArray(control?.judgeRoles)
    ? control.judgeRoles.filter((role) => TECH1_DEFAULT_JUDGE_ROLES.includes(role))
    : [];
  return roles.length ? roles : TECH1_DEFAULT_JUDGE_ROLES;
}

function countSubmittedTech1Votes(control = null) {
  return getTech1ControlJudgeRoles(control)
    .filter((role) => ["left", "right", "omt"].includes(control?.votes?.[role]))
    .length;
}

function renderTech1BrandMark(config = TECH1DRIFT_ANNIVERSARY_CONFIG, className = "tech1-brand-mark") {
  const lightLogo = config.branding?.logoLight || config.branding?.logo || "";
  const darkLogo = config.branding?.logoDark || config.branding?.logo || lightLogo;
  if (!lightLogo && !darkLogo) return "";
  const alt = config.branding?.logoAlt || "Tech 1 Drift logo";
  return `
    <div class="${escapeAttributeValue(className)}">
      <img class="tech1-logo-light" src="${escapeAttributeValue(lightLogo)}" alt="${escapeAttributeValue(alt)}" />
      <img class="tech1-logo-dark" src="${escapeAttributeValue(darkLogo)}" alt="${escapeAttributeValue(alt)}" />
    </div>
  `;
}

function summarizeTech1Registrations(registrations = []) {
  return registrations.reduce((summary, entry) => {
    const entryFee = getTech1EntryFeeForRegistration(entry);
    const raffleAmountPaid = Number(entry.amountPaid || 0);
    summary.registrations += 1;
    if (entry.checkedIn) summary.checkedIn += 1;
    if (entry.bracketEligible) summary.competing += 1;
    summary.entryFees += entryFee;
    summary.freeTickets += Number(entry.freeTickets || 0);
    summary.paidTickets += Number(entry.paidTickets || 0);
    summary.totalTickets += Number(entry.totalTickets || entry.freeTickets || 0);
    summary.raffleAmountPaid += raffleAmountPaid;
    summary.amountPaid += entryFee + raffleAmountPaid;
    return summary;
  }, {
    registrations: 0,
    checkedIn: 0,
    competing: 0,
    entryFees: 0,
    freeTickets: 0,
    paidTickets: 0,
    totalTickets: 0,
    raffleAmountPaid: 0,
    amountPaid: 0,
  });
}

function getBracketWinner(bracket = null) {
  const finalMatch = Object.values(bracket?.matches || {}).find((match) => !match.advancedToMatchId);
  if (!finalMatch?.winnerId) return null;
  return [finalMatch.driverA, finalMatch.driverB].find((driver) => driver?.id === finalMatch.winnerId) || null;
}

function isTech1WinnerRevealed(bracket = null) {
  return Boolean(getBracketWinner(bracket) && (bracket?.winnerRevealStatus === "revealed" || bracket?.winnerRevealedAt));
}

function renderWinnerRevealNotice(bracket = null, isStaff = false) {
  const winner = getBracketWinner(bracket);
  if (!winner) return "";
  if (isTech1WinnerRevealed(bracket)) {
    return `<div class="registration-form-note" data-tone="ready">Final winner: ${escapeHtml(winner.name || "Winner")}</div>`;
  }
  return `
    <div class="registration-form-note" data-tone="warning">Final battle complete. Winner reveal is pending.</div>
    ${isStaff ? `
      <div class="self-register-profile-actions tech1-centered-actions">
        <button class="button button-accent" type="button" data-tech1-action="reveal-winner">Reveal Final Winner</button>
      </div>
    ` : ""}
  `;
}

function normalizeDuplicateKey(value = "") {
  return String(value || "").trim().toLowerCase().replace(/^@+/, "").replace(/\s+/g, " ");
}

function buildDuplicateHints(registrations = []) {
  const counts = new Map();
  registrations.forEach((entry) => {
    [
      entry.instagram ? `ig:${normalizeDuplicateKey(entry.instagram)}` : "",
      entry.name ? `name:${normalizeDuplicateKey(entry.name)}` : "",
      entry.teamName && entry.name ? `team-name:${normalizeDuplicateKey(entry.teamName)}:${normalizeDuplicateKey(entry.name)}` : "",
    ].filter(Boolean).forEach((key) => counts.set(key, (counts.get(key) || 0) + 1));
  });
  return counts;
}

function renderPublicRoster(publicIndex = []) {
  const rows = sortTech1RegistrationsForDisplay(publicIndex).slice(0, 80);
  if (!rows.length) {
    return `<div class="empty-state">Registered drivers will appear here once sign-ups begin.</div>`;
  }
  return `
    <div class="registration-stack tech1-roster-list">
      ${rows.map((entry) => `
        <article class="self-register-profile-card">
          <span>${entry.checkedIn ? "Checked In" : "Registered"}</span>
          <strong>${escapeHtml(entry.displayName || "Unnamed Driver")}</strong>
          <small>${escapeHtml([entry.teamName, entry.chassis, entry.instagram].filter(Boolean).join(" | ") || "Details coming soon")}</small>
        </article>
      `).join("")}
    </div>
  `;
}

function renderBracketMatch(match = {}, isStaff = false, options = {}) {
  const drivers = [match.driverA, match.driverB];
  const winnerId = match.winnerId || "";
  const isFirstRound = Number(match.round || 1) <= 1;
  const emptySlotLabel = isFirstRound ? "Bye" : "Pending";
  const emptySlotHelp = isFirstRound ? "First-round auto advance slot" : "Awaiting winner from earlier round";
  const isFinalMatch = !match.advancedToMatchId;
  const concealWinner = Boolean(isFinalMatch && winnerId && !options.winnerRevealed);
  const visibleWinnerId = concealWinner ? "" : winnerId;
  const judgeControl = options.judgeControl || {};
  const isMobileJudgedMatch = judgeControl.matchId === match.id && judgeControl.status === "voting";
  const judgeRoles = getTech1ControlJudgeRoles(judgeControl);
  const submittedVotes = countSubmittedTech1Votes(judgeControl);
  const matchTitle = concealWinner
    ? "Reveal Pending"
    : match.resultStatus === "bye"
      ? "Bye Advance"
      : match.resultStatus === "complete"
        ? "Complete"
        : "Pending";
  return `
    <article class="broadcast-match-card">
      <p class="broadcast-match-label">${escapeHtml(match.roundName || `Round ${match.round}`)} | Match ${escapeHtml(match.matchNumber || "")}${match.sourceSlotStart ? ` | Slots ${escapeHtml(match.sourceSlotStart)}-${escapeHtml(match.sourceSlotEnd)}` : ""}</p>
      <h4 class="broadcast-match-title">${escapeHtml(matchTitle)}</h4>
      ${isMobileJudgedMatch ? `<div class="registration-form-note" data-tone="ready">Mobile judge flow active. ${escapeHtml(String(submittedVotes))}/${escapeHtml(String(judgeRoles.length))} votes submitted.</div>` : ""}
      <div class="registration-stack">
        ${drivers.map((driver, index) => driver ? `
          <div class="driver-status-row ${visibleWinnerId === driver.id ? "is-current-driver" : ""}">
            <span>${escapeHtml(index === 0 ? "A" : "B")}</span>
            <strong>${escapeHtml(driver.name || "Unnamed Driver")}</strong>
            <small>${escapeHtml(driver.teamName || driver.instagram || "")}</small>
            ${isStaff && !winnerId && match.driverA && match.driverB ? `<button class="micro-button" type="button" data-tech1-action="record-winner" data-match-id="${escapeAttributeValue(match.id)}" data-winner-id="${escapeAttributeValue(driver.id)}">Manual Override</button>` : ""}
          </div>
        ` : `
          <div class="driver-status-row">
            <span>${escapeHtml(index === 0 ? "A" : "B")}</span>
            <strong>${escapeHtml(emptySlotLabel)}</strong>
            <small>${escapeHtml(emptySlotHelp)}</small>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function renderVisibleSlot(slot = {}) {
  return `
    <article class="driver-status-row tech1-slot-row">
      <span>Slot ${escapeHtml(slot.slotNumber || "")}</span>
      <strong>${slot.driver ? escapeHtml(slot.driver.name || "Unnamed Driver") : "Bye"}</strong>
      <small>${slot.driver ? escapeHtml([slot.driver.teamName, slot.driver.instagram].filter(Boolean).join(" | ") || `Match ${slot.matchId}`) : "First-round auto advance slot"}</small>
    </article>
  `;
}

function renderBracketPager(displayWindow) {
  if (!displayWindow.totalPages || displayWindow.totalPages <= 1) return "";
  const pageIndex = displayWindow.pageIndex || 0;
  const previousIndex = Math.max(0, pageIndex - 1);
  const nextIndex = Math.min(displayWindow.totalPages - 1, pageIndex + 1);
  return `
    <div class="tech1-bracket-pager" role="navigation" aria-label="Tech 1 bracket slot groups">
      <div class="self-register-profile-actions">
        <button class="micro-button" type="button" data-tech1-action="bracket-page" data-page-index="${previousIndex}" ${pageIndex === 0 ? "disabled" : ""}>Previous</button>
        <button class="micro-button" type="button" data-tech1-action="bracket-page" data-page-index="${nextIndex}" ${pageIndex >= displayWindow.totalPages - 1 ? "disabled" : ""}>Next</button>
      </div>
      <div class="tech1-bracket-group-buttons">
        ${Array.from({ length: displayWindow.totalPages }, (_, index) => `
          <button class="micro-button ${index === pageIndex ? "button-accent" : ""}" type="button" data-tech1-action="bracket-page" data-page-index="${index}" aria-current="${index === pageIndex ? "page" : "false"}">Group ${index + 1}</button>
        `).join("")}
      </div>
    </div>
  `;
}

function getTech1ViewPlayableMatches(bracket = null) {
  return Object.values(bracket?.matches || {})
    .filter((match) => match?.driverA && match?.driverB && !match.winnerId)
    .sort((left, right) => (Number(left.round || 0) - Number(right.round || 0))
      || (Number(left.matchNumber || 0) - Number(right.matchNumber || 0)));
}

function getTech1ViewActiveRoundNumber(bracket = null) {
  return Number(getTech1ViewPlayableMatches(bracket)[0]?.round || 0);
}

function getTech1ViewActiveFieldSize(bracket = null) {
  const bracketSize = Number(bracket?.bracketSize || 0);
  const activeRound = getTech1ViewActiveRoundNumber(bracket);
  if (!bracketSize || !activeRound) return bracketSize;
  return Math.max(1, Math.round(bracketSize / (2 ** (Math.max(1, activeRound) - 1))));
}

function shouldRenderUnifiedTop32Bracket(bracket = null) {
  const bracketSize = Number(bracket?.bracketSize || 0);
  const activeRound = getTech1ViewActiveRoundNumber(bracket);
  return Boolean(
    bracket?.matches
    && bracketSize > TECH1_BRACKET_DISPLAY_PAGE_SIZE
    && activeRound
    && getTech1ViewActiveFieldSize(bracket) <= TECH1_BRACKET_DISPLAY_PAGE_SIZE
  );
}

function getUnifiedTop32StartRound(bracket = null) {
  const explicitTop32Round = (bracket?.rounds || [])
    .find((round) => String(round?.name || "").trim().toLowerCase() === "top 32");
  if (explicitTop32Round) {
    return Math.max(1, Number(explicitTop32Round.round || 1));
  }
  const bracketSize = Math.max(1, Number(bracket?.bracketSize || 0));
  if (!bracketSize) return 1;
  if (bracketSize <= TECH1_BRACKET_DISPLAY_PAGE_SIZE) return 1;
  const estimated = Math.round(Math.log2(bracketSize / TECH1_BRACKET_DISPLAY_PAGE_SIZE)) + 1;
  const roundCount = Math.max(1, Number(bracket?.rounds?.length || 1));
  return Math.min(roundCount, Math.max(1, estimated));
}

function getUnifiedTop32DisplayWindow(bracket = null) {
  const activeFieldSize = Math.min(TECH1_BRACKET_DISPLAY_PAGE_SIZE, Math.max(1, getTech1ViewActiveFieldSize(bracket)));
  const startRound = getUnifiedTop32StartRound(bracket);
  const visibleMatches = Object.values(bracket?.matches || {})
    .filter((match) => Number(match?.round || 0) >= startRound)
    .sort((left, right) => (Number(left.round || 0) - Number(right.round || 0))
      || (Number(left.matchNumber || 0) - Number(right.matchNumber || 0)));
  return {
    totalSlots: activeFieldSize,
    pageSize: TECH1_BRACKET_DISPLAY_PAGE_SIZE,
    pageIndex: 0,
    totalPages: 1,
    startSlot: 1,
    endSlot: activeFieldSize,
    visibleSlots: [],
    visibleMatches,
    driverCount: activeFieldSize,
    bracketSize: activeFieldSize,
    byeCount: 0,
    unifiedTop32: true,
  };
}

function renderBracketModeNotice(displayWindow) {
  if (!displayWindow?.unifiedTop32) return "";
  return `
    <div class="tech1-bracket-mode-note" role="status" aria-live="polite">
      <strong>Top 32 Bracket Locked In</strong>
      <span>Groups have merged into one live bracket for the main show.</span>
    </div>
  `;
}

function renderBracket(bracket = null, isStaff = false, options = {}) {
  if (!bracket?.rounds?.length || !bracket?.matches) {
    return `<div class="empty-state">The randomized battle bracket has not been generated yet.</div>`;
  }
  const winnerRevealed = options.winnerRevealed ?? isTech1WinnerRevealed(bracket);
  const displayWindow = shouldRenderUnifiedTop32Bracket(bracket)
    ? getUnifiedTop32DisplayWindow(bracket)
    : getBracketDisplayWindow(bracket, {
      pageSize: options.pageSize || TECH1_BRACKET_DISPLAY_PAGE_SIZE,
      pageIndex: options.pageIndex || 0,
      showByes: true,
    });
  const finalMatch = Object.values(bracket.matches || {}).find((match) => !match.advancedToMatchId) || null;
  const showTrueFinalDestination = displayWindow.totalPages > 1 && !(finalMatch?.driverA || finalMatch?.driverB || finalMatch?.winnerId);
  const bracketMode = displayWindow.unifiedTop32 ? "top32" : "grouped";
  const headerTitle = displayWindow.unifiedTop32
    ? "Top 32 Unified Bracket"
    : `Viewing slots ${displayWindow.startSlot}-${displayWindow.endSlot} of ${displayWindow.totalSlots}`;
  const roundsByNumber = displayWindow.visibleMatches.reduce((groups, match) => {
    const roundNumber = Number(match.round || 1);
    if (!groups.has(roundNumber)) groups.set(roundNumber, []);
    groups.get(roundNumber).push(match);
    return groups;
  }, new Map());
  return `
    <div class="tech1-bracket-window" data-bracket-mode="${escapeAttributeValue(bracketMode)}" data-page-index="${escapeAttributeValue(displayWindow.pageIndex)}" data-page-size="${escapeAttributeValue(displayWindow.pageSize)}">
      ${renderBracketModeNotice(displayWindow)}
      <div class="panel-header compact tech1-centered-header">
        <div>
          <p class="section-kicker">Random Single-Elimination Bracket</p>
          <h3>${escapeHtml(headerTitle)}</h3>
        </div>
      </div>
      <div class="broadcast-match-meta">
        ${renderStat("Checked-in drivers", displayWindow.driverCount, "tone-ready")}
        ${renderStat("Bracket size", displayWindow.bracketSize, "tone-muted")}
        ${renderStat("First-round byes", displayWindow.byeCount, "tone-muted")}
        ${renderStat(displayWindow.unifiedTop32 ? "Mode" : "Group", displayWindow.unifiedTop32 ? "Top 32" : `${displayWindow.pageIndex + 1}/${displayWindow.totalPages || 1}`, "tone-live")}
      </div>
      ${showTrueFinalDestination ? `
        <div class="empty-state tech1-final-destination-note">
          <strong>True Final Battle</strong>
          <span>This is not a group final. Group ${escapeHtml(displayWindow.pageIndex + 1)} is only a view of slots ${escapeHtml(displayWindow.startSlot)}-${escapeHtml(displayWindow.endSlot)}. All groups feed through one bracket into the true final.</span>
        </div>
      ` : ""}
      ${renderBracketPager(displayWindow)}
      ${displayWindow.unifiedTop32 ? "" : `<section class="panel tech1-visible-slot-panel">
        <div class="panel-header compact">
          <div>
            <p class="section-kicker">Visible Source Slots</p>
            <h3>Slots ${escapeHtml(displayWindow.startSlot)}-${escapeHtml(displayWindow.endSlot)}</h3>
          </div>
        </div>
        <div class="registration-stack">
          ${displayWindow.visibleSlots.map(renderVisibleSlot).join("")}
        </div>
      </section>`}
      <div class="streamer-help-grid">
        ${Array.from(roundsByNumber.entries()).map(([roundNumber, matches]) => `
        <section class="panel">
          <div class="panel-header compact tech1-centered-header">
            <div>
              <p class="section-kicker">${escapeHtml(matches[0]?.roundName || `Round ${roundNumber}`)}</p>
              <h3>${escapeHtml(matches.length)} Visible Match${matches.length === 1 ? "" : "es"}</h3>
            </div>
          </div>
          <div class="registration-stack">
            ${matches.map((match) => renderBracketMatch(match, isStaff, { winnerRevealed, judgeControl: bracket.tech1JudgeControl || null })).join("")}
          </div>
        </section>
      `).join("")}
      </div>
    </div>
  `;
}

function renderTech1DeskRegistrationForm(model = {}, bracketLocked = false) {
  const bracketAlreadyGenerated = Boolean(model.bracketAlreadyGenerated);
  const freeTickets = Number(model.config?.freeTicketsPerRegistration || TECH1DRIFT_ANNIVERSARY_CONFIG.freeTicketsPerRegistration || 1);
  const ticketPrice = Number(model.config?.raffleTicketPrice || TECH1DRIFT_ANNIVERSARY_CONFIG.raffleTicketPrice || 5);
  const entryFee = Number(model.config?.entryFee || TECH1DRIFT_ANNIVERSARY_CONFIG.entryFee || 0);
  const tech1DriverEntryFee = Number(model.config?.tech1DriverEntryFee || TECH1DRIFT_ANNIVERSARY_CONFIG.tech1DriverEntryFee || entryFee);
  const statusText = model.syncReady
    ? `Extra raffle tickets are staff-confirmed at ${formatTicketMoney(ticketPrice)} each.`
    : "Connect cloud sync before saving live desk registrations. You can still type the next driver now.";
  return `
    <form id="tech1DeskRegistrationForm" class="registration-draft-form tech1-desk-registration-form">
      <div class="panel-header compact tech1-centered-header">
        <div>
          <p class="section-kicker">Registration Desk</p>
          <h3>Save Driver At Desk</h3>
        </div>
      </div>
      <div class="tech1-desk-grid">
        <section class="tech1-desk-card">
          <p class="section-kicker">Driver Info</p>
          <div class="self-register-form-grid">
            <label class="modal-field">
              <span>Name</span>
              <input id="tech1DeskName" name="name" type="text" maxlength="80" autocomplete="name" required />
            </label>
            <label class="modal-field">
              <span>Team</span>
              <input id="tech1DeskTeamName" name="teamName" type="text" maxlength="80" />
            </label>
            <label class="modal-field">
              <span>Chassis</span>
              <input id="tech1DeskChassis" name="chassis" type="text" maxlength="80" />
            </label>
            <label class="modal-field">
              <span>Instagram</span>
              <input id="tech1DeskInstagram" name="instagram" type="text" maxlength="40" placeholder="@handle" />
            </label>
          </div>
        </section>
        <section class="tech1-desk-card">
          <p class="section-kicker">Event Options</p>
          <label class="tech1-toggle-control">
            <input id="tech1DeskCompeting" name="competing" type="checkbox" checked ${bracketLocked ? "data-bracket-locked=\"true\"" : ""} />
            <span>
              <strong>Competing</strong>
              <small>Add this driver to the bracket pool.</small>
            </span>
          </label>
          <label class="tech1-toggle-control">
            <input id="tech1DeskTech1Driver" name="tech1Driver" type="checkbox" />
            <span>
              <strong>Tech 1 Driver</strong>
              <small>Use the ${formatTicketMoney(tech1DriverEntryFee)} Tech 1 entry fee.</small>
            </span>
          </label>
          <div class="registration-form-note" data-tone="ready">Desk registrations are marked Checked In automatically because the driver is present with event staff.</div>
          ${bracketLocked
            ? `<div class="registration-form-note" data-tone="warning">This bracket is locked. Unlock it first if you need to add or change competing drivers.</div>`
            : bracketAlreadyGenerated
              ? `<div class="registration-form-note" data-tone="warning">A bracket already exists. You can still add or change Competing drivers, then regenerate when you want the stored field updated.</div>`
              : ""}
        </section>
        <section class="tech1-desk-card">
          <p class="section-kicker">Raffle</p>
          <div class="self-register-form-grid">
            <label class="modal-field">
              <span>Extra Raffle Tickets Purchased</span>
              <input id="tech1DeskPaidTickets" name="paidTickets" type="number" min="0" step="1" value="0" data-ticket-price="${escapeAttributeValue(ticketPrice)}" data-free-tickets="${escapeAttributeValue(freeTickets)}" data-entry-fee="${escapeAttributeValue(entryFee)}" data-tech1-entry-fee="${escapeAttributeValue(tech1DriverEntryFee)}" />
            </label>
            <label class="modal-field">
              <span>Payment Method</span>
              <select id="tech1DeskPaymentMethod" name="paymentMethod">
                ${renderTech1PaymentMethodOptions("cash")}
              </select>
            </label>
          </div>
          <div class="tech1-ticket-preview">
            <span>Free raffle ticket: <strong>${escapeHtml(String(freeTickets))}</strong></span>
            <span>Total raffle tickets: <strong id="tech1DeskTicketTotalPreview">${escapeHtml(String(freeTickets))}</strong></span>
            <span>Competition entry fee: <strong id="tech1DeskEntryFeePreview">${formatTicketMoney(entryFee)}</strong></span>
            <span>Extra raffle total: <strong id="tech1DeskRaffleAmountPreview">${formatTicketMoney(0)}</strong></span>
            <span>Total manual amount: <strong id="tech1DeskAmountPreview">${formatTicketMoney(entryFee)}</strong></span>
          </div>
        </section>
      </div>
      <div class="registration-form-actions tech1-centered-actions tech1-desk-save-actions">
        <button class="button button-accent" type="submit" data-tech1-action="save-desk-driver">Save Driver</button>
        <div id="tech1DeskStatus" class="registration-form-note tech1-desk-status">${escapeHtml(statusText)}</div>
      </div>
    </form>
  `;
}

function renderStaffRegistrationRows(registrations = [], options = {}) {
  const searchQuery = String(options.searchQuery || "").trim().toLowerCase();
  const sortMode = String(options.sortMode || "signup-asc");
  const sortedRows = sortTech1RegistrationsForDisplay(registrations);
  const filteredRows = searchQuery
    ? sortedRows.filter((entry) => [
      entry.name,
      entry.teamName,
      entry.chassis,
      entry.instagram,
      entry.paymentMethod,
      entry.driverNumber,
    ].map((value) => String(value || "").toLowerCase()).join(" ").includes(searchQuery))
    : sortedRows;
  const rows = [...filteredRows];
  const textCompare = (left, right) => String(left || "").localeCompare(String(right || ""), undefined, { sensitivity: "base" });
  switch (sortMode) {
    case "signup-desc":
      rows.sort((left, right) => Number(right.signUpPosition || 0) - Number(left.signUpPosition || 0));
      break;
    case "name-asc":
      rows.sort((left, right) => textCompare(left?.name, right?.name));
      break;
    case "name-desc":
      rows.sort((left, right) => textCompare(right?.name, left?.name));
      break;
    case "team-asc":
      rows.sort((left, right) => textCompare(left?.teamName, right?.teamName) || textCompare(left?.name, right?.name));
      break;
    case "team-desc":
      rows.sort((left, right) => textCompare(right?.teamName, left?.teamName) || textCompare(right?.name, left?.name));
      break;
    case "paid-desc":
      rows.sort((left, right) => Number(right.paidTickets || 0) - Number(left.paidTickets || 0));
      break;
    case "paid-asc":
      rows.sort((left, right) => Number(left.paidTickets || 0) - Number(right.paidTickets || 0));
      break;
    case "signup-asc":
    default:
      rows.sort((left, right) => Number(left.signUpPosition || 0) - Number(right.signUpPosition || 0));
      break;
  }
  if (!sortedRows.length) return `<div class="empty-state">No private registrations have synced for staff yet.</div>`;
  if (!rows.length) return `<div class="empty-state">No drivers match this search filter.</div>`;
  const duplicateHints = buildDuplicateHints(rows);
  const bracketLocked = Boolean(options.bracketLocked);
  const bracketExistsAlready = Boolean(options.bracketExists);
  return `
    <div class="registration-stack tech1-driver-list">
      ${rows.map((entry) => {
        const isDuplicateLike = [
          entry.instagram ? `ig:${normalizeDuplicateKey(entry.instagram)}` : "",
          entry.name ? `name:${normalizeDuplicateKey(entry.name)}` : "",
          entry.teamName && entry.name ? `team-name:${normalizeDuplicateKey(entry.teamName)}:${normalizeDuplicateKey(entry.name)}` : "",
        ].filter(Boolean).some((key) => (duplicateHints.get(key) || 0) > 1);
        const paidTickets = Number(entry.paidTickets || 0);
        const totalTickets = Number(entry.totalTickets || entry.freeTickets || 1);
        const entryFee = getTech1EntryFeeForRegistration(entry);
        const raffleAmountPaid = Number(entry.amountPaid || 0);
        const amountPaid = entryFee + raffleAmountPaid;
        return `
        <article class="self-register-profile-card tech1-driver-card">
          <div class="tech1-driver-card-header">
            <div>
              <span>${entry.checkedIn ? "Checked In" : "Registered"} | ${entry.bracketEligible ? "Competing" : "Not competing"}${entry.tech1Driver ? " | Tech 1 Driver" : ""} | ${escapeHtml(entry.paymentStatus || "free-only")}${paidTickets > 0 ? ` | ${escapeHtml(normalizeTech1PaymentMethodValue(entry.paymentMethod, "cash").toUpperCase())}` : ""}${isDuplicateLike ? " | Possible duplicate" : ""}</span>
              <strong>${escapeHtml(entry.name || "Unnamed Driver")}</strong>
              <small>${escapeHtml([entry.teamName, entry.chassis, entry.instagram].filter(Boolean).join(" | ") || "No details saved")}</small>
            </div>
            <div class="tech1-driver-card-actions">
              <button class="micro-button" type="button" data-tech1-action="edit-driver" data-registration-id="${escapeAttributeValue(entry.id)}">Edit</button>
              <button class="micro-button button-danger" type="button" data-tech1-action="delete-driver" data-registration-id="${escapeAttributeValue(entry.id)}">Delete</button>
              <button class="micro-button ${entry.bracketEligible ? "button-accent" : ""}" type="button" data-tech1-action="toggle-competing" data-registration-id="${escapeAttributeValue(entry.id)}" data-next-value="${entry.bracketEligible ? "false" : "true"}" ${bracketLocked ? "disabled" : ""}>${entry.bracketEligible ? "Competing" : "Add To Competing"}</button>
              <button class="micro-button" type="button" data-tech1-action="toggle-checked-in" data-registration-id="${escapeAttributeValue(entry.id)}" data-next-value="${entry.checkedIn ? "false" : "true"}">${entry.checkedIn ? "Checked In" : "Check In"}</button>
            </div>
          </div>
          ${!bracketLocked && bracketExistsAlready && entry.bracketEligible ? `<div class="registration-form-note" data-tone="warning">Competing status changed after bracket generation. Regenerate the bracket when you want this reflected in the live field.</div>` : ""}
          <form class="tech1-driver-update-form" data-registration-id="${escapeAttributeValue(entry.id)}">
            <div class="self-register-form-grid">
              <label class="modal-field">
                <span>Name</span>
                <input name="name" type="text" maxlength="80" value="${escapeAttributeValue(entry.name || "")}" required />
              </label>
              <label class="modal-field">
                <span>Team</span>
                <input name="teamName" type="text" maxlength="80" value="${escapeAttributeValue(entry.teamName || "")}" />
              </label>
              <label class="modal-field">
                <span>Chassis</span>
                <input name="chassis" type="text" maxlength="80" value="${escapeAttributeValue(entry.chassis || "")}" />
              </label>
              <label class="modal-field">
                <span>Instagram</span>
                <input name="instagram" type="text" maxlength="40" value="${escapeAttributeValue(entry.instagram || "")}" />
              </label>
            </div>
            <div class="registration-form-actions">
              <button class="micro-button" type="submit">Update Driver Info</button>
            </div>
          </form>
          <form class="tech1-ticket-update-form" data-registration-id="${escapeAttributeValue(entry.id)}">
            <div class="driver-status-row tech1-raffle-row">
              <span>Extra Raffle Tickets Purchased</span>
              <input name="paidTickets" type="number" min="0" step="1" value="${escapeAttributeValue(paidTickets)}" aria-label="Extra raffle tickets purchased for ${escapeAttributeValue(entry.name || "driver")}" />
              <select name="paymentMethod" aria-label="Payment method for ${escapeAttributeValue(entry.name || "driver")}">
                ${renderTech1PaymentMethodOptions(entry.paymentMethod || "cash")}
              </select>
              <label class="tech1-inline-toggle"><input name="tech1Driver" type="checkbox" ${entry.tech1Driver ? "checked" : ""} /> Tech 1 Driver</label>
              <strong>${escapeHtml(String(totalTickets))} total ticket${totalTickets === 1 ? "" : "s"}</strong>
              <small>${formatTicketMoney(entryFee)} entry + ${formatTicketMoney(raffleAmountPaid)} raffle = ${formatTicketMoney(amountPaid)}</small>
              <button class="micro-button" type="submit">Update Tickets</button>
            </div>
          </form>
        </article>
      `; }).join("")}
    </div>
  `;
}

function renderTech1MobileJudgingStatus(bracket = null) {
  const control = bracket?.tech1JudgeControl || null;
  if (!bracket?.rounds?.length) return "";
  if (!control?.matchId || control.status === "idle") {
    return `<div class="registration-form-note" data-tone="ready">Mobile judging inherits the solo-driver battle flow. Judges will see the next playable Tech 1 battle after the bracket is generated.</div>`;
  }
  const judgeRoles = getTech1ControlJudgeRoles(control);
  const submittedVotes = countSubmittedTech1Votes(control);
  const matchLabel = control.entry?.title
    ? `${control.entry.title} ${control.entry.meta || ""}`.trim()
    : control.matchId;
  return `<div class="registration-form-note" data-tone="ready">Mobile judging active for ${escapeHtml(matchLabel)}. ${escapeHtml(String(submittedVotes))}/${escapeHtml(String(judgeRoles.length))} votes submitted.</div>`;
}

function renderStaffPanel(model = {}) {
  if (!model.isStaff) {
    return `
      <section class="panel">
        <div class="panel-header compact">
          <div>
            <p class="section-kicker">Staff</p>
            <h2>Event Staff Login</h2>
          </div>
        </div>
        <p class="landing-section-copy">Paid raffle tickets and bracket locking are confirmed by authorized event staff only.</p>
        <button class="button button-secondary" type="button" data-action="open-staff-login">Event Staff Login</button>
      </section>
    `;
  }

  const bracket = model.bracket || null;
  const locked = bracket?.status === "locked" || bracket?.status === "in_progress" || bracket?.status === "complete";
  const bracketPoolLocked = isBracketPoolLocked(bracket);
  const bracketAlreadyGenerated = bracketExists(bracket);
  const source = bracket?.source || model.defaultBracketSource || "bracketEligible";
  const projection = model.projection || getSingleEliminationBracketProjection(model.privateRegistrations, { source });
  const totals = summarizeTech1Registrations(model.privateRegistrations);
  const staffSearchQuery = String(model.staffSearchQuery || "");
  const staffSortMode = String(model.staffSortMode || "signup-asc");
  const driverCount = Number(bracket?.driverCount ?? projection.eligibleCount ?? 0);
  const bracketSize = Number(bracket?.bracketSize ?? projection.bracketSize ?? 0);
  const byeCount = Number(bracket?.byes?.length ?? projection.byeCount ?? 0);
  const winner = getBracketWinner(bracket);
  return `
    <section class="panel tech1-staff-panel">
      <div class="panel-header compact tech1-centered-header">
        <div>
          <p class="section-kicker">Staff Controls</p>
          <h2>Tech 1 Drift Anniversary Registration Desk</h2>
        </div>
      </div>
      <div class="broadcast-match-meta">
        ${renderStat("Private registrations", totals.registrations, "tone-ready")}
        ${renderStat("Competing", totals.competing, "tone-live")}
        ${renderStat("Checked in", totals.checkedIn, "tone-ready")}
        ${renderStat("Free tickets", totals.freeTickets, "tone-ready")}
        ${renderStat("Paid tickets", totals.paidTickets, "tone-live")}
        ${renderStat("Total tickets", totals.totalTickets, "tone-live")}
        ${renderStat("Entry fees", formatTicketMoney(totals.entryFees), "tone-ready")}
        ${renderStat("Raffle revenue", formatTicketMoney(totals.raffleAmountPaid), "tone-ready")}
        ${renderStat("Total collected", formatTicketMoney(totals.amountPaid), "tone-live")}
        ${renderStat("Bracket", bracket?.status || "not_generated", locked ? "tone-live" : "tone-muted")}
        ${renderStat("Bracket field", bracketSize ? `${driverCount}/${bracketSize}` : "Not ready", "tone-muted")}
        ${renderStat("Byes", byeCount, "tone-muted")}
      </div>
      ${renderWinnerRevealNotice(bracket, true)}
      ${renderTech1MobileJudgingStatus(bracket)}
      ${source === "allRegistered" ? `<div class="registration-form-note" data-tone="warning">This bracket was generated from all registered drivers, which can include drivers not marked Competing.</div>` : ""}
      ${renderTech1DeskRegistrationForm({ ...model, bracketAlreadyGenerated }, bracketPoolLocked)}
      <div class="self-register-profile-actions tech1-centered-actions">
        <button class="button button-accent" type="button" data-tech1-action="initialize-event">Initialize Tech 1 Event</button>
        <button class="button button-secondary" type="button" data-tech1-action="load-sample-drivers">Load Sample Drivers</button>
        <button class="button button-secondary" type="button" data-tech1-action="generate-bracket" data-source="bracketEligible">Generate From Competing</button>
        ${bracketPoolLocked && bracket?.status === "locked"
          ? `<button class="micro-button" type="button" data-tech1-action="unlock-bracket">Unlock Bracket</button>`
          : `<button class="micro-button" type="button" data-tech1-action="lock-bracket">Lock Bracket</button>`}
        <button class="micro-button button-danger" type="button" data-tech1-action="reset-winners">Reset Winners</button>
        <button class="micro-button" type="button" data-tech1-action="export-pdf">Export Raffle PDF</button>
      </div>
      <div class="registration-roster-head" style="margin-top: 14px;">
        <div>
          <p class="section-kicker">Driver Queue</p>
          <h2>Staff Registrations</h2>
        </div>
        <div class="registration-roster-tools">
          <label class="search-field registration-roster-search" for="tech1StaffSearchInput">
            <span>Search Drivers</span>
            <input id="tech1StaffSearchInput" type="search" value="${escapeAttributeValue(staffSearchQuery)}" placeholder="Name, team, chassis, @handle, payment" autocomplete="off" />
          </label>
          <label class="search-field registration-roster-sort" for="tech1StaffSortSelect">
            <span>Sort By</span>
            <select id="tech1StaffSortSelect">
              <option value="signup-asc" ${staffSortMode === "signup-asc" ? "selected" : ""}>Registration Order (Oldest First)</option>
              <option value="signup-desc" ${staffSortMode === "signup-desc" ? "selected" : ""}>Registration Order (Newest First)</option>
              <option value="name-asc" ${staffSortMode === "name-asc" ? "selected" : ""}>Name (A-Z)</option>
              <option value="name-desc" ${staffSortMode === "name-desc" ? "selected" : ""}>Name (Z-A)</option>
              <option value="team-asc" ${staffSortMode === "team-asc" ? "selected" : ""}>Team (A-Z)</option>
              <option value="team-desc" ${staffSortMode === "team-desc" ? "selected" : ""}>Team (Z-A)</option>
              <option value="paid-desc" ${staffSortMode === "paid-desc" ? "selected" : ""}>Extra Tickets (High-Low)</option>
              <option value="paid-asc" ${staffSortMode === "paid-asc" ? "selected" : ""}>Extra Tickets (Low-High)</option>
            </select>
          </label>
        </div>
      </div>
      <div id="tech1StaffRegistrations">${renderStaffRegistrationRows(model.privateRegistrations, { bracketLocked: bracketPoolLocked, bracketExists: bracketAlreadyGenerated, searchQuery: staffSearchQuery, sortMode: staffSortMode })}</div>
    </section>
  `;
}

export function renderTech1EventControlPanel(model = {}) {
  const privateRegistrations = model.privateRegistrations || [];
  const bracket = model.bracket || null;
  const source = bracket?.source || model.defaultBracketSource || TECH1DRIFT_ANNIVERSARY_CONFIG.defaultBracketSource;
  const projection = model.projection || getSingleEliminationBracketProjection(privateRegistrations, { source });
  const includeBracketSection = model.includeBracketSection !== false;
  return `
    <section class="panel tech1-event-control-panel registration-admin-only">
      ${renderStaffPanel({ ...model, privateRegistrations, projection, isStaff: Boolean(model.isStaff) })}
      ${includeBracketSection ? `<section class="panel">
        <div class="panel-header compact tech1-centered-header">
          <div>
            <p class="section-kicker">Bracket View</p>
            <h2>Stored Randomized Bracket</h2>
          </div>
        </div>
        <div id="tech1AdminBracket">${renderBracket(bracket, Boolean(model.isStaff), { pageIndex: model.bracketPageIndex || 0 })}</div>
      </section>` : ""}
    </section>
  `;
}

export function renderTech1CompetitionBracketPanel(model = {}) {
  const bracket = model.bracket || null;
  const isStaff = Boolean(model.isStaff);
  return `
    <section class="panel tech1-competition-tab-panel">
      <div class="panel-header compact tech1-centered-header">
        <div>
          <p class="section-kicker">Tech 1 Drift Anniversary</p>
          <h2>Competition Bracket</h2>
        </div>
      </div>
      ${renderWinnerRevealNotice(bracket, isStaff)}
      ${renderTech1MobileJudgingStatus(bracket)}
      <div id="tech1CompetitionBracket">${renderBracket(bracket, isStaff, { pageIndex: model.bracketPageIndex || 0 })}</div>
      ${isStaff && bracket?.rounds?.length ? `
        <div class="tech1-bracket-reset-actions">
          <button class="button button-danger" type="button" data-tech1-action="reset-winners">Reset Bracket</button>
        </div>
      ` : ""}
    </section>
  `;
}

export function renderTech1DriftAnniversaryView(model = {}) {
  const config = model.config || TECH1DRIFT_ANNIVERSARY_CONFIG;
  const publicIndex = model.publicIndex || [];
  const privateRegistrations = model.privateRegistrations || [];
  const checkedInCount = publicIndex.filter((entry) => entry.checkedIn).length;
  const registeredCount = publicIndex.length || privateRegistrations.length;
  const bracket = model.bracket || null;
  const winner = getBracketWinner(bracket);
  const registrationStatus = !model.syncReady
    ? "Offline preview mode. Connect sync before collecting live registrations."
    : !model.eventInitialized
      ? "Event staff are opening Tech 1 registration. Please check back soon."
      : model.registrationOpen
        ? "Registration is open. Each registration receives 1 free raffle ticket. Additional tickets are purchased from event staff."
        : "Tech 1 registration is currently closed.";
  const registrationDisabled = !model.syncReady || !model.eventInitialized || !model.registrationOpen;
  return `
    <header class="hero hero-simple spectator-only public-product-hero tech1-hero tech1-centered-header">
      <div class="hero-copy-block">
        ${renderTech1BrandMark(config)}
        <p class="eyebrow">Tech 1 Drift Anniversary</p>
        <h1>${escapeHtml(config.heroTitle)}</h1>
        <p class="hero-copy">${escapeHtml(config.heroSubtitle)}</p>
        <div class="public-event-actions tech1-centered-actions">
          <button class="button button-accent" type="button" data-tech1-jump="tech1-register">Register Guest / Driver</button>
          <button class="button button-secondary" type="button" data-tech1-jump="tech1-bracket">View Bracket</button>
          <button class="micro-button" type="button" data-action="open-staff-login">Staff Login</button>
        </div>
      </div>
    </header>
    <main class="landing-layout spectator-only">
      <section class="landing-stack">
        <section class="panel">
          <div class="panel-header compact tech1-centered-header">
            <div>
              <p class="section-kicker">${escapeHtml(config.dateLabel)}</p>
              <h2>No Qualifying. Randomized Battles.</h2>
            </div>
          </div>
          <div class="broadcast-match-meta">
            ${renderStat("Expected drivers", `${config.expectedDrivers}+`, "tone-ready")}
            ${renderStat("Registered", registeredCount, "tone-live")}
            ${renderStat("Checked in", checkedInCount, "tone-ready")}
            ${renderStat("Entry fee", `$${config.entryFee}`, "tone-ready")}
            ${renderStat("Free raffle", `${config.freeTicketsPerRegistration} ticket`, "tone-live")}
            ${renderStat("Extra tickets", `$${config.raffleTicketPrice}`, "tone-ready")}
          </div>
          <p class="landing-section-copy">${escapeHtml(config.additionalTicketCopy)} Event staff handle check-in, Competing status, and extra raffle tickets at the desk. Raffle ticket count never affects bracket seeding.</p>
        </section>

        <section id="tech1-register" class="panel">
          <div class="panel-header compact tech1-centered-header">
            <div>
              <p class="section-kicker">Guest / Driver Registration</p>
              <h2>Register For Tech 1 Drift</h2>
            </div>
          </div>
          <form id="tech1RegistrationForm" class="registration-draft-form">
            <div class="self-register-form-grid">
              <label class="modal-field">
                <span>Name</span>
                <input id="tech1Name" name="name" type="text" maxlength="80" autocomplete="name" required />
              </label>
              <label class="modal-field">
                <span>Chassis</span>
                <input id="tech1Chassis" name="chassis" type="text" maxlength="80" />
              </label>
              <label class="modal-field">
                <span>Team</span>
                <input id="tech1TeamName" name="teamName" type="text" maxlength="80" />
              </label>
              <label class="modal-field">
                <span>Instagram</span>
                <input id="tech1Instagram" name="instagram" type="text" maxlength="40" placeholder="@handle" />
              </label>
            </div>
            <div class="registration-form-actions">
              <div id="tech1RegistrationStatus" class="registration-form-note">${escapeHtml(registrationStatus)}</div>
              <button id="tech1RegisterSubmitBtn" class="button button-accent" type="submit" ${registrationDisabled ? "disabled" : ""}>Register And Claim Free Ticket</button>
            </div>
          </form>
        </section>

        <section class="landing-grid">
          <section class="panel">
            <div class="panel-header compact tech1-centered-header">
              <div>
                <p class="section-kicker">Public Roster</p>
                <h2>Registered Drivers</h2>
              </div>
            </div>
            <div id="tech1PublicRoster">${renderPublicRoster(publicIndex)}</div>
          </section>
          <section id="tech1-bracket" class="panel">
            <div class="panel-header compact tech1-centered-header">
              <div>
                <p class="section-kicker">Random Single Elimination</p>
                <h2>Battle Bracket</h2>
              </div>
            </div>
            <p class="landing-section-copy">Staff generates and locks the randomized bracket once. Non-power-of-two fields are handled with byes.</p>
            ${renderWinnerRevealNotice(bracket, false)}
            <div id="tech1Bracket">${renderBracket(bracket, false, { pageIndex: model.bracketPageIndex || 0 })}</div>
          </section>
        </section>

        ${renderStaffPanel({ ...model, privateRegistrations, isStaff: false })}

        <footer class="public-footer">
          <span>Tech 1 Drift Anniversary Competition runs as a special Prodigy mode.</span>
          <a href="/" data-public-route="home">Prodigy RC Comp</a>
          <a href="/privacy" data-public-route="privacy">Privacy</a>
        </footer>
      </section>
    </main>
  `;
}
