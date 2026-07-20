import {
  collection,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
  enableIndexedDbPersistence,
  limitToLast,
  startAfter,
  limit,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "../firebase.js";
import { getCurrentUser } from "../auth.js";
import {
  addToOutbox,
  generateLocalId,
  removeFromOutbox,
  updateOutboxMessage,
} from "../store.js";
import { MAX_MESSAGE_LENGTH, MESSAGES_PAGE_SIZE } from "../constants.js";
import {
  MESSAGE_TYPES,
  normalizeMessage,
  buildMessagePayload,
  isMessageVisible,
  isMessageDeletedForViewer,
} from "./message-model.js";
import { extractFirstUrl, buildBasicLinkPreview } from "./links.js";

let persistenceEnabled = false;

export async function enableOfflinePersistence() {
  if (persistenceEnabled) return;
  try {
    await enableIndexedDbPersistence(db);
    persistenceEnabled = true;
  } catch (err) {
    if (err.code !== "failed-precondition" && err.code !== "unimplemented") {
      console.warn("Offline persistence unavailable:", err);
    }
  }
}

export function listenRoomMeta(roomId, callback) {
  const ref = doc(db, "rooms", roomId, "meta", "settings");
  return onSnapshot(
    ref,
    (snap) => {
      const data = snap.exists() ? snap.data() : {};
      callback({
        clearedAt: data.clearedAt?.toMillis?.() ?? data.clearedAt ?? 0,
        retentionDays: data.retentionDays || null,
        imageStripDays: data.imageStripDays || null,
        lastMaintenanceAt: data.lastMaintenanceAt?.toMillis?.() ?? data.lastMaintenanceAt ?? 0,
      });
    },
    () => callback({ clearedAt: 0, retentionDays: null, imageStripDays: null, lastMaintenanceAt: 0 })
  );
}

export async function setRoomClearedAt(roomId) {
  await setDoc(
    doc(db, "rooms", roomId, "meta", "settings"),
    { clearedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function sendMessageToServer(roomId, payload, localId = null) {
  const me = getCurrentUser();
  if (!me) throw new Error("লগইন করা নেই");

  const messagesRef = collection(db, "rooms", roomId, "messages");
  await addDoc(messagesRef, {
    ...payload,
    createdAt: serverTimestamp(),
    localId,
  });

  await setDoc(
    doc(db, "rooms", roomId),
    { lastActivityAt: serverTimestamp() },
    { merge: true }
  ).catch(() => {});

  if (localId) await removeFromOutbox(localId);
}

function buildPayloadFromInput(me, text, options = {}) {
  const trimmed = (text || "").trim();
  const type = options.type || MESSAGE_TYPES.TEXT;
  const payload = buildMessagePayload(me, { text: trimmed, type });

  if (options.replyTo) payload.replyTo = options.replyTo;

  const url = extractFirstUrl(trimmed);
  if (options.imageUrl) {
    payload.type = MESSAGE_TYPES.IMAGE;
    payload.imageUrl = options.imageUrl;
    payload.imageThumbUrl = options.imageThumbUrl || options.imageUrl;
    payload.imageWidth = options.imageWidth || null;
    payload.imageHeight = options.imageHeight || null;
  } else if (type === MESSAGE_TYPES.LINK && url) {
    payload.type = MESSAGE_TYPES.LINK;
    payload.linkUrl = url;
    payload.linkPreview = options.linkPreview || buildBasicLinkPreview(url);
  } else if (url && trimmed === url) {
    payload.type = MESSAGE_TYPES.LINK;
    payload.linkUrl = url;
    payload.linkPreview = options.linkPreview || buildBasicLinkPreview(url);
  } else if (url) {
    payload.linkUrl = url;
    payload.linkPreview = buildBasicLinkPreview(url);
  }

  return payload;
}

export async function sendMessage(roomId, text, options = {}) {
  const me = getCurrentUser();
  if (!me) throw new Error("লগইন করা নেই");

  const trimmed = (text || "").trim();
  const isImage = Boolean(options.imageUrl);
  if (!trimmed && !isImage) return null;
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`মেসেজ ${MAX_MESSAGE_LENGTH} অক্ষরের বেশি হতে পারবে না`);
  }

  const localId = options.localId || generateLocalId();
  const payload = buildPayloadFromInput(me, trimmed, options);

  const optimistic = {
    id: localId,
    localId,
    ...payload,
    createdAt: Date.now(),
    status: "sending",
    pending: false,
  };

  if (!navigator.onLine) {
    if (isImage) {
      throw new Error("অফলাইনে ছবি পাঠানো যাবে না — ইন্টারনেট চালু করে আবার চেষ্টা করুন");
    }
    await addToOutbox({
      id: localId,
      roomId,
      text: trimmed,
      type: payload.type,
      imageUrl: payload.imageUrl,
      replyTo: payload.replyTo,
      senderId: me.username,
      senderName: me.displayName || me.username,
      createdAt: Date.now(),
      status: "pending",
      retries: 0,
    });
    optimistic.status = "pending";
    optimistic.pending = true;
    return optimistic;
  }

  try {
    await sendMessageToServer(roomId, payload, localId);
    optimistic.status = "sent";
    return optimistic;
  } catch (err) {
    await addToOutbox({
      id: localId,
      roomId,
      text: trimmed,
      type: payload.type,
      imageUrl: payload.imageUrl,
      replyTo: payload.replyTo,
      senderId: me.username,
      senderName: me.displayName || me.username,
      createdAt: Date.now(),
      status: "pending",
      retries: 0,
    });
    optimistic.status = "pending";
    optimistic.pending = true;
    return optimistic;
  }
}

export async function sendImageMessage(roomId, imageUrl, meta = {}, caption = "") {
  return sendMessage(roomId, caption, {
    type: MESSAGE_TYPES.IMAGE,
    imageUrl,
    imageThumbUrl: imageUrl,
    imageWidth: meta.width,
    imageHeight: meta.height,
    replyTo: meta.replyTo,
  });
}

export async function retryOutboxMessage(item) {
  const me = getCurrentUser();
  if (!me) return false;

  await updateOutboxMessage(item.id, { status: "pending", retries: (item.retries || 0) + 1 });
  try {
    const payload = buildMessagePayload(me, {
      text: item.text,
      type: item.type || MESSAGE_TYPES.TEXT,
      imageUrl: item.imageUrl,
      replyTo: item.replyTo,
    });
    await sendMessageToServer(item.roomId, payload, item.id);
    await removeFromOutbox(item.id);
    return true;
  } catch {
    await updateOutboxMessage(item.id, { status: "failed" });
    return false;
  }
}

export function listenToRecentMessages(roomId, callback, clearedAt = 0) {
  const q = query(
    collection(db, "rooms", roomId, "messages"),
    orderBy("createdAt", "desc"),
    limitToLast(MESSAGES_PAGE_SIZE)
  );

  return onSnapshot(
    q,
    (snap) => {
      const recent = snap.docs
        .map((d) => normalizeMessage({ id: d.id, ...d.data() }))
        .filter((m) => isMessageVisible(m, clearedAt))
        .reverse();
      callback({
        recent,
        hasMoreHint: snap.docs.length >= MESSAGES_PAGE_SIZE,
      });
    },
    (err) => {
      console.error("Message listener error:", err);
      callback(null, err);
    }
  );
}

export async function fetchOlderMessages(roomId, oldestMessage, clearedAt = 0) {
  if (!roomId || !oldestMessage?.id) {
    return { messages: [], hasMore: false, cursor: null };
  }

  const oldestRef = doc(db, "rooms", roomId, "messages", oldestMessage.id);
  const oldestSnap = await getDoc(oldestRef);
  if (!oldestSnap.exists()) {
    const fallbackMs = oldestMessage.createdAt;
    if (!fallbackMs) return { messages: [], hasMore: false, cursor: null };
    const q = query(
      collection(db, "rooms", roomId, "messages"),
      orderBy("createdAt", "desc"),
      startAfter(Timestamp.fromMillis(fallbackMs)),
      limit(MESSAGES_PAGE_SIZE)
    );
    const snap = await getDocs(q);
    const messages = snap.docs
      .map((d) => normalizeMessage({ id: d.id, ...d.data() }))
      .filter((m) => isMessageVisible(m, clearedAt))
      .reverse();
    return {
      messages,
      hasMore: snap.docs.length >= MESSAGES_PAGE_SIZE,
      cursor: snap.docs[snap.docs.length - 1] || null,
    };
  }

  const q = query(
    collection(db, "rooms", roomId, "messages"),
    orderBy("createdAt", "desc"),
    startAfter(oldestSnap),
    limit(MESSAGES_PAGE_SIZE)
  );

  const snap = await getDocs(q);
  const messages = snap.docs
    .map((d) => normalizeMessage({ id: d.id, ...d.data() }))
    .filter((m) => isMessageVisible(m, clearedAt))
    .reverse();

  return {
    messages,
    hasMore: snap.docs.length >= MESSAGES_PAGE_SIZE,
    cursor: snap.docs[snap.docs.length - 1] || null,
  };
}

/** @deprecated use listenToRecentMessages */
export function listenToMessages(roomId, callback, clearedAt = 0) {
  return listenToRecentMessages(roomId, (result, err) => {
    if (err) {
      callback(null, err);
      return;
    }
    if (result === null) {
      callback(null);
      return;
    }
    callback(result.recent);
  }, clearedAt);
}

export async function markMessageRead(roomId, messageId) {
  const me = getCurrentUser();
  if (!me?.username) return;
  const ref = doc(db, "rooms", roomId, "messages", messageId);
  await updateDoc(ref, {
    [`readBy.${me.username}`]: serverTimestamp(),
    read: true,
  }).catch(() => {});
}

export async function markMessagesAcknowledged(roomId, messages, myUsername) {
  const toUpdate = messages.filter((m) => {
    if (m.senderId === myUsername || m.deletedAt) return false;
    const needDeliver = !isAlreadyDelivered(m, myUsername);
    const needRead = !isAlreadyRead(m, myUsername);
    return needDeliver || needRead;
  });
  if (!toUpdate.length) return;

  const batch = writeBatch(db);
  toUpdate.slice(0, 50).forEach((m) => {
    const ref = doc(db, "rooms", roomId, "messages", m.id);
    const updates = {};
    if (!isAlreadyDelivered(m, myUsername)) {
      updates[`deliveredBy.${myUsername}`] = serverTimestamp();
      pendingMarkDeliveredIds.add(m.id);
    }
    if (!isAlreadyRead(m, myUsername)) {
      updates[`readBy.${myUsername}`] = serverTimestamp();
      updates.read = true;
      pendingMarkReadIds.add(m.id);
    }
    if (Object.keys(updates).length) batch.update(ref, updates);
  });

  try {
    await batch.commit();
  } catch (err) {
    toUpdate.forEach((m) => {
      pendingMarkDeliveredIds.delete(m.id);
      pendingMarkReadIds.delete(m.id);
    });
    console.warn("markMessagesAcknowledged failed:", err);
  }
}

export async function markMessagesDelivered(roomId, messages, myUsername) {
  const undelivered = messages.filter(
    (m) =>
      m.senderId !== myUsername &&
      !m.deletedAt &&
      !isAlreadyDelivered(m, myUsername)
  );
  if (!undelivered.length) return;

  undelivered.forEach((m) => pendingMarkDeliveredIds.add(m.id));

  const batch = writeBatch(db);
  undelivered.slice(0, 50).forEach((m) => {
    const ref = doc(db, "rooms", roomId, "messages", m.id);
    batch.update(ref, {
      [`deliveredBy.${myUsername}`]: serverTimestamp(),
    });
  });

  try {
    await batch.commit();
  } catch (err) {
    undelivered.forEach((m) => pendingMarkDeliveredIds.delete(m.id));
    console.warn("markMessagesDelivered failed:", err);
  }
}

export async function markMessagesRead(roomId, messages, myUsername) {
  const unread = messages.filter(
    (m) =>
      m.senderId !== myUsername &&
      !m.deletedAt &&
      !isAlreadyRead(m, myUsername)
  );
  if (!unread.length) return;

  unread.forEach((m) => pendingMarkReadIds.add(m.id));

  const batch = writeBatch(db);
  unread.slice(0, 50).forEach((m) => {
    const ref = doc(db, "rooms", roomId, "messages", m.id);
    batch.update(ref, {
      [`readBy.${myUsername}`]: serverTimestamp(),
      read: true,
    });
  });

  try {
    await batch.commit();
  } catch (err) {
    unread.forEach((m) => pendingMarkReadIds.delete(m.id));
    console.warn("markMessagesRead failed:", err);
  }
}

const pendingMarkReadIds = new Set();
const pendingMarkDeliveredIds = new Set();

function isAlreadyRead(msg, username) {
  if (!username) return false;
  if (pendingMarkReadIds.has(msg.id)) return true;
  return msg.readBy?.[username] != null;
}

function isAlreadyDelivered(msg, username) {
  if (!username) return false;
  if (pendingMarkDeliveredIds.has(msg.id)) return true;
  return msg.deliveredBy?.[username] != null;
}

export function resetMarkReadCache() {
  pendingMarkReadIds.clear();
  pendingMarkDeliveredIds.clear();
}

export async function softDeleteMessage(roomId, messageId) {
  const me = getCurrentUser();
  if (!me) throw new Error("লগইন করা নেই");
  await updateDoc(doc(db, "rooms", roomId, "messages", messageId), {
    deletedAt: serverTimestamp(),
    deletedBy: me.username,
    text: "",
    imageUrl: null,
    linkUrl: null,
    linkPreview: null,
  });
}

/** Second member: hide only for self; primary member still sees the message */
export async function hideMessageForSelf(roomId, messageId) {
  const me = getCurrentUser();
  if (!me) throw new Error("লগইন করা নেই");
  await updateDoc(doc(db, "rooms", roomId, "messages", messageId), {
    [`hiddenFor.${me.username}`]: serverTimestamp(),
  });
}

export async function deleteMessage(roomId, messageId, { forEveryone }) {
  if (forEveryone) return softDeleteMessage(roomId, messageId);
  return hideMessageForSelf(roomId, messageId);
}

/** Primary (m1): permanently delete message doc for both members — no placeholder. */
export async function removeMessageCompletely(roomId, messageId) {
  const me = getCurrentUser();
  if (!me) throw new Error("লগইন করা নেই");
  await deleteDoc(doc(db, "rooms", roomId, "messages", messageId));
}

export async function toggleMessagePin(roomId, messageId, pinned) {
  await updateDoc(doc(db, "rooms", roomId, "messages", messageId), {
    pinned: Boolean(pinned),
    pinnedAt: pinned ? serverTimestamp() : null,
  });
}

export async function toggleReaction(roomId, messageId, emoji, currentReactions = {}) {
  const me = getCurrentUser();
  if (!me?.username) return;

  const users = Array.isArray(currentReactions[emoji]) ? [...currentReactions[emoji]] : [];
  const idx = users.indexOf(me.username);
  if (idx >= 0) users.splice(idx, 1);
  else users.push(me.username);

  const reactions = { ...currentReactions, [emoji]: users };
  if (!users.length) delete reactions[emoji];

  await updateDoc(doc(db, "rooms", roomId, "messages", messageId), { reactions });
}

export async function clearAllMessages(roomId) {
  const snap = await getDocs(collection(db, "rooms", roomId, "messages"));
  const BATCH = 400;
  for (let i = 0; i < snap.docs.length; i += BATCH) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + BATCH).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await setRoomClearedAt(roomId);
}

export function searchMessages(messages, queryText, viewerUsername = null) {
  const q = String(queryText || "").trim().toLowerCase();
  if (!q) return [];
  return messages.filter((m) => {
    if (viewerUsername ? isMessageDeletedForViewer(m, viewerUsername) : m.deletedAt) return false;
    const text = (m.text || "").toLowerCase();
    const link = (m.linkUrl || "").toLowerCase();
    const name = (m.senderName || "").toLowerCase();
    return text.includes(q) || link.includes(q) || name.includes(q);
  });
}
