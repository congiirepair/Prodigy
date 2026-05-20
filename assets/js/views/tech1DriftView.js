import { TECH1DRIFT_ANNIVERSARY_CONFIG } from "../config/specialEvents.js";
import { sortTech1RegistrationsForDisplay } from "../data/tech1AnniversaryAdapter.js";
import { escapeAttributeValue, escapeHtml } from "../utils/dom.js";

function formatTicketMoney(value = 0) {
  return `$${Math.max(0, Number(value || 0)).toFixed(0)}`;
}

function renderStat(label, value, tone = "") {
  return `
    <div class="broadcast-match-pill ${escapeHtml(tone)}">
      <small>${escapeHtml(label)}</small>
      <strong>${escapeHtml(String(value))}</strong>
    </div>
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

function renderBracketMatch(match = {}, isStaff = false) {
  const drivers = [match.driverA, match.driverB];
  const winnerId = match.winnerId || "";
  return `
    <article class="broadcast-match-card">
      <p class="broadcast-match-label">${escapeHtml(match.roundName || `Round ${match.round}`)} | Match ${escapeHtml(match.matchNumber || "")}</p>
      <h4 class="broadcast-match-title">${escapeHtml(match.resultStatus === "bye" ? "Bye Advance" : match.resultStatus === "complete" ? "Complete" : "Pending")}</h4>
      <div class="registration-stack">
        ${drivers.map((driver, index) => driver ? `
          <div class="driver-status-row ${winnerId === driver.id ? "is-current-driver" : ""}">
            <span>${escapeHtml(index === 0 ? "A" : "B")}</span>
            <strong>${escapeHtml(driver.name || "Unnamed Driver")}</strong>
            <small>${escapeHtml(driver.teamName || driver.instagram || "")}</small>
            ${isStaff && !winnerId && match.driverA && match.driverB ? `<button class="micro-button" type="button" data-tech1-action="record-winner" data-match-id="${escapeAttributeValue(match.id)}" data-winner-id="${escapeAttributeValue(driver.id)}">Winner</button>` : ""}
          </div>
        ` : `
          <div class="driver-status-row">
            <span>${escapeHtml(index === 0 ? "A" : "B")}</span>
            <strong>Bye</strong>
            <small>Auto advance slot</small>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function renderBracket(bracket = null, isStaff = false) {
  if (!bracket?.rounds?.length || !bracket?.matches) {
    return `<div class="empty-state">The randomized battle bracket has not been generated yet.</div>`;
  }
  return `
    <div class="streamer-help-grid">
      ${bracket.rounds.map((round) => `
        <section class="panel">
          <div class="panel-header compact">
            <div>
              <p class="section-kicker">${escapeHtml(round.name || `Round ${round.round}`)}</p>
              <h3>${escapeHtml((round.matchIds || []).length)} Match${(round.matchIds || []).length === 1 ? "" : "es"}</h3>
            </div>
          </div>
          <div class="registration-stack">
            ${(round.matchIds || []).map((matchId) => renderBracketMatch(bracket.matches[matchId], isStaff)).join("")}
          </div>
        </section>
      `).join("")}
    </div>
  `;
}

function renderStaffRegistrationRows(registrations = []) {
  const rows = sortTech1RegistrationsForDisplay(registrations);
  if (!rows.length) return `<div class="empty-state">No private registrations have synced for staff yet.</div>`;
  const duplicateHints = buildDuplicateHints(rows);
  return `
    <div class="registration-stack">
      ${rows.map((entry) => {
        const isDuplicateLike = [
          entry.instagram ? `ig:${normalizeDuplicateKey(entry.instagram)}` : "",
          entry.name ? `name:${normalizeDuplicateKey(entry.name)}` : "",
          entry.teamName && entry.name ? `team-name:${normalizeDuplicateKey(entry.teamName)}:${normalizeDuplicateKey(entry.name)}` : "",
        ].filter(Boolean).some((key) => (duplicateHints.get(key) || 0) > 1);
        return `
        <article class="self-register-profile-card">
          <span>${entry.checkedIn ? "Checked In" : "Registered"} | ${escapeHtml(entry.paymentStatus || "free-only")}${isDuplicateLike ? " | Possible duplicate" : ""}</span>
          <strong>${escapeHtml(entry.name || "Unnamed Driver")}</strong>
          <small>${escapeHtml([entry.teamName, entry.chassis, entry.instagram].filter(Boolean).join(" | "))}</small>
          <div class="driver-status-row">
            <span>Raffle</span>
            <strong>${escapeHtml(String(entry.totalTickets || 1))} ticket${Number(entry.totalTickets || 1) === 1 ? "" : "s"}</strong>
            <small>${formatTicketMoney(entry.amountPaid || 0)} paid</small>
            <button class="micro-button" type="button" data-tech1-action="check-in" data-registration-id="${escapeAttributeValue(entry.id)}">${entry.checkedIn ? "Checked In" : "Check In"}</button>
          </div>
        </article>
      `; }).join("")}
    </div>
  `;
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
  const source = bracket?.source || model.defaultBracketSource || "checkedIn";
  const driverCount = Number(bracket?.driverCount ?? model.eligibleCheckedInCount ?? 0);
  const bracketSize = Number(bracket?.bracketSize ?? model.previewBracketSize ?? 0);
  const byeCount = Number(bracket?.byes?.length ?? model.previewByeCount ?? 0);
  return `
    <section class="panel tech1-staff-panel">
      <div class="panel-header compact">
        <div>
          <p class="section-kicker">Staff Controls</p>
          <h2>Raffle And Bracket Desk</h2>
        </div>
      </div>
      <div class="broadcast-match-meta">
        ${renderStat("Private registrations", model.privateRegistrations.length, "tone-ready")}
        ${renderStat("Checked in", model.eligibleCheckedInCount || 0, "tone-ready")}
        ${renderStat("Paid tickets", model.privateRegistrations.reduce((sum, entry) => sum + Number(entry.paidTickets || 0), 0), "tone-live")}
        ${renderStat("Raffle revenue", formatTicketMoney(model.privateRegistrations.reduce((sum, entry) => sum + Number(entry.amountPaid || 0), 0)), "tone-ready")}
        ${renderStat("Bracket", bracket?.status || "not_generated", locked ? "tone-live" : "tone-muted")}
        ${renderStat("Bracket field", bracketSize ? `${driverCount}/${bracketSize}` : "Not ready", "tone-muted")}
        ${renderStat("Byes", byeCount, "tone-muted")}
      </div>
      <p class="landing-section-copy">Default bracket generation uses checked-in drivers. Generating from all registered drivers can include no-shows. Raffle ticket totals never affect seeding.</p>
      ${source === "allRegistered" ? `<div class="registration-form-note" data-tone="warning">This bracket was generated from all registered drivers, not checked-in drivers.</div>` : ""}
      <div class="self-register-profile-actions">
        <button class="button button-accent" type="button" data-tech1-action="initialize-event">Initialize Tech 1 Event</button>
        <button class="button button-secondary" type="button" data-tech1-action="generate-bracket" data-source="checkedIn">Generate From Checked-In</button>
        <button class="button button-secondary" type="button" data-tech1-action="generate-bracket" data-source="allRegistered">Generate From All Registered</button>
        <button class="micro-button" type="button" data-tech1-action="lock-bracket">Lock Bracket</button>
        <button class="micro-button" type="button" data-tech1-action="export">Export Raffle CSV</button>
      </div>
      <form id="tech1RaffleForm" class="registration-draft-form">
        <div class="self-register-form-grid">
          <label class="modal-field">
            <span>Registration</span>
            <select id="tech1RaffleRegistrationId" required>
              <option value="">Choose registered driver</option>
              ${sortTech1RegistrationsForDisplay(model.privateRegistrations).map((entry) => `<option value="${escapeAttributeValue(entry.id)}">${escapeHtml(entry.name || "Unnamed Driver")}</option>`).join("")}
            </select>
          </label>
          <label class="modal-field">
            <span>Additional Paid Tickets</span>
            <input id="tech1RafflePaidTickets" type="number" min="1" step="1" value="1" />
          </label>
          <label class="modal-field">
            <span>Payment Method</span>
            <input id="tech1RafflePaymentMethod" type="text" placeholder="Cash, card, comped" />
          </label>
        </div>
        <div class="registration-form-actions">
          <div class="registration-form-note">Collect payment before recording paid tickets. Additional raffle tickets are $5 each; export totals are for cash/card reconciliation.</div>
          <button class="button button-accent" type="submit">Record Paid Tickets</button>
        </div>
      </form>
      <div id="tech1StaffRegistrations">${renderStaffRegistrationRows(model.privateRegistrations)}</div>
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
  const registrationStatus = !model.syncReady
    ? "Offline preview mode. Connect sync before collecting live registrations."
    : !model.eventInitialized
      ? "Event staff are opening Tech 1 registration. Please check back soon."
      : model.registrationOpen
        ? "Registration is open. Each registration receives 1 free raffle ticket. Additional tickets are purchased from event staff."
        : "Tech 1 registration is currently closed.";
  const registrationDisabled = !model.syncReady || !model.eventInitialized || !model.registrationOpen;
  return `
    <header class="hero hero-simple spectator-only public-product-hero" style="border-color: rgba(225,29,46,.45); background: linear-gradient(135deg, rgba(16,16,16,.96), rgba(95,12,22,.72));">
      <div class="hero-copy-block">
        <p class="eyebrow">Tech 1 Drift Anniversary</p>
        <h1>${escapeHtml(config.heroTitle)}</h1>
        <p class="hero-copy">${escapeHtml(config.heroSubtitle)}</p>
        <div class="public-event-actions">
          <button class="button button-accent" type="button" data-tech1-jump="tech1-register">Register Guest / Driver</button>
          <button class="button button-secondary" type="button" data-tech1-jump="tech1-bracket">View Bracket</button>
          <button class="micro-button" type="button" data-action="open-staff-login">Staff Login</button>
        </div>
      </div>
    </header>
    <main class="landing-layout spectator-only">
      <section class="landing-stack">
        <section class="panel">
          <div class="panel-header compact">
            <div>
              <p class="section-kicker">${escapeHtml(config.dateLabel)}</p>
              <h2>No Qualifying. Randomized Battles.</h2>
            </div>
          </div>
          <div class="broadcast-match-meta">
            ${renderStat("Expected drivers", `${config.expectedDrivers}+`, "tone-ready")}
            ${renderStat("Registered", registeredCount, "tone-live")}
            ${renderStat("Checked in", checkedInCount, "tone-ready")}
            ${renderStat("Free raffle", `${config.freeTicketsPerRegistration} ticket`, "tone-live")}
            ${renderStat("Extra tickets", `$${config.raffleTicketPrice}`, "tone-ready")}
          </div>
          <p class="landing-section-copy">${escapeHtml(config.additionalTicketCopy)} Public users cannot add paid tickets themselves. Raffle ticket count never affects bracket seeding.</p>
        </section>

        <section id="tech1-register" class="panel">
          <div class="panel-header compact">
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
                <span>Team Name</span>
                <input id="tech1TeamName" name="teamName" type="text" maxlength="80" />
              </label>
              <label class="modal-field">
                <span>Chassis</span>
                <input id="tech1Chassis" name="chassis" type="text" maxlength="80" />
              </label>
              <label class="modal-field">
                <span>Instagram Handle</span>
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
            <div class="panel-header compact">
              <div>
                <p class="section-kicker">Public Roster</p>
                <h2>Registered Drivers</h2>
              </div>
            </div>
            <div id="tech1PublicRoster">${renderPublicRoster(publicIndex)}</div>
          </section>
          <section id="tech1-bracket" class="panel">
            <div class="panel-header compact">
              <div>
                <p class="section-kicker">Random Single Elimination</p>
                <h2>Battle Bracket</h2>
              </div>
            </div>
            <p class="landing-section-copy">Staff generates and locks the randomized bracket once. Non-power-of-two fields are handled with byes.</p>
            <div id="tech1Bracket">${renderBracket(bracket, Boolean(model.isStaff))}</div>
          </section>
        </section>

        ${renderStaffPanel({ ...model, privateRegistrations })}

        <footer class="public-footer">
          <span>Tech 1 Drift Anniversary Competition runs as a special Prodigy mode.</span>
          <a href="/" data-public-route="home">Prodigy RC Comp</a>
          <a href="/privacy" data-public-route="privacy">Privacy</a>
        </footer>
      </section>
    </main>
  `;
}
