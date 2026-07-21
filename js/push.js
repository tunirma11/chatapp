import { doc, getDoc, updateDoc, deleteField } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db, auth } from "./firebase.js";
import { isPrimaryMember } from "./users.js";
import { VAPID_PUBLIC_KEY, PUSH_SENDER_URL, DEFAULT_PUSH_NOTIFY_TEXT } from "./push-config.js";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function subKeyFromSubscription(subscription) {
  try {
    const endpoint = subscription?.endpoint || subscription?.toJSON?.()?.endpoint || "";
    let hash = 0;
    for (let i = 0; i < endpoint.length; i++) {
      hash = (hash * 31 + endpoint.charCodeAt(i)) >>> 0;
    }
    return `s${hash.toString(36)}`;
  } catch {
    return `s${Date.now().toString(36)}`;
  }
}

function subKey(subscription) {
  return subKeyFromSubscription(subscription);
}

/** Rough platform hint for settings instructions. */
export function getNotifyPlatform() {
  const ua = navigator.userAgent || "";
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

export function getNotificationPermission() {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

/** Bengali steps when browser permission is denied (cannot re-prompt). */
export function getNotificationDeniedGuide() {
  return getNotificationDeniedGuideSteps().join("\n");
}

/** Steps as lines for inline settings sheet (no alert spam). */
export function getNotificationDeniedGuideSteps() {
  const platform = getNotifyPlatform();
  if (platform === "ios") {
    return [
      "নোটিফিকেশন ব্লক করা আছে — অ্যাপ থেকে আবার Allow চাওয়া যায় না।",
      "1. Settings → Notifications → GitBridge (বা সাইট নাম) → Allow",
      "2. Home Screen থেকে অ্যাপ আবার খুলুন",
      "3. এখানে টগল চালু করুন",
      "না পেলে: Settings → Safari → Advanced → Website Data থেকে সাইট মুছে PWA আবার খুলুন।",
    ];
  }
  if (platform === "android") {
    return [
      "নোটিফিকেশন ব্লক করা আছে — অ্যাপ থেকে আবার Allow চাওয়া যায় না।",
      "1. ঠিকানাবারের লক/ⓘ → Permissions → Notifications → Allow",
      "   অথবা Settings → Apps → Chrome/অ্যাপ → Notifications → Allow",
      "2. অ্যাপে ফিরে এখানে টগল চালু করুন",
    ];
  }
  return [
    "নোটিফিকেশন ব্লক করা আছে — অ্যাপ থেকে আবার Allow চাওয়া যায় না।",
    "1. ঠিকানাবারের লক/ⓘ → Site settings → Notifications → Allow",
    "2. পেজ রিফ্রেশ করে এখানে টগল চালু করুন",
  ];
}

export const NOTIFY_SOFT_ASK =
  "নতুন মেসেজের নোটিফিকেশন চালু করতে চান?\n\nপরের স্ক্রিনে Allow চাপুন। Don't Allow চাপলে সেটিংস ছাড়া আর চালু করা যাবে না।";

async function savePushSubscription(roomId, memberId, { requestIfNeeded = true } = {}) {
  if (!roomId || !memberId) return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  if (!VAPID_PUBLIC_KEY) return false;
  if (typeof Notification === "undefined") return false;

  let permission = Notification.permission;
  if (permission === "denied") return false;

  if (permission !== "granted") {
    if (!requestIfNeeded) return false;
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return false;

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = subscription.toJSON();
  if (!json?.endpoint || !json?.keys?.p256dh || !json?.keys?.auth) return false;

  const key = subKey(json);
  await updateDoc(doc(db, "rooms", roomId, "members", memberId), {
    [`pushSubs.${key}`]: {
      endpoint: json.endpoint,
      keys: {
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
      updatedAt: Date.now(),
    },
  });
  return true;
}

async function clearPushSubscription(roomId, memberId) {
  if (!roomId || !memberId) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const json = subscription.toJSON();
      const key = subKey(json);
      await updateDoc(doc(db, "rooms", roomId, "members", memberId), {
        [`pushSubs.${key}`]: deleteField(),
      }).catch(() => {});
      await subscription.unsubscribe().catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

export async function initM1Push(roomId, username) {
  if (!isPrimaryMember(username) || !roomId) return;
  try {
    const enabled = await getMemberPushEnabled(roomId, "m1");
    if (!enabled) return;
    await savePushSubscription(roomId, "m1");
  } catch (err) {
    console.warn("initM1Push:", err);
  }
}

function memberIdForUser(username) {
  return isPrimaryMember(username) ? "m1" : "m2";
}

/**
 * App-level receive preference.
 * m2: explicit true (legacy pushNotifyApprove).
 * m1: default true when field missing (backward compatible).
 */
export async function getMemberPushEnabled(roomId, memberId) {
  if (!roomId || !memberId) return false;
  try {
    const snap = await getDoc(doc(db, "rooms", roomId, "members", memberId));
    if (!snap.exists()) return false;
    const d = snap.data();
    if (d.pushNotifyEnabled === true) return true;
    if (d.pushNotifyEnabled === false) return false;
    if (memberId === "m2") {
      if (d.pushNotifyApprove === true && d.pushNotifyEnabled == null) return true;
      return false;
    }
    // m1: missing field → treat as on (existing installs)
    return true;
  } catch {
    return false;
  }
}

export async function getM2PushEnabled(roomId) {
  return getMemberPushEnabled(roomId, "m2");
}

export async function getRoomAdminPushM1(roomId) {
  if (!roomId) return false;
  try {
    const snap = await getDoc(doc(db, "rooms", roomId));
    return snap.exists() && snap.data().pushNotifyM1 === true;
  } catch {
    return false;
  }
}

export async function getRoomPushNotifyText(roomId) {
  if (!roomId) return DEFAULT_PUSH_NOTIFY_TEXT;
  try {
    const snap = await getDoc(doc(db, "rooms", roomId));
    if (!snap.exists()) return DEFAULT_PUSH_NOTIFY_TEXT;
    const text = String(snap.data().pushNotifyText || "").trim();
    return text || DEFAULT_PUSH_NOTIFY_TEXT;
  } catch {
    return DEFAULT_PUSH_NOTIFY_TEXT;
  }
}

const DEFAULT_QUIET = { enabled: false, startMin: 23 * 60, endMin: 7 * 60, tzOffsetMin: 0 };

export function normalizeQuietHours(raw) {
  const q = raw && typeof raw === "object" ? raw : {};
  const startMin = clampMin(q.startMin, DEFAULT_QUIET.startMin);
  const endMin = clampMin(q.endMin, DEFAULT_QUIET.endMin);
  const tzOffsetMin = Number.isFinite(Number(q.tzOffsetMin))
    ? Number(q.tzOffsetMin)
    : -new Date().getTimezoneOffset();
  return {
    enabled: Boolean(q.enabled),
    startMin,
    endMin,
    tzOffsetMin,
  };
}

function clampMin(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(24 * 60 - 1, Math.round(n)));
}

export function minutesToTimeInput(mins) {
  const m = clampMin(mins, 0);
  const h = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${h}:${mm}`;
}

export function timeInputToMinutes(value) {
  const m = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return DEFAULT_QUIET.startMin;
  return clampMin(Number(m[1]) * 60 + Number(m[2]), 0);
}

/** Receiver quiet window — uses stored tzOffsetMin (set when receiver saves prefs). */
export function isQuietHoursActive(quietHours, nowMs = Date.now()) {
  const q = normalizeQuietHours(quietHours);
  if (!q.enabled) return false;
  // Identical start/end is invalid — do not treat as "all day quiet"
  if (q.startMin === q.endMin) return false;
  const d = new Date(nowMs);
  const utcMins = d.getUTCHours() * 60 + d.getUTCMinutes();
  const mins = (utcMins + q.tzOffsetMin + 1440 * 3) % 1440;
  if (q.startMin < q.endMin) return mins >= q.startMin && mins < q.endMin;
  return mins >= q.startMin || mins < q.endMin;
}

export async function getMemberQuietHours(roomId, memberId) {
  if (!roomId || !memberId) return normalizeQuietHours(DEFAULT_QUIET);
  try {
    const snap = await getDoc(doc(db, "rooms", roomId, "members", memberId));
    if (!snap.exists()) return normalizeQuietHours(DEFAULT_QUIET);
    return normalizeQuietHours(snap.data().notifyQuietHours);
  } catch {
    return normalizeQuietHours(DEFAULT_QUIET);
  }
}

export async function setMemberQuietHours(roomId, memberId, quiet) {
  if (!roomId || !memberId) return;
  const next = normalizeQuietHours({
    ...quiet,
    tzOffsetMin: -new Date().getTimezoneOffset(),
  });
  await updateDoc(doc(db, "rooms", roomId, "members", memberId), {
    notifyQuietHours: next,
  });
  return next;
}

async function receiverInQuietHours(roomId, memberId) {
  const q = await getMemberQuietHours(roomId, memberId);
  return isQuietHoursActive(q);
}

/**
 * Enable/disable receiving pushes for m1 or m2; on enable also subscribe.
 */
export async function setMemberPushEnabled(roomId, memberId, enabled) {
  if (!roomId || !memberId) return;
  const on = Boolean(enabled);

  if (on && typeof Notification !== "undefined" && Notification.permission === "denied") {
    await updateDoc(doc(db, "rooms", roomId, "members", memberId), {
      pushNotifyEnabled: false,
      pushNotifyApprove: false,
    }).catch(() => {});
    const err = new Error(getNotificationDeniedGuide());
    err.code = "notify-denied";
    throw err;
  }

  await updateDoc(doc(db, "rooms", roomId, "members", memberId), {
    pushNotifyEnabled: on,
    pushNotifyApprove: on,
  });
  if (on) {
    const ok = await savePushSubscription(roomId, memberId);
    if (!ok) {
      await updateDoc(doc(db, "rooms", roomId, "members", memberId), {
        pushNotifyEnabled: false,
        pushNotifyApprove: false,
      });
      if (typeof Notification !== "undefined" && Notification.permission === "denied") {
        const err = new Error(getNotificationDeniedGuide());
        err.code = "notify-denied";
        throw err;
      }
      throw new Error("নোটিফিকেশন অনুমতি দিন অথবা সাপোর্টেড ব্রাউজার ব্যবহার করুন");
    }
  } else {
    await clearPushSubscription(roomId, memberId);
  }
}

export async function setM2PushEnabled(roomId, enabled) {
  return setMemberPushEnabled(roomId, "m2", enabled);
}

/**
 * Status chip + sheet model for current user.
 * chip: ready | app_off | blocked | unsupported | admin_off (m1 only)
 */
export async function getNotifySettingsSnapshot(roomId, username) {
  const memberId = memberIdForUser(username);
  const supported = Boolean(
    typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window
  );
  const permission = supported ? Notification.permission : "unsupported";
  let subscribed = false;
  let currentKey = null;
  if (supported && permission === "granted") {
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      subscribed = Boolean(sub);
      if (sub) currentKey = subKey(sub.toJSON());
    } catch {
      subscribed = false;
    }
  }

  const enabledInApp = await getMemberPushEnabled(roomId, memberId);
  const adminPushM1 = memberId === "m1" ? await getRoomAdminPushM1(roomId) : null;

  // Keep Firestore pushSubs in sync with the local PushManager subscription
  if (enabledInApp && permission === "granted" && subscribed) {
    try {
      await savePushSubscription(roomId, memberId, { requestIfNeeded: false });
    } catch (err) {
      console.warn("ensure pushSubs:", err);
    }
  }

  const devices = await listPushDevices(roomId, memberId, currentKey);
  const storedOnServer = Boolean(
    currentKey && devices.some((d) => d.key === currentKey)
  );
  const quietHours = await getMemberQuietHours(roomId, memberId);
  const quietActiveNow = isQuietHoursActive(quietHours);
  const pushNotifyText = await getRoomPushNotifyText(roomId);

  let lastPushOkAt = 0;
  try {
    const snap = await getDoc(doc(db, "rooms", roomId, "members", memberId));
    if (snap.exists()) lastPushOkAt = Number(snap.data().lastPushOkAt) || 0;
  } catch {
    /* ignore */
  }

  let chip = "ready";
  if (!supported || permission === "unsupported") chip = "unsupported";
  else if (permission === "denied") chip = "blocked";
  else if (!enabledInApp) chip = "app_off";
  else if (memberId === "m1" && adminPushM1 === false) chip = "admin_off";
  else if (!subscribed || !storedOnServer) chip = "app_off";
  else chip = "ready";

  const ready =
    chip === "ready" &&
    permission === "granted" &&
    subscribed &&
    storedOnServer &&
    enabledInApp &&
    (memberId !== "m1" || adminPushM1 === true);

  return {
    memberId,
    supported,
    permission,
    subscribed,
    storedOnServer,
    enabledInApp,
    adminPushM1,
    ready,
    chip,
    currentKey,
    devices,
    deniedSteps: permission === "denied" ? getNotificationDeniedGuideSteps() : [],
    quietHours,
    quietActiveNow,
    pushNotifyText,
    lastPushOkAt,
  };
}

/** @deprecated use getNotifySettingsSnapshot */
export async function getM2DeviceNotifyStatus(roomId) {
  const snap = await getNotifySettingsSnapshot(roomId, "m2");
  return {
    supported: snap.supported,
    permission: snap.permission,
    subscribed: snap.subscribed,
    enabledInApp: snap.enabledInApp,
    ready: snap.ready,
  };
}

export async function listPushDevices(roomId, memberId, currentKey = null) {
  if (!roomId || !memberId) return [];
  try {
    const snap = await getDoc(doc(db, "rooms", roomId, "members", memberId));
    if (!snap.exists()) return [];
    const subs = snap.data().pushSubs || {};
    const out = [];
    for (const [key, val] of Object.entries(subs)) {
      if (!val || typeof val !== "object") continue;
      out.push({
        key,
        updatedAt: Number(val.updatedAt) || 0,
        isCurrent: Boolean(currentKey && key === currentKey),
      });
    }
    out.sort((a, b) => b.updatedAt - a.updatedAt);
    return out;
  } catch {
    return [];
  }
}

/** Remove all pushSubs except this device's current subscription. */
export async function keepOnlyThisDevice(roomId, memberId) {
  if (!roomId || !memberId) return 0;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) throw new Error("এই ডিভাইসে সাবস্ক্রিপশন নেই — আগে নোটিফ চালু করুন");
  const current = subKey(subscription.toJSON());
  const snap = await getDoc(doc(db, "rooms", roomId, "members", memberId));
  if (!snap.exists()) return 0;
  const subs = snap.data().pushSubs || {};
  const updates = {};
  let removed = 0;
  for (const key of Object.keys(subs)) {
    if (key === current) continue;
    updates[`pushSubs.${key}`] = deleteField();
    removed += 1;
  }
  if (removed) {
    await updateDoc(doc(db, "rooms", roomId, "members", memberId), updates);
  }
  // Ensure current is saved
  await savePushSubscription(roomId, memberId, { requestIfNeeded: false });
  return removed;
}

/** Local test — does not use push server. */
export async function showLocalTestNotification(titleText) {
  if (typeof Notification === "undefined") {
    const err = new Error("এই ডিভাইসে নোটিফিকেশন সাপোর্ট নেই");
    err.code = "notify-unsupported";
    throw err;
  }
  if (Notification.permission === "denied") {
    const err = new Error(getNotificationDeniedGuide());
    err.code = "notify-denied";
    throw err;
  }
  if (Notification.permission !== "granted") {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      const err = new Error(
        perm === "denied" ? getNotificationDeniedGuide() : "নোটিফিকেশন অনুমতি দেওয়া হয়নি"
      );
      err.code = perm === "denied" ? "notify-denied" : "notify-default";
      throw err;
    }
  }
  const title =
    String(titleText || "")
      .replace(/https?:\/\/\S+/gi, "")
      .trim() || DEFAULT_PUSH_NOTIFY_TEXT;
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(title, {
    body: "সিস্টেম নোটিফ ঠিক আছে",
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    tag: "gitbridge-test-notify",
    renotify: true,
  });
  return true;
}

export async function syncMemberPushWithBrowserPermission(roomId, memberId) {
  if (!roomId || !memberId) return false;
  if (typeof Notification === "undefined") return false;
  if (Notification.permission !== "denied") return false;
  const enabled = await getMemberPushEnabled(roomId, memberId);
  if (!enabled) return false;
  await updateDoc(doc(db, "rooms", roomId, "members", memberId), {
    pushNotifyEnabled: false,
    pushNotifyApprove: false,
  });
  await clearPushSubscription(roomId, memberId).catch(() => {});
  return true;
}

export async function syncM2PushWithBrowserPermission(roomId) {
  return syncMemberPushWithBrowserPermission(roomId, "m2");
}

export async function resubscribeMemberPushIfNeeded(roomId, memberId) {
  if (!roomId || !memberId) return false;
  if (typeof Notification === "undefined") return false;
  if (Notification.permission !== "granted") return false;
  const enabled = await getMemberPushEnabled(roomId, memberId);
  if (!enabled) return false;
  try {
    return await savePushSubscription(roomId, memberId, { requestIfNeeded: false });
  } catch (err) {
    console.warn("resubscribeMemberPushIfNeeded:", err);
    return false;
  }
}

export async function resubscribeM2PushIfNeeded(roomId) {
  return resubscribeMemberPushIfNeeded(roomId, "m2");
}

/** @deprecated use getM2PushEnabled */
export async function getM2PushApprove(roomId) {
  return getM2PushEnabled(roomId);
}

/** @deprecated use setM2PushEnabled */
export async function setM2PushApprove(roomId, approved) {
  return setM2PushEnabled(roomId, approved);
}

async function postNotify(roomId, target) {
  const me = auth.currentUser;
  if (!me || !PUSH_SENDER_URL) return { ok: false };
  const idToken = await me.getIdToken();
  const res = await fetch(`${PUSH_SENDER_URL.replace(/\/$/, "")}/notify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ roomId, target }),
  });
  if (res.status === 204) return { ok: true, sent: 0, reason: "gated" };
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn("postNotify failed:", target, res.status, text.slice(0, 200));
    return { ok: false, status: res.status };
  }
  let body = {};
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  const sent = Number(body.sent) || 0;
  if (sent > 0) {
    await updateDoc(doc(db, "rooms", roomId, "members", target), {
      lastPushOkAt: Date.now(),
    }).catch(() => {});
  } else {
    console.warn("postNotify sent=0:", target, body?.reason || body);
  }
  return { ok: true, sent, ...body };
}

