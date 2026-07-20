export {
  enableOfflinePersistence,
  sendMessage,
  sendImageMessage,
  listenToMessages,
  listenToRecentMessages,
  fetchOlderMessages,
  listenRoomMeta,
  markMessagesRead,
  markMessagesDelivered,
  markMessagesAcknowledged,
  softDeleteMessage,
  hideMessageForSelf,
  deleteMessage,
  removeMessageCompletely,
  toggleMessagePin,
  toggleReaction,
  clearAllMessages,
  searchMessages,
  retryOutboxMessage,
  resetMarkReadCache,
} from "./messaging/messages.js";

export { runRoomMaintenance, isSafeToPurge } from "./messaging/purge.js";

export { listenRoomUsers } from "./messaging/presence.js";

// Backward-compatible alias
export { listenRoomUsers as listenToRoomUsers } from "./messaging/presence.js";
