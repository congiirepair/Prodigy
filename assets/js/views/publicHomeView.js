import { escapeHtml } from "../utils/dom.js";
import { renderNoActiveEventState, renderNoResultsState } from "./publicEmptyStates.js";

export const PUBLIC_HOME_COPY = Object.freeze({
  eyebrow: "Prodigy RC Comp",
  title: "Run RC drift competitions from registration to podium.",
  heroCopy: "Prodigy Event Control handles driver check-in, live judging, qualifying standings, brackets, results, and automatic broadcast layouts for RC drift events.",
  whyCopy: "Prodigy Event Control keeps driver preregistration, venue check-in, judge scoring, bracket progression, results, and automatic broadcast layouts in one connected workflow.",
});

export const PUBLIC_HOME_FEATURES = Object.freeze([
  ["Registration & QR Check-In", "Drivers preregister, scan venue QR codes, and move into staff approval when check-in opens."],
  ["Live Judging & Qualifying", "Judge inputs feed live standings, current-driver views, and qualifying results."],
  ["Competition Brackets", "Publish battle flow and bracket progression without exposing admin reset or reorder tools."],
  ["Auto-Switching Stream Layouts", "Stream Studio follows qualifying, battles, brackets, standings, and results automatically."],
  ["Results Archive", "Final podiums and event summaries stay available for spectators and PDF export."],
]);

function renderActiveEventPanel({
  activePublicEvent,
  lifecycleDetail,
  publicEventDate,
  publicRegistrationStatus,
  publicLiveStatus,
  hasPublicResults,
} = {}) {
  if (!activePublicEvent) {
    return renderNoActiveEventState();
  }

  return `
    <article class="public-active-event-card">
      <div>
        <p class="public-product-kicker">Active Event</p>
        <h3>${escapeHtml(activePublicEvent.name || "Current Event")}</h3>
        <p>${escapeHtml(lifecycleDetail || "Follow registration, live event status, brackets, and results from this public hub.")}</p>
        <div class="public-event-actions" style="margin-top: 16px;">
          <button class="button button-accent" type="button" data-landing-jump="live">Live</button>
          <button class="button button-secondary" type="button" data-landing-jump="self-register">Register</button>
          <button class="button button-secondary" type="button" data-landing-jump="results">Results</button>
        </div>
      </div>
      <div class="public-event-meta-list">
        <div><span>Date</span><strong>${escapeHtml(publicEventDate)}</strong></div>
        <div><span>Registration</span><strong>${escapeHtml(publicRegistrationStatus)}</strong></div>
        <div><span>Live Status</span><strong>${escapeHtml(publicLiveStatus)}</strong></div>
        <div><span>Results</span><strong>${hasPublicResults ? "Archive available" : "Results will appear after finals"}</strong></div>
      </div>
    </article>
  `;
}

function renderFeatureCards(features = PUBLIC_HOME_FEATURES) {
  return features.map(([title, copy]) => `
    <article class="public-product-card">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(copy)}</p>
    </article>
  `).join("");
}

function renderStreamStudioCard() {
  return `
    <article class="public-stream-card">
      <p class="public-product-kicker">Native Stream Studio</p>
      <h3>Layouts follow the competition automatically.</h3>
      <p>Stream Studio can switch from starting soon to qualifying, standings, bracket, battles, and results based on live event state. Streamers set up camera and microphone once while the app keeps the broadcast layout in step with the comp.</p>
      <div class="public-event-actions" style="margin-top: 16px;">
        <button class="button button-accent" type="button" data-landing-jump="live">View Live Event</button>
        <button class="button button-secondary" type="button" data-action="open-staff-login">Staff Login</button>
      </div>
    </article>
  `;
}

function renderCompetitionTeaser({
  currentBattleTitle,
  currentDriverName,
  hasPublicBracket,
  registeredDriverCount,
} = {}) {
  const title = currentBattleTitle || currentDriverName || (hasPublicBracket ? "Competition bracket is ready." : "Battle flow appears when the event starts.");
  const copy = hasPublicBracket
    ? "Public bracket views stay readable for spectators while protected admin controls remain in staff routes."
    : registeredDriverCount
      ? "Qualifying standings and battle flow will update as judges submit scores and event staff publish brackets."
      : "Driver list will appear when registration opens.";
  return `
    <article class="public-stream-card">
      <p class="public-product-kicker">Event Control</p>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(copy)}</p>
    </article>
  `;
}

function renderLatestPodium({ latestArchive, formattedArchiveDate } = {}) {
  if (!latestArchive) {
    return renderNoResultsState();
  }
  return `
    <p class="landing-section-copy">${escapeHtml(latestArchive.name)} closed on ${escapeHtml(formattedArchiveDate)}. Spectators can open the full archive anytime from the Results tab.</p>
    <div class="landing-podium-grid">
      <article class="landing-podium-card">
        <span>Champion</span>
        <strong>${latestArchive.results?.championName ? `#${latestArchive.results?.championSeed || "-"} ${escapeHtml(latestArchive.results.championName)}` : "Waiting"}</strong>
        <small>${escapeHtml(latestArchive.results?.planDescription || "Saved event results")}</small>
      </article>
      <article class="landing-podium-card">
        <span>Runner Up</span>
        <strong>${latestArchive.results?.runnerUpName ? `#${latestArchive.results?.runnerUpSeed || "-"} ${escapeHtml(latestArchive.results.runnerUpName)}` : "Waiting"}</strong>
        <small>${latestArchive.results?.topQualifierName ? `Top qualifier: #${latestArchive.results.topQualifierSeed || "-"} ${escapeHtml(latestArchive.results.topQualifierName)}` : "Top qualifier saved with the event archive."}</small>
      </article>
    </div>
  `;
}

function renderQuickLinks() {
  return `
    <button class="button button-accent" type="button" data-landing-jump="live">View Live Event</button>
    <button class="button button-secondary" type="button" data-landing-jump="self-register">Register Driver</button>
    <button class="button button-secondary" type="button" data-landing-jump="results">Results Archive</button>
    <button class="button button-secondary" type="button" data-action="copy-public-event-link">Copy Public Link</button>
    <button class="micro-button" type="button" data-action="open-staff-login">Event Staff Login</button>
  `;
}

export function renderPublicHomeView(model = {}) {
  return {
    copy: PUBLIC_HOME_COPY,
    upcomingEventHtml: renderActiveEventPanel(model),
    featuresHtml: renderFeatureCards(model.features),
    liveSnapshotHtml: renderStreamStudioCard(),
    featuredDriversHtml: renderCompetitionTeaser(model),
    latestPodiumHtml: renderLatestPodium(model),
    quickLinksHtml: renderQuickLinks(),
  };
}

export const renderPublicHomeViewModel = renderPublicHomeView;
