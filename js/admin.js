import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { sha256Hex } from "./crypto-utils.js";
import { ADMIN_SESSION_MS } from "./constants.js";
import { getAdminSession, saveAdminSession, clearAdminSession } from "./store.js";
import { ensureAnonymousAuth } from "./auth.js";

export async function verifyAdminPassword(password) {
  await ensureAnonymousAuth();
  const snap = await getDoc(doc(db, "config", "admin"));
  if (!snap.exists()) {
    throw new Error("অ্যাডমিন কনফিগার করা হয়নি। Firebase Console-এ config/admin সেট করুন।");
  }
  const storedHash = String(snap.data().passwordHash || "").trim();
  const inputHash = await sha256Hex(String(password).trim());
  if (inputHash !== storedHash) {
    throw new Error("ভুল পাসওয়ার্ড");
  }
  return true;
}

export async function loginAdmin(password) {
  await verifyAdminPassword(password);
  const session = { verifiedAt: Date.now(), expiresAt: Date.now() + ADMIN_SESSION_MS };
  await saveAdminSession(session);
  return session;
}

export async function isAdminLoggedIn() {
  const session = await getAdminSession();
  if (!session?.verifiedAt) return false;
  if (Date.now() > (session.expiresAt || 0)) {
    await clearAdminSession();
    return false;
  }
  return true;
}

export async function logoutAdmin() {
  await clearAdminSession();
}

export async function touchAdminSession() {
  const session = await getAdminSession();
  if (!session?.verifiedAt) return null;
  if (Date.now() > (session.expiresAt || 0)) {
    await clearAdminSession();
    return null;
  }
  const next = {
    verifiedAt: session.verifiedAt,
    expiresAt: Date.now() + ADMIN_SESSION_MS,
  };
  await saveAdminSession(next);
  return next;
}