/**
 * Notify m1 — admin room.pushNotifyM1 + members/m1.pushNotifyEnabled.
 */
export async function notifyM1Device(roomId) {
  if (!roomId || !PUSH_SENDER_URL) return;
  const me = auth.currentUser;
  if (!me) return;

  try {
    const roomSnap = await getDoc(doc(db, "rooms", roomId));
    if (!roomSnap.exists()) return;
    if (roomSnap.data().pushNotifyM1 !== true) return;
    const enabled = await getMemberPushEnabled(roomId, "m1");
    if (!enabled) return;
    if (await receiverInQuietHours(roomId, "m1")) return;
    await postNotify(roomId, "m1");
  } catch (err) {
    console.warn("notifyM1Device:", err);
  }
}

/**
 * Notify m2 — ONLY members/m2.pushNotifyEnabled (no admin gate).
 */
export async function notifyM2Device(roomId) {
  if (!roomId || !PUSH_SENDER_URL) return;
  const me = auth.currentUser;
  if (!me) return;

  try {
    const enabled = await getMemberPushEnabled(roomId, "m2");
    if (!enabled) return;
    if (await receiverInQuietHours(roomId, "m2")) return;
    await postNotify(roomId, "m2");
  } catch (err) {
    console.warn("notifyM2Device:", err);
  }
}

export async function clearM1PushSubscription(roomId, username) {
  if (!isPrimaryMember(username) || !roomId) return;
  await clearPushSubscription(roomId, "m1");
}

export { DEFAULT_PUSH_NOTIFY_TEXT, memberIdForUser };
