export function createEventReadService({ readService, refs }) {
  return {
    readEvent(eventId) {
      return readService.readDoc(refs.getEventDocRef(eventId));
    },
    subscribeEvent(eventId, onNext, onError) {
      return readService.subscribeDoc(refs.getEventDocRef(eventId), onNext, onError);
    },
    readDirectory() {
      return readService.readDoc(refs.getDirectoryDocRef());
    },
    subscribeDirectory(onNext, onError) {
      return readService.subscribeDoc(refs.getDirectoryDocRef(), onNext, onError);
    },
    readActiveEventSelection() {
      return readService.readDoc(refs.getActiveEventSelectionDocRef());
    },
    subscribeActiveEventSelection(onNext, onError) {
      return readService.subscribeDoc(refs.getActiveEventSelectionDocRef(), onNext, onError);
    },
    readResultsArchive() {
      return readService.readDoc(refs.getArchivedResultsDocRef());
    },
    subscribeResultsArchive(onNext, onError) {
      return readService.subscribeDoc(refs.getArchivedResultsDocRef(), onNext, onError);
    },
    subscribePublicRegistrationIndex(eventId, onNext, onError) {
      return readService.subscribeCollection(refs.getPublicRegistrationIndexCollectionRef(eventId), onNext, onError);
    },
    subscribeDrivers(eventId, onNext, onError) {
      return readService.subscribeCollection(refs.getEventDriversCollectionRef(eventId), onNext, onError);
    },
    subscribeJudgeSubmissions(eventId, onNext, onError) {
      return readService.subscribeCollection(refs.getJudgeSubmissionsCollectionRef(eventId), onNext, onError);
    },
    subscribeBattleVotes(eventId, onNext, onError) {
      return readService.subscribeCollection(refs.getBattleVotesCollectionRef(eventId), onNext, onError);
    },
    subscribeBracket(eventId, onNext, onError) {
      return readService.subscribeDoc(refs.getBracketDocRef(eventId, "main"), onNext, onError);
    },
    subscribePublicAggregates(eventId, onNext, onError) {
      return readService.subscribeCollection(refs.getPublicAggregatesCollectionRef(eventId), onNext, onError);
    },
  };
}
