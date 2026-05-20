import { escapeHtml } from "../utils/dom.js";

export function renderPublicEmptyState({ message = "" } = {}) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

export function renderNoActiveEventState() {
  return `
    <article class="public-active-event-card">
      <div>
        <p class="public-product-kicker">Active Event</p>
        <h3>No live event is active right now.</h3>
        <p>No live event is active right now. Check back soon for registration, live stream, and results.</p>
      </div>
      <div class="public-event-meta-list">
        <div><span>Registration</span><strong>Coming soon</strong></div>
        <div><span>Live Stream</span><strong>Not started</strong></div>
        <div><span>Results</span><strong>Archive ready after events</strong></div>
      </div>
    </article>
  `;
}

export function renderNoResultsState(options = {}) {
  return renderPublicEmptyState({
    message: options.message || "Results archive will appear after an event is finalized.",
  });
}

export function renderNoDriversState(options = {}) {
  return renderPublicEmptyState({
    message: options.message || "No drivers have joined this event yet.",
  });
}

export function renderNoStandingsState(options = {}) {
  return renderPublicEmptyState({
    message: options.message || "Standings will populate after the first scores come in.",
  });
}

export function renderStreamOfflineState(options = {}) {
  return renderPublicEmptyState({
    message: options.message || "The live camera feed has not started yet. This page will connect automatically when Stream Studio goes live.",
  });
}

export function renderRegistrationUnavailableState(options = {}) {
  return renderPublicEmptyState({
    message: options.message || "Registration is not available right now.",
  });
}

export function renderNoBracketState(options = {}) {
  return renderPublicEmptyState({
    message: options.message || "Bracket details will appear when the event staff publish competition battles.",
  });
}
