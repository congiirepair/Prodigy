export function createFirestorePathHelpers({
  collection,
  doc,
  getDb,
  getAppId,
  getDataScopeKey,
  getEventCollectionKey,
  getDefaultEventId,
  getActiveEventId,
  getNativeStreamSessionId,
  getNativeStreamRemoteSessionId,
  getNativeStreamViewerId,
  generateId,
}) {
  const eventIdOrDefault = (eventId) => eventId || getActiveEventId?.() || getDefaultEventId();

  return {
    getDirectoryDocRef() {
      return doc(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "meta", "eventDirectory");
    },
    getEventDocRef(eventId) {
      return doc(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), getEventCollectionKey(), eventId);
    },
    getActiveEventSelectionDocRef() {
      return doc(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "meta", "activeEventSelection");
    },
    getArchivedResultsDocRef() {
      return doc(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "meta", "resultsArchive");
    },
    getNativeLiveStreamDocRef(eventId) {
      return doc(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "liveStreams", eventIdOrDefault(eventId));
    },
    getNativeLiveViewerCollectionRef(eventId, sessionId) {
      return collection(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "liveStreams", eventIdOrDefault(eventId), "sessions", sessionId || getNativeStreamSessionId?.() || "pending", "viewers");
    },
    getNativeLiveViewerDocRef(eventId, sessionId, viewerId) {
      return doc(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "liveStreams", eventIdOrDefault(eventId), "sessions", sessionId || getNativeStreamRemoteSessionId?.() || getNativeStreamSessionId?.() || "pending", "viewers", viewerId || getNativeStreamViewerId?.() || generateId());
    },
    getEventPrivateConfigDocRef(eventId) {
      return doc(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "events", eventIdOrDefault(eventId), "private", "config");
    },
    getEventRegistrationsCollectionRef(eventId) {
      return collection(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "events", eventIdOrDefault(eventId), "registrations");
    },
    getEventRegistrationDocRef(eventId, registrationId) {
      return doc(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "events", eventIdOrDefault(eventId), "registrations", registrationId || generateId());
    },
    getPublicRegistrationIndexCollectionRef(eventId) {
      return collection(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "events", eventIdOrDefault(eventId), "publicRegistrationIndex");
    },
    getPublicRegistrationIndexDocRef(eventId, publicId) {
      return doc(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "events", eventIdOrDefault(eventId), "publicRegistrationIndex", publicId || generateId());
    },
    getEventDriversCollectionRef(eventId) {
      return collection(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "events", eventIdOrDefault(eventId), "drivers");
    },
    getEventDriverDocRef(eventId, driverId) {
      return doc(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "events", eventIdOrDefault(eventId), "drivers", driverId || generateId());
    },
    getQualifyingRunsCollectionRef(eventId) {
      return collection(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "events", eventIdOrDefault(eventId), "qualifyingRuns");
    },
    getQualifyingRunDocRef(eventId, runId) {
      return doc(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "events", eventIdOrDefault(eventId), "qualifyingRuns", runId || generateId());
    },
    getJudgeSubmissionsCollectionRef(eventId) {
      return collection(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "events", eventIdOrDefault(eventId), "judgeSubmissions");
    },
    getJudgeSubmissionDocRef(eventId, submissionId) {
      return doc(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "events", eventIdOrDefault(eventId), "judgeSubmissions", submissionId || generateId());
    },
    getBattleVotesCollectionRef(eventId) {
      return collection(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "events", eventIdOrDefault(eventId), "battleVotes");
    },
    getBattleVoteDocRef(eventId, voteId) {
      return doc(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "events", eventIdOrDefault(eventId), "battleVotes", voteId || generateId());
    },
    getBracketDocRef(eventId, bracketId = "main") {
      return doc(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "events", eventIdOrDefault(eventId), "brackets", bracketId || "main");
    },
    getPublicAggregatesCollectionRef(eventId) {
      return collection(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "events", eventIdOrDefault(eventId), "publicAggregates");
    },
    getPublicAggregateDocRef(eventId, aggregateId = "liveSummary") {
      return doc(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "events", eventIdOrDefault(eventId), "publicAggregates", aggregateId || "liveSummary");
    },
    getSpecialEventDocRef(eventId) {
      return doc(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "specialEvents", eventId);
    },
    getSpecialEventRegistrationsCollectionRef(eventId) {
      return collection(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "specialEvents", eventId, "registrations");
    },
    getSpecialEventRegistrationDocRef(eventId, registrationId) {
      return doc(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "specialEvents", eventId, "registrations", registrationId || generateId());
    },
    getSpecialEventPublicRegistrationIndexCollectionRef(eventId) {
      return collection(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "specialEvents", eventId, "publicRegistrationIndex");
    },
    getSpecialEventPublicRegistrationIndexDocRef(eventId, publicId) {
      return doc(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "specialEvents", eventId, "publicRegistrationIndex", publicId || generateId());
    },
    getSpecialEventRaffleTransactionsCollectionRef(eventId) {
      return collection(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "specialEvents", eventId, "raffleTransactions");
    },
    getSpecialEventRaffleTransactionDocRef(eventId, transactionId) {
      return doc(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "specialEvents", eventId, "raffleTransactions", transactionId || generateId());
    },
    getSpecialEventBracketDocRef(eventId, bracketId = "main") {
      return doc(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "specialEvents", eventId, "brackets", bracketId || "main");
    },
    getSpecialEventBattleResultsCollectionRef(eventId) {
      return collection(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "specialEvents", eventId, "battleResults");
    },
    getSpecialEventBattleResultDocRef(eventId, matchId) {
      return doc(getDb(), "artifacts", getAppId(), "public", getDataScopeKey(), "specialEvents", eventId, "battleResults", matchId || generateId());
    },
  };
}
