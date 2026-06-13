import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCustomToken,
  signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  runTransaction,
  setDoc,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onAuthStateChanged,
  onSnapshot,
  runTransaction,
  setDoc,
  signInAnonymously,
  signInWithCustomToken,
  signInWithEmailAndPassword,
};

export function initializeProdigyFirebase(firebaseConfig, options = {}) {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const auth = getAuth(app);

  if (options.useEmulators) {
    const host = options.emulatorHost || "127.0.0.1";
    const authPort = Number.parseInt(options.authEmulatorPort || "9099", 10) || 9099;
    const firestorePort = Number.parseInt(options.firestoreEmulatorPort || "8080", 10) || 8080;
    connectAuthEmulator(auth, `http://${host}:${authPort}`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, firestorePort);
  }

  return { app, auth, db };
}
