import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  initializeAuth,
  getAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);

/**
 * Safari PWA often breaks IndexedDB auth persistence ("Internal error.").
 * Fall through to localStorage, then memory so login can still work.
 */
function createAuth() {
  try {
    return initializeAuth(app, {
      persistence: [
        indexedDBLocalPersistence,
        browserLocalPersistence,
        inMemoryPersistence,
      ],
    });
  } catch (err) {
    // Already initialized (HMR / double import)
    console.warn("initializeAuth fallback to getAuth:", err?.message || err);
    return getAuth(app);
  }
}

export const auth = createAuth();
export const db = getFirestore(app);
