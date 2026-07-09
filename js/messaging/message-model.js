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

/** Deleted globally or hidden only for this viewer */
export function isMessageDeletedForViewer(msg, username) {
  return isMessageDeleted(msg) || isMessageHiddenForUser(msg, username);
}

export function isMessageVisible(msg, clearedAt = 0) {
  if (isMessageDeleted(msg)) return true;
  if (!clearedAt) return true;
  return (msg.createdAt || 0) > clearedAt;
}

export function getMessagePreviewText(msg, viewerUsername = null) {
  if (viewerUsername && isMessageHiddenForUser(msg, viewerUsername)) {
    return "মেসেজ মুছে ফেলা হয়েছে";
  }
  if (isMessageDeleted(msg)) return "মেসেজ মুছে ফেলা হয়েছে";
  if (msg.type === MESSAGE_TYPES.IMAGE) return msg.text?.trim() || "ছবি";
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
