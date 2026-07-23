export function resolveSelectionEventMeta({
  eventId,
  authoritativeDirectory = {},
  authoritativeDirectoryLoaded = false,
  localDirectory = {},
  embeddedEventMeta = null,
} = {}) {
  const normalizedEventId = String(eventId || "").trim();
  if (!normalizedEventId) return null;

  if (authoritativeDirectoryLoaded) {
    return authoritativeDirectory?.[normalizedEventId] || null;
  }

  if (localDirectory?.[normalizedEventId]) {
    return localDirectory[normalizedEventId];
  }

  const embeddedEventId = String(embeddedEventMeta?.id || "").trim();
  return embeddedEventId === normalizedEventId ? embeddedEventMeta : null;
}

export function shouldReplaceCachedSelection(existingSelection, incomingSelection, options = {}) {
  if (!incomingSelection?.activeEventId) return false;
  if (options.authoritative === true || !existingSelection?.activeEventId) return true;
  return Number(existingSelection.syncStamp || 0) <= Number(incomingSelection.syncStamp || 0);
}

export function createSelectedEventSubscriptionController({ subscribe, onSnapshot, onError = () => {} }) {
  if (typeof subscribe !== "function" || typeof onSnapshot !== "function") {
    throw new TypeError("A subscription factory and snapshot handler are required.");
  }

  let selectedEventId = "";
  let revision = 0;
  let unsubscribe = null;

  function stop() {
    revision += 1;
    selectedEventId = "";
    if (typeof unsubscribe === "function") unsubscribe();
    unsubscribe = null;
  }

  function select(eventId, options = {}) {
    const normalizedEventId = String(eventId || "").trim();
    if (!options.force && normalizedEventId && normalizedEventId === selectedEventId && unsubscribe) {
      return false;
    }

    stop();
    if (!normalizedEventId) return false;

    selectedEventId = normalizedEventId;
    const subscribedRevision = revision;
    const release = subscribe(normalizedEventId, (snapshot) => {
      if (subscribedRevision !== revision || selectedEventId !== normalizedEventId) return;
      onSnapshot(normalizedEventId, snapshot);
    }, (error) => {
      if (subscribedRevision !== revision || selectedEventId !== normalizedEventId) return;
      unsubscribe = null;
      onError(normalizedEventId, error);
    });
    unsubscribe = typeof release === "function" ? release : null;
    return true;
  }

  return {
    select,
    stop,
    getSelectedEventId: () => selectedEventId,
    getRevision: () => revision,
  };
}
