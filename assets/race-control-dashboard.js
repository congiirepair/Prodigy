export function createRaceControlDashboardRenderer(deps) {
  const {
    document,
    escapeHtml,
    escapeAttributeValue,
    formatDriverRegistrationNumber,
    buildPublicEventBattleTitle,
    getRegisteredDrivers,
    rankDrivers,
    getLowerBattleFlowEntries,
    getMainBattleFlowEntries,
    getEventCompetitionMode,
    getQualifyingDriverQueue,
    getVenueCheckInCounts,
    getActiveJudgeRoles,
    getJudgeRoleClaims,
    getBracketWinner,
    buildSelfRegisterUrl,
    getQualifyingFlowPhase,
    formatScore,
    competitionModes,
    getState,
  } = deps;

  function formatDriverName(driver, fallback = "Waiting") {
    return driver?.name || fallback;
  }

  function formatDriverMeta(driver) {
    if (!driver?.name) return "Staging";
    const seed = driver.seed || formatDriverRegistrationNumber(driver);
    const team = driver.teamName || driver.chassis || "Independent";
    return `Seed ${seed || "-"} | ${team}`;
  }

  function getBattleEntries(state) {
    const tournamentState = state.tournamentState;
    if (!tournamentState?.mainBracket?.rounds?.length && !tournamentState?.lowerBracket?.rounds?.length) return [];
    const lowerEntries = getLowerBattleFlowEntries(tournamentState.lowerBracket?.rounds || []);
    const mainEntries = getMainBattleFlowEntries(
      tournamentState.mainBracket?.rounds || [],
      tournamentState.mainBracket?.thirdPlaceMatch || null,
    );
    return [...lowerEntries, ...mainEntries].filter((entry) => entry?.match?.left || entry?.match?.right);
  }

  function getCompetitionModeLabel(eventMeta) {
    const mode = getEventCompetitionMode(eventMeta);
    if (mode === competitionModes.teamTandem) return "Team Tandem";
    if (mode === competitionModes.twinTriple) return "Team Tandem Triple Elim";
    if (mode === competitionModes.twinDouble) return "Team Tandem Double Elim";
    return "Solo Drivers";
  }

  function renderQueue(entries, fallbackDriver) {
    const queueEntries = entries.slice(0, 4);
    if (!queueEntries.length && fallbackDriver?.name) {
      return `
        <article class="race-queue-item is-live">
          <span>Now</span>
          <strong>${escapeHtml(fallbackDriver.name)}</strong>
          <small>${escapeHtml(formatDriverMeta(fallbackDriver))}</small>
        </article>
      `;
    }
    if (!queueEntries.length) {
      return `<article class="race-queue-item"><span>Queue</span><strong>Waiting For Event</strong><small>Start qualifying or publish a bracket.</small></article>`;
    }
    return queueEntries.map((entry, index) => `
      <article class="race-queue-item ${index === 0 ? "is-live" : ""}">
        <span>${index === 0 ? "Now" : index === 1 ? "Next" : `Q${index + 1}`}</span>
        <strong>${escapeHtml(buildPublicEventBattleTitle(entry) || "Waiting")}</strong>
        <small>${escapeHtml(entry.label || entry.roundLabel || "Live bracket")}</small>
      </article>
    `).join("");
  }

  function renderBracketPreview(rankedDrivers, entries) {
    const seeds = rankedDrivers.slice(0, 16);
    if (!seeds.length) return `<div class="race-empty">Drivers appear here as soon as registration or qualifying data exists.</div>`;
    const firstColumn = seeds.slice(0, 8);
    const secondColumn = seeds.slice(8, 16);
    const winners = entries.slice(0, 6).map((entry) => entry.match?.winner || entry.match?.left || null);
    return `
      <div class="race-bracket-tabs"><span class="is-active">Winners Bracket</span><span>Lower Bracket</span><span>Overview</span></div>
      <div class="race-mini-bracket">
        <div class="race-mini-column">
          <small>Top 16</small>
          ${firstColumn.map((driver) => `<div class="race-mini-match"><span>${driver.seed || "-"}</span><strong>${escapeHtml(driver.name || "TBD")}</strong></div>`).join("")}
        </div>
        <div class="race-mini-column">
          <small>Quarter Finals</small>
          ${winners.slice(0, 4).map((driver, index) => `<div class="race-mini-match ${driver?.name ? "is-winner" : ""}"><span>${driver?.seed || index + 1}</span><strong>${escapeHtml(driver?.name || "TBD")}</strong></div>`).join("")}
        </div>
        <div class="race-mini-column">
          <small>Semi Finals</small>
          ${winners.slice(4, 6).map((driver, index) => `<div class="race-mini-match ${driver?.name ? "is-winner" : ""}"><span>${driver?.seed || index + 1}</span><strong>${escapeHtml(driver?.name || "TBD")}</strong></div>`).join("")}
          <div class="race-mini-final"><strong>Final Battle</strong><span>Winner reveal protected</span></div>
          <div class="race-mini-final"><strong>3rd Place Battle</strong><span>Trophy reveal protected</span></div>
        </div>
        <div class="race-mini-column">
          <small>Right Side</small>
          ${secondColumn.map((driver) => `<div class="race-mini-match"><span>${driver.seed || "-"}</span><strong>${escapeHtml(driver.name || "TBD")}</strong></div>`).join("")}
        </div>
      </div>
    `;
  }

  function render() {
    const dashboards = Array.from(document.querySelectorAll(".race-control-dashboard"));
    if (!dashboards.length) return;

    const state = getState();
    const drivers = getRegisteredDrivers(state.appDrivers);
    const rankedDrivers = rankDrivers(drivers);
    const entries = getBattleEntries(state);
    const queue = getQualifyingDriverQueue(state.appDrivers);
    const currentQualifyingDriver = queue.find((driver) => driver.id === state.qualifyingFlow?.currentDriverId) || queue[0] || rankedDrivers[0] || drivers[0] || null;
    const activeEntry = entries[0] || null;
    const activeLeft = activeEntry?.match?.left || currentQualifyingDriver;
    const activeRight = activeEntry?.match?.right || rankedDrivers.find((driver) => driver.id !== activeLeft?.id) || null;
    const topSeed = rankedDrivers[0] || null;
    const checkInCounts = getVenueCheckInCounts(state.activeEventMeta);
    const activeJudgeRoles = getActiveJudgeRoles(state.activeEventMeta);
    const claims = getJudgeRoleClaims(state.activeEventMeta);
    const readyJudges = activeJudgeRoles.filter((role) => claims?.[role]?.status === "claimed").length;
    const winnerName = state.tournamentState?.mainBracket ? getBracketWinner(state.tournamentState.mainBracket.rounds)?.name : null;
    const lastResult = state.winnerAnimationState?.name || winnerName || rankedDrivers[0]?.name || "Awaiting Winner";
    const selfRegisterUrl = buildSelfRegisterUrl();
    const eventName = state.activeEventMeta?.name || "Live Event";
    const formatLabel = getCompetitionModeLabel(state.activeEventMeta);
    const statusLabel = state.tournamentState?.mainBracket?.rounds?.length ? "Bracket Live" : getQualifyingFlowPhase(state.qualifyingFlow, state.appDrivers) === "live" ? "Qualifying Live" : "Ready";

    const markup = `
      <aside class="race-sidebar" aria-label="Live dashboard navigation">
        <div class="race-brand">
          <span class="race-brand-mark">P</span>
          <strong>Prodigy<br>RC Comp</strong>
        </div>
        <button type="button" data-landing-jump="live" class="race-nav-item is-active">Live</button>
        <button type="button" data-landing-jump="bracket" class="race-nav-item">Bracket</button>
        <button type="button" data-landing-jump="qualifying" class="race-nav-item">Qualifying</button>
        <button type="button" data-landing-jump="registration" class="race-nav-item">Drivers</button>
        <button type="button" data-landing-jump="self-register" class="race-nav-item">Check-In</button>
        <button type="button" data-landing-jump="results" class="race-nav-item">Results</button>
      </aside>

      <section class="race-main">
        <h1 class="sr-only">${escapeHtml(eventName)} Live Event Command Center</h1>
        <header class="race-topbar">
          <div><strong>Live Event</strong><span>${escapeHtml(eventName)} | ${escapeHtml(formatLabel)}</span></div>
          <div class="race-sponsor-row"><span>Judges</span><strong>${readyJudges}/${activeJudgeRoles.length || 3}</strong><span>${escapeHtml(statusLabel)}</span></div>
          <button type="button" class="race-mini-btn" data-action="copy-public-event-link">Copy Public Link</button>
        </header>

        <section class="race-battle-panel">
          <div class="race-panel-head"><span>Now Battling</span><button type="button" class="race-mini-btn" data-landing-jump="bracket">Full Screen</button></div>
          <div class="race-battle-stage">
            <article class="race-driver-card">
              <span>${escapeHtml(formatDriverMeta(activeLeft))}</span>
              <strong>${escapeHtml(formatDriverName(activeLeft, "Lead Driver"))}</strong>
              <small>Lead Driver</small>
            </article>
            <div class="race-vs">VS</div>
            <article class="race-driver-card is-right">
              <span>${escapeHtml(formatDriverMeta(activeRight))}</span>
              <strong>${escapeHtml(formatDriverName(activeRight, "Chase Driver"))}</strong>
              <small>Chase Driver</small>
            </article>
          </div>
          <div class="race-judge-strip">
            ${activeJudgeRoles.length ? activeJudgeRoles.map((role, index) => `<span class="${claims?.[role]?.status === "claimed" ? "is-ready" : ""}">Judge ${index + 1} ${claims?.[role]?.status === "claimed" ? "Ready" : "Open"}</span>`).join("") : `<span>Judge 1 Open</span><span>Judge 2 Open</span><span>Judge 3 Open</span>`}
          </div>
        </section>

        <section class="race-info-row">
          <div class="race-panel race-upnext"><span>Up Next</span>${renderQueue(entries.slice(1), queue[1])}</div>
          <div class="race-panel race-stats"><span>Event Status</span><div class="race-stat-grid"><div><strong>${checkInCounts.arrived || 0}/${Math.max(checkInCounts.preregistered || 0, drivers.length)}</strong><small>Check-In</small></div><div><strong>${activeJudgeRoles.length || 3}</strong><small>Judges</small></div><div><strong>${entries.length || "-"}</strong><small>Battles</small></div><div><strong>${topSeed ? `#${topSeed.seed}` : "-"}</strong><small>Top Seed</small></div></div></div>
          <div class="race-panel race-last"><span>Last Battle Result</span><strong>${escapeHtml(lastResult)}</strong><small>${escapeHtml(activeEntry?.label || "Winner reveal protected until admin presentation.")}</small></div>
        </section>
      </section>

      <aside class="race-admin">
        <header><strong>Admin Command Center</strong><span>${escapeHtml(statusLabel)}</span></header>
        <div class="race-admin-grid">
          <article class="race-admin-card wide"><span>Event Overview</span><strong>${escapeHtml(eventName)}</strong><small>${escapeHtml(formatLabel)} | ${escapeHtml(statusLabel)}</small><button type="button" data-landing-jump="bracket">View Event</button></article>
          <article class="race-admin-card"><span>Quick Actions</span><button type="button" data-landing-jump="qualifying">Qualifying</button><button type="button" data-landing-jump="bracket">Bracket</button><button type="button" data-landing-jump="results">Results</button></article>
          <article class="race-admin-card"><span>Registration & Check-In</span><div class="race-checkin-split"><div><strong>${drivers.length}</strong><small>${checkInCounts.arrived || 0} checked in</small></div><div class="race-qr-mini" aria-hidden="true"></div></div><a href="${escapeAttributeValue(selfRegisterUrl)}">Open QR Link</a></article>
          <article class="race-admin-card"><span>Judges</span><strong>${readyJudges}/${activeJudgeRoles.length || 3}</strong><small>${activeJudgeRoles.length ? "Role claims live" : "Waiting for setup"}</small><button type="button" data-landing-jump="qualifying">Judge Panel</button></article>
          <article class="race-admin-card"><span>System Health</span><strong>Good</strong><small>Live sync | Event data | Internet</small><button type="button" data-landing-jump="live">Diagnostics</button></article>
        </div>
      </aside>

      <section class="race-mobile-card">
        <span>Mobile Judge Experience</span>
        <div class="race-phone">
          <strong>Judge 1</strong>
          <small>${escapeHtml(formatDriverName(activeLeft, "Lead"))} vs ${escapeHtml(formatDriverName(activeRight, "Chase"))}</small>
          <div class="race-phone-vs">VS</div>
          <button type="button">Lead</button><button type="button">Chase</button><button type="button">OMT</button>
        </div>
      </section>

      <section class="race-bracket-preview">
        <div class="race-section-title">Bracket Presentation</div>
        ${renderBracketPreview(rankedDrivers, entries)}
      </section>

      <section class="race-standings-panel">
        <div class="race-section-title">Qualifying Standings</div>
        ${rankedDrivers.slice(0, 8).map((driver) => `<div class="race-standing"><span>${driver.seed || "-"}</span><strong>${escapeHtml(driver.name || "Driver")}</strong><small>${formatScore(driver.bestScore)}</small></div>`).join("") || `<div class="race-empty">Standings will appear after scores are entered.</div>`}
        <button type="button" data-landing-jump="qualifying">View Full Results</button>
      </section>

      <section class="race-winner-panel">
        <div class="race-section-title">Winner Reveal Experience</div>
        <div class="race-winner-box"><span>Winner</span><strong>${escapeHtml(lastResult)}</strong></div>
        <div class="race-winner-meta"><span>Battle Info</span><strong>${escapeHtml(activeEntry?.label || "Grand Final | Battle 15")}</strong><small>Returning to bracket in 30 seconds</small></div>
      </section>

      <footer class="race-footer-strip">
        <span>Built For Live Competitions</span>
        <span>Fast Real-Time Sync</span>
        <span>Mobile First Judge Experience</span>
        <span>Broadcast Ready</span>
        <strong>Prodigy RC Comp</strong>
      </footer>
    `;

    dashboards.forEach((dashboard) => {
      dashboard.innerHTML = markup;
    });
  }

  return { render };
}
