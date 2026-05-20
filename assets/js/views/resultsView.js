import { escapeHtml } from "../utils/dom.js";
import { formatScore } from "../utils/format.js";

export function renderResultsArchiveCard({
  eventMeta,
  activeEventId = "",
  eventStatus = "active",
  completedStatus = "completed",
  archivedStatus = "archived",
  formattedCompletionMeta = "",
  teamCompetitionMode = false,
} = {}) {
  const results = eventMeta?.results || {};
  const isCompleted = eventStatus === completedStatus || eventStatus === archivedStatus;
  const championText = results.championName ? `#${results.championSeed} ${escapeHtml(results.championName)}` : "Waiting for winner";
  const runnerUpText = results.runnerUpName ? `#${results.runnerUpSeed} ${escapeHtml(results.runnerUpName)}` : "Waiting for finalist";
  const thirdPlaceText = results.thirdPlaceName ? `#${results.thirdPlaceSeed} ${escapeHtml(results.thirdPlaceName)}` : "Waiting for battle";
  const topQualifierText = results.topQualifierName ? `#${results.topQualifierSeed} ${escapeHtml(results.topQualifierName)}` : "Waiting for qualifying";
  const isCurrent = eventMeta?.id === activeEventId;
  const canOpenArchiveViews = Boolean(isCompleted);
  const showQualifyingAction = !teamCompetitionMode;

  return `
    <article class="event-card ${isCurrent ? "is-active" : ""}">
      <div class="event-card-head">
        <div>
          <strong>${escapeHtml(eventMeta?.name || "Untitled Event")}</strong>
          <div class="event-card-meta">${escapeHtml(formattedCompletionMeta)}</div>
        </div>
        <span class="status-pill ${isCompleted ? "active" : "archived"}">${isCompleted ? (eventStatus === archivedStatus ? "Archived" : "Completed") : "In Progress"}</span>
      </div>
      <div class="event-card-summary">
        <div class="event-card-overview">
          <p class="event-card-overview-title">Format Summary</p>
          <p class="event-card-format">${escapeHtml(results.planDescription || "Waiting for qualifying scores.")}</p>
        </div>
        <div class="event-card-podium">
          <p class="event-card-podium-title">Podium Snapshot</p>
          <div class="event-card-podium-line">
            <span>1st</span>
            <strong>${championText}</strong>
          </div>
          <div class="event-card-podium-line">
            <span>2nd</span>
            <strong>${runnerUpText}</strong>
          </div>
          <div class="event-card-podium-line">
            <span>3rd</span>
            <strong>${thirdPlaceText}</strong>
          </div>
        </div>
      </div>
      <div class="event-card-grid">
        <div class="event-stat">
          <span>Champion</span>
          <strong>${championText}</strong>
        </div>
        <div class="event-stat">
          <span>Top Qualifier</span>
          <strong>${topQualifierText}</strong>
        </div>
        <div class="event-stat">
          <span>Average Best</span>
          <strong>${formatScore(results.averageBestScore)}</strong>
        </div>
        <div class="event-stat">
          <span>Entries</span>
          <strong>${results.totalDrivers || 0}</strong>
        </div>
      </div>
      <div class="event-card-actions">
        ${showQualifyingAction ? `<button class="micro-button button-accent" type="button" data-action="open-event-view" data-event-id="${eventMeta?.id || ""}" data-view="qualifying" ${canOpenArchiveViews ? "" : "disabled"}>
          View Qualifying Results
        </button>` : ""}
        <button class="micro-button ${showQualifyingAction ? "" : "button-accent"}" type="button" data-action="open-event-view" data-event-id="${eventMeta?.id || ""}" data-view="bracket" ${canOpenArchiveViews ? "" : "disabled"}>
          ${showQualifyingAction ? "View Bracket Results" : "View Competition Results"}
        </button>
      </div>
    </article>
  `;
}
