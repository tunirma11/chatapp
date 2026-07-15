export const MESSAGE_TYPES = {
  TEXT: "text",
  IMAGE: "image",
  LINK: "link",
  SYSTEM: "system",
};

export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "👏"];

export function normalizeTimestamp(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (value?.toMillis) return value.toMillis();
  return 0;
}

export function normalizeMessage(doc) {
  const data = typeof doc.data === "function" ? doc.data() : doc;
  const id = doc.id || data.id;
  return {
    id,
    type: data.type || MESSAGE_TYPES.TEXT,
    senderId: data.senderId,
    senderName: data.senderName,
    senderUid: data.senderUid,
    text: data.text || "",
    imageUrl: data.imageUrl || null,
    imageThumbUrl: data.imageThumbUrl || null,
    imageWidth: data.imageWidth || null,
    imageHeight: data.imageHeight || null,
    linkUrl: data.linkUrl || null,
    linkPreview: data.linkPreview || null,
    createdAt: normalizeTimestamp(data.createdAt),
    editedAt: normalizeTimestamp(data.editedAt) || null,
    deletedAt: normalizeTimestamp(data.deletedAt) || null,
    deletedBy: data.deletedBy || null,
    hiddenFor: data.hiddenFor || {},
    read: data.read === true,
    readBy: data.readBy || {},
    deliveredBy: data.deliveredBy || {},
    replyTo: data.replyTo || null,
    reactions: data.reactions || {},
    pinned: data.pinned === true,
    pinnedAt: normalizeTimestamp(data.pinnedAt) || null,
    imageStripped: data.imageStripped === true,
    localId: data.localId || null,
    status: data.status || "sent",
  };
}

export function isMessageDeleted(msg) {
  return Boolean(msg?.deletedAt);
}

export function isMessageHiddenForUser(msg, username) {
  if (!msg || !username) return false;
  return msg.hiddenFor?.[username] != null;
}

/** Usernames who hid this message, excluding the viewer (partner soft-delete). */
export function getPartnerHideUsernames(msg, viewerUsername) {
  if (!msg?.hiddenFor) return [];
  return Object.keys(msg.hiddenFor).filter(
    (u) => u && u !== viewerUsername && msg.hiddenFor[u] != null
  );
}

export function wasHiddenByPartner(msg, viewerUsername) {
  return getPartnerHideUsernames(msg, viewerUsername).length > 0;
}

/** Warning shown to the other member when someone hid the message for themselves only. */
export function getPartnerDeleteWarning(msg, viewerUsername) {
  if (!wasHiddenByPartner(msg, viewerUsername)) return null;
  return "অন্য পক্ষ থেকে মুছে ফেলা হয়েছে";
}

/** Deleted globally or hidden only for this viewer */
export function isMessageDeletedForViewer(msg, username) {
  return isMessageDeleted(msg) || isMessageHiddenForUser(msg, username);
}

export function isMessageVisible(msg, clearedAt = 0) {
  if (isMessageDeleted(msg)) return true;
  if (!clearedAt) return true;
  return (msg.createdAt || 0) > clearedAt;
}

/** Label shown in place of a deleted/hidden message bubble. */
export function getDeletedMessageLabel(msg, viewerUsername = null) {
  if (isMessageDeleted(msg)) {
    const by = msg.deletedBy || null;
    if (by && viewerUsername && by !== viewerUsername) {
      return "অন্য পক্ষ থেকে মুছে ফেলা হয়েছে";
    }
    return "মেসেজ মুছে ফেলা হয়েছে";
  }
  // m2 (or any non-primary hide-for-self): show as if removed for everyone
  if (viewerUsername && isMessageHiddenForUser(msg, viewerUsername)) {
    return "সবার থেকে মেসেজ মুছে ফেলা হয়েছে";
  }
  return "মেসেজ মুছে ফেলা হয়েছে";
}

export function getMessagePreviewText(msg, viewerUsername = null) {
  if (viewerUsername && isMessageHiddenForUser(msg, viewerUsername)) {
    return getDeletedMessageLabel(msg, viewerUsername);
  }
  if (isMessageDeleted(msg)) return getDeletedMessageLabel(msg, viewerUsername);
  if (msg.type === MESSAGE_TYPES.IMAGE) {
    if (msg.imageStripped) return msg.text?.trim() || "ছবি (মুছে ফেলা হয়েছে)";
    return msg.text?.trim() || "ছবি";
  }
  if (msg.type === MESSAGE_TYPES.LINK) return msg.text?.trim() || msg.linkUrl || "লিংক";
  return msg.text || "";
}

export function isMessageReadBy(msg, username) {
  if (!msg || !username) return false;
  return msg.readBy?.[username] != null;
}

export function isMessageDeliveredBy(msg, username) {
  if (!msg || !username) return false;
  return msg.deliveredBy?.[username] != null;
}

/** Own message: sent → delivered → seen */
export function getOwnMessageStatus(msg, partnerUsername, localStatus = "sent") {
  if (localStatus === "pending" || localStatus === "sending") return localStatus;
  if (localStatus === "failed") return "failed";
  if (!partnerUsername) return "sent";
  if (isMessageReadBy(msg, partnerUsername)) return "seen";
  if (isMessageDeliveredBy(msg, partnerUsername)) return "delivered";
  return "sent";
}

export function buildMessagePayload(me, fields) {
  return {
    type: MESSAGE_TYPES.TEXT,
    senderId: me.username,
    senderName: me.displayName || me.username,
    senderUid: me.uid,
    read: false,
    readBy: {},
    deliveredBy: {},
    reactions: {},
    pinned: false,
    ...fields,
  };
}
