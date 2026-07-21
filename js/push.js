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

function subKey(subscription) {
  try {
    const endpoint = subscription?.endpoint || "";
    let hash = 0;
    for (let i = 0; i < endpoint.length; i++) {
      hash = (hash * 31 + endpoint.charCodeAt(i)) >>> 0;
    }
    return `s${hash.toString(36)}`;
  } catch {
    return `s${Date.now().toString(36)}`;
  }
}

async function savePushSubscription(roomId, memberId) {
  if (!roomId || !memberId) return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  if (!VAPID_PUBLIC_KEY) return false;

  const permission = await Notification.requestPermission();
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
    await savePushSubscription(roomId, "m1");
  } catch (err) {
    console.warn("initM1Push:", err);
  }
}

/**
 * Current-device readiness for receiving message notifications (m2).
 * Does not request permission — only reports status.
 */
export async function getM2DeviceNotifyStatus(roomId) {
  const supported = Boolean(
    typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window
  );
  const permission = supported ? Notification.permission : "unsupported";
  let subscribed = false;
  if (supported && permission === "granted") {
    try {
      const registration = await navigator.serviceWorker.ready;
      subscribed = Boolean(await registration.pushManager.getSubscription());
    } catch {
      subscribed = false;
    }
  }
  const enabledInApp = roomId ? await getM2PushEnabled(roomId) : false;
  const ready =
    supported &&
    permission === "granted" &&
    subscribed &&
    enabledInApp;
  return { supported, permission, subscribed, enabledInApp, ready };
}

/** m2 receive toggle: true = m2 wants notifications (independent of admin). */
export async function getM2PushEnabled(roomId) {
  if (!roomId) return false;
  try {
    const snap = await getDoc(doc(db, "rooms", roomId, "members", "m2"));
    if (!snap.exists()) return false;
    const d = snap.data();
    if (d.pushNotifyEnabled === true) return true;
    // legacy approve field treated as receive preference if set true
    if (d.pushNotifyApprove === true && d.pushNotifyEnabled == null) return true;
    return false;
  } catch {
    return false;
  }
}

/** Enable/disable m2 receiving pushes; on enable also subscribe device. */
export async function setM2PushEnabled(roomId, enabled) {
  if (!roomId) return;
  const on = Boolean(enabled);
  await updateDoc(doc(db, "rooms", roomId, "members", "m2"), {
    pushNotifyEnabled: on,
    pushNotifyApprove: on,
  });
  if (on) {
    const ok = await savePushSubscription(roomId, "m2");
    if (!ok) {
      await updateDoc(doc(db, "rooms", roomId, "members", "m2"), {
        pushNotifyEnabled: false,
        pushNotifyApprove: false,
      });
      throw new Error("নোটিফিকেশন অনুমতি দিন অথবা সাপোর্টেড ব্রাউজার ব্যবহার করুন");
    }
  } else {
    await clearPushSubscription(roomId, "m2");
  }
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
  if (!me || !PUSH_SENDER_URL) return;
  const idToken = await me.getIdToken();
  const res = await fetch(`${PUSH_SENDER_URL.replace(/\/$/, "")}/notify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ roomId, target }),
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => "");
    console.warn("postNotify failed:", target, res.status, text.slice(0, 200));
  }
}

/**
 * Notify m1 — only if admin room.pushNotifyM1 is on.
 * Call after m2 successfully sends.
 */
export async function notifyM1Device(roomId) {
  if (!roomId || !PUSH_SENDER_URL) return;
  const me = auth.currentUser;
  if (!me) return;

  try {
    const roomSnap = await getDoc(doc(db, "rooms", roomId));
    if (!roomSnap.exists()) return;
    if (roomSnap.data().pushNotifyM1 !== true) return;
    await postNotify(roomId, "m1");
  } catch (err) {
    console.warn("notifyM1Device:", err);
  }
}

/**
 * Notify m2 — ONLY depends on members/m2.pushNotifyEnabled (chat toggle).
 * Does NOT read or require rooms.pushNotifyM1 (admin can be OFF).
 * Call after m1 successfully sends.
 */
export async function notifyM2Device(roomId) {
  if (!roomId || !PUSH_SENDER_URL) return;
  const me = auth.currentUser;
  if (!me) return;

  try {
    // Admin panel pushNotifyM1 is intentionally ignored here.
    const enabled = await getM2PushEnabled(roomId);
    if (!enabled) return;
    await postNotify(roomId, "m2");
  } catch (err) {
    console.warn("notifyM2Device:", err);
  }
}

export async function clearM1PushSubscription(roomId, username) {
  if (!isPrimaryMember(username) || !roomId) return;
  await clearPushSubscription(roomId, "m1");
}

export { DEFAULT_PUSH_NOTIFY_TEXT };
