export function createStreamReadService({ readService, refs }) {
  return {
    readStreamState(eventId) {
      return readService.readDoc(refs.getNativeLiveStreamDocRef(eventId));
    },
    subscribeStreamState(eventId, onNext, onError) {
      return readService.subscribeDoc(refs.getNativeLiveStreamDocRef(eventId), onNext, onError);
    },
    subscribeViewerRequests(eventId, sessionId, onNext, onError) {
      return readService.subscribeCollection(refs.getNativeLiveViewerCollectionRef(eventId, sessionId), onNext, onError);
    },
    subscribeViewerDoc(eventId, sessionId, viewerId, onNext, onError) {
      return readService.subscribeDoc(refs.getNativeLiveViewerDocRef(eventId, sessionId, viewerId), onNext, onError);
    },
  };
}
