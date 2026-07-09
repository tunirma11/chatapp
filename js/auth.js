import {
  signInAnonymously,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { auth, db } from "./firebase.js";
import { ONLINE_THRESHOLD_MS } from "./constants.js";
import {
  getDeviceSession,
  saveDeviceSession,
  clearDeviceSession,
  touchDeviceSession,
} from "./store.js";

let currentUserDoc = null;

async function attachDeviceSession(uid, roomId, username) {
  const memberSnap = await getDoc(doc(db, "rooms", roomId, "members", username));
  if (!memberSnap.exists()) {
    throw new Error("সদস্য পাওয়া যায়নি");
  }

  const userMeta = memberSnap.data();
  const userRef = doc(db, "users", uid);

  await setDoc(
    userRef,
    {
      roomId,
      username,
      displayName: userMeta.name,
      role: "chat",
      isOnline: true,
      lastSeen: serverTimestamp(),
    },
    { merge: true }
  );

  const userSnap = await getDoc(userRef);
  currentUserDoc = { uid, roomId, ...userSnap.data() };
  return currentUserDoc;
}

export async function enterChatAsMember(roomId, username) {
  if (!roomId || !username) throw new Error("রুম বা সদস্য সঠিক নয়");

  const cred = await signInAnonymously(auth);
  try {
    const user = await attachDeviceSession(cred.user.uid, roomId, username);
    await saveDeviceSession({
      roomId,
      username,
      lastActiveAt: Date.now(),
    });
    return user;
  } catch (err) {
    await signOut(auth);
    throw err;
  }
}

export async function ensureAnonymousAuth() {
  if (auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}

export async function logout() {
  await markDeviceOffline();
  currentUserDoc = null;
  await clearDeviceSession();
  await signOut(auth);
}

export async function markDeviceOffline() {
  if (!auth.currentUser) return;
  await setDoc(
    doc(db, "users", auth.currentUser.uid),
    { isOnline: false, lastSeen: serverTimestamp() },
    { merge: true }
  ).catch(() => {});
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      currentUserDoc = null;
      callback(null);
      return;
    }

    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      currentUserDoc = null;
      callback(null);
      return;
    }

    currentUserDoc = { uid: user.uid, ...snap.data() };
    await setDoc(
      userRef,
      { isOnline: true, lastSeen: serverTimestamp() },
      { merge: true }
    ).catch(() => {});
    await touchDeviceSession().catch(() => {});
    callback(currentUserDoc);
  });
}

export function getCurrentUser() {
  return currentUserDoc;
}

export async function sendHeartbeat() {
  if (!auth.currentUser) return;
  await setDoc(
    doc(db, "users", auth.currentUser.uid),
    { isOnline: true, lastSeen: serverTimestamp() },
    { merge: true }
  ).catch(() => {});
  await touchDeviceSession().catch(() => {});
}

export function isUserRecentlyActive(lastSeen, thresholdMs = ONLINE_THRESHOLD_MS) {
  if (!lastSeen) return false;
  const ts = typeof lastSeen === "number" ? lastSeen : lastSeen;
  return Date.now() - ts < thresholdMs;
}

export function isUsernameOnline(users, username, thresholdMs = ONLINE_THRESHOLD_MS) {
  return users.some(
    (user) =>
      user.username === username &&
      user.isOnline &&
      isUserRecentlyActive(user.lastSeen, thresholdMs)
  );
}
