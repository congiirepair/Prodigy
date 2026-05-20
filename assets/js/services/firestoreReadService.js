import { getDoc, onSnapshot } from "../firebase/init.js";

export function toDocumentResult(snapshot) {
  return {
    id: snapshot?.id || "",
    exists: Boolean(snapshot?.exists?.()),
    data: snapshot?.exists?.() ? snapshot.data() : null,
    snapshot,
  };
}

export function toCollectionDocs(snapshot) {
  return snapshot?.docs?.map((docSnap) => ({
    id: docSnap.id,
    data: docSnap.data(),
    snapshot: docSnap,
  })) || [];
}

export function createFirestoreReadService() {
  return {
    async readDoc(ref) {
      return toDocumentResult(await getDoc(ref));
    },
    subscribeDoc(ref, onNext, onError) {
      return onSnapshot(ref, (snapshot) => onNext(toDocumentResult(snapshot)), onError);
    },
    subscribeCollection(ref, onNext, onError) {
      return onSnapshot(ref, (snapshot) => onNext(toCollectionDocs(snapshot), snapshot), onError);
    },
  };
}
