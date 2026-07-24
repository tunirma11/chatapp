/**
 * Safari / iOS PWA often breaks Firebase Auth IndexedDB ("Internal error." / UnknownError).
 * These helpers detect that, wipe corrupted stores, and reload so login can succeed.
 */

const REPAIR_FLAG = "chatapp_storage_repair_once";

const KNOWN_DB_NAMES = [
  "firebaseLocalStorageDb",
  "firebase-heartbeat-database",
  "firebase-installations-database",
  "firebase-messaging-database",
  "chat-app-db",
];

export function isBrowserStorageError(err) {
  const code = String(err?.code || "");
  const name = String(err?.name || "");
  const message = String(err?.message || err || "");

  if (name === "UnknownError" || name === "InvalidStateError") return true;
  if (code === "auth/internal-error" || code === "internal") return true;
  if (message === "Internal error." || message.includes("Internal error")) return true;
  if (message.includes("UnknownError")) return true;
  if (/indexeddb|idbopen|idbrequest|database that could not be opened/i.test(message)) {
    return true;
  }
  return false;
}

function deleteDatabase(name) {
  return new Promise((resolve) => {
    if (!name || !window.indexedDB) {
      resolve(false);
      return;
    }
    try {
      const req = indexedDB.deleteDatabase(name);
      const done = () => resolve(true);
      req.onsuccess = done;
      req.onerror = done;
      req.onblocked = done;
      setTimeout(done, 2500);
    } catch {
      resolve(false);
    }
  });
}

async function collectDatabaseNames() {
  const names = new Set(KNOWN_DB_NAMES);
  if (typeof indexedDB?.databases === "function") {
    try {
      const listed = await indexedDB.databases();
      for (const entry of listed || []) {
        if (!entry?.name) continue;
        const n = entry.name;
        if (
          n === "chat-app-db" ||
          n.includes("firebase") ||
          n.includes("firestore") ||
          n.includes("Firebase")
        ) {
          names.add(n);
        }
      }
    } catch {
      /* Safari may not support databases() */
    }
  }
  return [...names];
}

async function clearCacheStorage() {
  if (!("caches" in window)) return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch {
    /* ignore */
  }
}

/**
 * Wipe corrupted Firebase/app IndexedDB (+ optional Cache Storage).
 * Does not unregister the service worker (keeps PWA install).
 */
export async function repairBrowserStorage({ clearCaches = true } = {}) {
  const names = await collectDatabaseNames();
  await Promise.all(names.map(deleteDatabase));
  if (clearCaches) await clearCacheStorage();

  try {
    sessionStorage.removeItem("chat-last-active");
  } catch {
    /* ignore */
  }
}

export function hasPendingStorageRepair() {
  try {
    return sessionStorage.getItem(REPAIR_FLAG) === "1";
  } catch {
    return false;
  }
}

export function markStorageRepairAttempt() {
  try {
    sessionStorage.setItem(REPAIR_FLAG, "1");
  } catch {
    /* ignore */
  }
}

export function clearStorageRepairAttempt() {
  try {
    sessionStorage.removeItem(REPAIR_FLAG);
  } catch {
    /* ignore */
  }
}

/**
 * Auto-recover once per tab session: repair + reload.
 * Returns true if a reload was scheduled (caller should stop).
 */
export async function tryAutoRepairStorageAndReload(err) {
  if (!isBrowserStorageError(err)) return false;
  if (hasPendingStorageRepair()) return false;

  markStorageRepairAttempt();
  try {
    await repairBrowserStorage({ clearCaches: true });
  } catch (repairErr) {
    console.warn("storage repair failed:", repairErr);
  }
  setTimeout(() => {
    location.reload();
  }, 350);
  return true;
}

/** Full manual repair from UI button — always reloads. */
export async function repairStorageAndReload() {
  markStorageRepairAttempt();
  try {
    await repairBrowserStorage({ clearCaches: true });
  } catch (err) {
    console.warn("manual storage repair failed:", err);
  }
  location.reload();
}
