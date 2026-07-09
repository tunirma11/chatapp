import {
  getMemberById,
  getOtherMember,
  getMembers,
  fetchMembersOnce,
  listenToMembers,
  clearMembersCache,
  adminAddMember,
  deleteMember,
  updateMemberPassword,
  isPrimaryMember,
} from "./users.js";
import {
  enterChatAsMember,
  logout,
  onAuthChange,
  sendHeartbeat,
  getCurrentUser,
  markDeviceOffline,
  isUsernameOnline,
  ensureAnonymousAuth,
  validateDeviceSession,
  listenMemberSession,
} from "./auth.js";
import { loginAdmin, logoutAdmin, isAdminLoggedIn, touchAdminSession } from "./admin.js";
import { verifyRoomLogin } from "./room-gate.js";
import {
  createRoom,
  getRoom,
  listRooms,
  setRoomStatus,
  deleteRoom,
  isRoomFull,
} from "./rooms.js";
import { onRouteChange, navigateToAdmin, navigateToHome, parseRoute } from "./router.js";
import { getPendingMessages, clearRoomSession, getDeviceSession } from "./store.js";
import {
  enableOfflinePersistence,
  sendMessage,
  sendImageMessage,
  listenToMessages,
  listenRoomMeta,
  listenToRoomUsers,
  markMessagesAcknowledged,
  deleteMessage,
  toggleMessagePin,
  toggleReaction,
  clearAllMessages,
  searchMessages,
  resetMarkReadCache,
} from "./chat.js";
import { listenPresence, setTyping, stopTyping, isPartnerTyping } from "./messaging/presence.js";
import { compressImage, prepareImageForMessage } from "./messaging/media.js";
import { getMessagePreviewText, isMessageHiddenForUser, isMessageDeletedForViewer } from "./messaging/message-model.js";
import { initOfflineSync, onConnectionStatusChange, flushOutbox, retryOutboxMessage } from "./offline.js";
import {
  showView,
  showToast,
  renderMessages,
  focusMessageInput,
  clearMessageInput,
  autoResizeTextarea,
  setSendEnabled,
  setConnectionBar,
  showInstallBanner,
  hideInstallBanner,
  showWaitingForPartner,
  showChatReady,
  updatePartnerHeader,
  showMessageContextMenu,
  showReplyPreview,
  showSearchOverlay,
  showImageLightbox,
  downloadImage,
  renderPinnedBar,
  setUploadProgress,
  pulseSendButton,
  resetMessageRenderCache,
  toggleRoomMenu,
  scrollToBottom,
  isOwnMessage,
} from "./ui.js";
import {
  renderAdminRoomList,
  renderAdminRoomDetail,
  hideAdminRoomDetail,
  setAdminLoading,
  setAdminCreateLoading,
  setChatLoginLoading,
  showChatLoginError,
  hideChatLoginError,
  getSelectedAdminRoomId,
  setSelectedAdminRoomId,
  showAdminLogin,
} from "./ui-admin.js";
import {
  bindSoundUnlock,
  loadSoundPreference,
  saveSoundPreference,
  isSoundEnabled,
  playSend,
  playReceive,
  playLogin,
  playLogout,
  playError,
  playOnline,
  playOffline,
  playTap,
  playSync,
  playSentConfirm,
} from "./sounds.js";
import { formatLastSeen } from "./ui/format.js";
import { normalizeRoomCode, validateRoomCode, CHAT_IDLE_MS, APP_NAME, TYPING_DEBOUNCE_MS, MESSAGE_DELETE_WINDOW_MS } from "./constants.js";
import { formatFirebaseError } from "./errors.js";

let currentRoomId = null;
let partnerUsername = null;
let unsubscribeMessages = null;
let unsubscribeUsers = null;
let unsubscribeMembers = null;
let unsubscribePresence = null;
let unsubscribeMeta = null;
let pendingLocalMessages = [];
let members = [];
let usersOnline = [];
let roomPresence = {};
let roomClearedAt = 0;
let replyToMessage = null;
let typingDebounceTimer = null;
let deferredInstallPrompt = null;
let heartbeatTimer = null;
let isEnteringChat = false;
let sessionStarted = false;
let prevConnectionStatus = "online";
let knownMessageIds = new Set();
let messagesInitialized = false;
let currentMessages = [];
let adminRooms = [];
let chatIdleTimer = null;
let lastChatActivityAt = 0;
let markReadTimer = null;
let ackTimer = null;
let renderUiRaf = null;
let lastPartnerStatusText = "";
let messagesListenerRoomId = null;
let currentRouteView = parseRoute().view;
let unsubscribeSession = null;
let localSessionId = null;
let isRemoteLoggingOut = false;

function pauseChatUi() {
  if (!sessionStarted) return;
  stopChatSession();
  sessionStarted = false;
}

function isAdminRoute() {
  return currentRouteView === "admin";
}

const CHAT_AUTH_KEY = "chat-authenticated";

function isChatAuthenticated() {
  return sessionStorage.getItem(CHAT_AUTH_KEY) === "1";
}

function setChatAuthenticated(value) {
  if (value) sessionStorage.setItem(CHAT_AUTH_KEY, "1");
  else sessionStorage.removeItem(CHAT_AUTH_KEY);
}

function resetChatIdleTimer() {
  if (!sessionStarted) return;
  lastChatActivityAt = Date.now();
  if (chatIdleTimer) clearTimeout(chatIdleTimer);
  chatIdleTimer = setTimeout(() => {
    handleChatIdleLogout().catch(() => {});
  }, CHAT_IDLE_MS);
}

function stopChatIdleWatch() {
  if (chatIdleTimer) {
    clearTimeout(chatIdleTimer);
    chatIdleTimer = null;
  }
}

async function handleChatIdleLogout() {
  if (!sessionStarted || !getCurrentUser()) return;
  if (Date.now() - lastChatActivityAt < CHAT_IDLE_MS) {
    resetChatIdleTimer();
    return;
  }
  showToast("১০ মিনিট নিষ্ক্রিয় থাকায় লগআউট হয়েছে");
  await handleLogout(false);
}

async function init() {
  try {
    registerServiceWorker();
    initInstallPrompt();
    bindSoundUnlock();
    await loadSoundPreference();
    updateSoundToggleUI();
    initOfflineSync();
    onConnectionStatusChange(handleConnectionChange);
    await enableOfflinePersistence();
  } catch (err) {
    console.error("App init failed:", err);
    showToast("অ্যাপ লোড করা যায়নি — পেজ রিফ্রেশ করুন");
  }

  document.getElementById("adminLoginForm")?.addEventListener("submit", handleAdminLogin);
  document.getElementById("adminLogoutBtn")?.addEventListener("click", handleAdminLogout);
  document.getElementById("adminCreateRoomForm")?.addEventListener("submit", handleAdminCreateRoom);
  document.getElementById("adminAddMemberForm")?.addEventListener("submit", handleAdminAddMember);
  document.getElementById("adminToggleRoomBtn")?.addEventListener("click", handleAdminToggleRoom);
  document.getElementById("adminDeleteRoomBtn")?.addEventListener("click", handleAdminDeleteRoom);
  document.getElementById("adminMemberList")?.addEventListener("click", handleAdminMemberListClick);
  document.getElementById("adminMemberList")?.addEventListener("submit", handleAdminMemberPasswordSubmit);
  document.getElementById("chatLoginForm")?.addEventListener("submit", handleChatLogin);
  document.getElementById("logoutBtn")?.addEventListener("click", handleLogout);
  document.getElementById("soundToggleBtn")?.addEventListener("click", handleSoundToggle);
  document.getElementById("sendBtn")?.addEventListener("click", handleSend);
  document.getElementById("messageInput")?.addEventListener("input", handleInputChange);
  document.getElementById("messageInput")?.addEventListener("keydown", handleInputKeydown);
  document.getElementById("attachImageBtn")?.addEventListener("click", () => document.getElementById("imageFileInput")?.click());
  document.getElementById("imageFileInput")?.addEventListener("change", handleImageSelect);
  document.getElementById("roomMenuBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const menu = document.getElementById("roomMenu");
    toggleRoomMenu(menu?.classList.contains("d-none"));
  });
  document.getElementById("searchMessagesBtn")?.addEventListener("click", handleOpenSearch);
  document.getElementById("clearChatBtn")?.addEventListener("click", handleClearChat);
  document.addEventListener("click", () => toggleRoomMenu(false));

  onRouteChange(async (route) => {
    currentRouteView = route.view;
    if (route.view === "home") {
      await bootstrapChatLogin(route.prefillRoomId);
      return;
    }
    if (route.view === "admin") {
      await bootstrapAdmin();
    }
  });

  onAuthChange(async (user) => {
    if (isEnteringChat) return;

    if (isAdminRoute()) {
      pauseChatUi();
      return;
    }

    if (!isChatAuthenticated()) {
      if (user) await logout();
      return;
    }
    if (!user) {
      if (sessionStarted) exitChat();
      return;
    }

    if (!currentRoomId) currentRoomId = user.roomId;

    if (user.roomId === currentRoomId) {
      if (!sessionStarted) {
        const valid = await validateDeviceSession(user.roomId, user.username);
        if (!valid) {
          setChatAuthenticated(false);
          await logout();
          if (!isAdminRoute()) showToast("অন্য ডিভাইসে লগইন হয়েছে");
          return;
        }
        await fetchMembersOnce(user.roomId).catch(() => {});
        enterChat(user);
      }
      return;
    }

    if (user.roomId !== currentRoomId) {
      await logout();
      setChatAuthenticated(false);
    }
  });

  initDeviceLifecycle();
}

async function bootstrapAdmin() {
  pauseChatUi();
  showView("admin");
  if (!(await isAdminLoggedIn())) {
    showAdminLogin(true);
    return;
  }
  showAdminLogin(false);
  await touchAdminSession();
  await ensureAnonymousAuth();
  await refreshAdminRooms();
}

async function refreshAdminRooms() {
  try {
    adminRooms = await listRooms();
    renderAdminRoomList(adminRooms, async (roomId) => {
      setSelectedAdminRoomId(roomId);
      await loadAdminRoomDetail(roomId);
    });
    const selected = getSelectedAdminRoomId();
    if (selected) await loadAdminRoomDetail(selected);
  } catch (err) {
    console.error(err);
    showToast(formatFirebaseError(err));
  }
}

async function loadAdminRoomDetail(roomId) {
  const room = await getRoom(roomId);
  if (!room) {
    hideAdminRoomDetail();
    return;
  }
  await fetchMembersOnce(roomId);
  renderAdminRoomDetail(room, getMembers());
}

async function bootstrapChatLogin(prefillRoomId) {
  currentRoomId = null;
  clearMembersCache();
  hideChatLoginError();
  showView("home");

  const roomInput = document.getElementById("chatRoomInput");
  if (prefillRoomId && roomInput) {
    roomInput.value = prefillRoomId;
  }

  if (!isChatAuthenticated()) {
    const user = getCurrentUser();
    if (user) await logout();
    return;
  }

  const user = getCurrentUser();
  if (user?.roomId) {
    const valid = await validateDeviceSession(user.roomId, user.username);
    if (!valid) {
      setChatAuthenticated(false);
      await logout();
      showToast("অন্য ডিভাইসে লগইন হয়েছে");
      return;
    }
    currentRoomId = user.roomId;
    await fetchMembersOnce(user.roomId);
    enterChat(user);
  }
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const password = document.getElementById("adminPasswordInput")?.value || "";
  if (!password) {
    showToast("পাসওয়ার্ড দিন");
    return;
  }

  setAdminLoading(true);
  try {
    await loginAdmin(password);
    playLogin();
    navigateToAdmin();
    await bootstrapAdmin();
  } catch (err) {
    console.error("Admin login failed:", err);
    playError();
    showToast(formatFirebaseError(err));
  } finally {
    setAdminLoading(false);
  }
}

async function handleAdminLogout() {
  await logoutAdmin();
  hideAdminRoomDetail();
  showAdminLogin(true);
  showToast("অ্যাডমিন লগআউট হয়েছে", "success");
}

async function handleAdminCreateRoom(e) {
  e.preventDefault();
  const label = document.getElementById("newRoomLabel")?.value || "";
  const roomCode = document.getElementById("newRoomCode")?.value || "";
  if (!roomCode.trim()) {
    showToast("রুম কোড দিন");
    return;
  }

  setAdminCreateLoading(true);
  try {
    await ensureAnonymousAuth();
    const roomId = await createRoom(label, roomCode);
    document.getElementById("newRoomLabel").value = "";
    document.getElementById("newRoomCode").value = "";
    await refreshAdminRooms();
    setSelectedAdminRoomId(roomId);
    await loadAdminRoomDetail(roomId);
    playTap();
    showToast("রুম তৈরি হয়েছে", "success");
  } catch (err) {
    playError();
    showToast(formatFirebaseError(err));
  } finally {
    setAdminCreateLoading(false);
  }
}

async function handleAdminAddMember(e) {
  e.preventDefault();
  const roomId = getSelectedAdminRoomId();
  const name = document.getElementById("adminMemberName")?.value || "";
  const password = document.getElementById("adminMemberPassword")?.value || "";
  if (!roomId) return;

  const room = await getRoom(roomId);
  if (isRoomFull(room)) {
    showToast("রুমে ইতিমধ্যে ২ জন আছে");
    return;
  }

  try {
    await ensureAnonymousAuth();
    await adminAddMember(roomId, name, password);
    document.getElementById("adminMemberName").value = "";
    document.getElementById("adminMemberPassword").value = "";
    await refreshAdminRooms();
    await loadAdminRoomDetail(roomId);
    showToast("সদস্য যোগ হয়েছে", "success");
  } catch (err) {
    showToast(formatFirebaseError(err));
  }
}

async function handleAdminMemberListClick(e) {
  const btn = e.target.closest(".admin-delete-member");
  if (!btn) return;
  const roomId = getSelectedAdminRoomId();
  const username = btn.dataset.username;
  if (!roomId || !username) return;

  try {
    await deleteMember(roomId, username);
    await refreshAdminRooms();
    await loadAdminRoomDetail(roomId);
    showToast("সদস্য মুছে ফেলা হয়েছে", "success");
  } catch (err) {
    showToast(formatFirebaseError(err));
  }
}

async function handleAdminMemberPasswordSubmit(e) {
  const form = e.target.closest(".admin-member-password-form");
  if (!form) return;
  e.preventDefault();

  const roomId = getSelectedAdminRoomId();
  const username = form.dataset.username;
  const input = form.querySelector('input[type="password"]');
  const password = input?.value || "";
  if (!roomId || !username || !password) return;

  try {
    await updateMemberPassword(roomId, username, password);
    if (input) input.value = "";
    showToast(`${username} এর পাসওয়ার্ড আপডেট হয়েছে`, "success");
  } catch (err) {
    showToast(formatFirebaseError(err));
  }
}

async function handleAdminToggleRoom() {
  const roomId = getSelectedAdminRoomId();
  if (!roomId) return;
  const room = await getRoom(roomId);
  const next = room.status === "disabled" ? "active" : "disabled";
  try {
    await setRoomStatus(roomId, next);
    await refreshAdminRooms();
    await loadAdminRoomDetail(roomId);
    showToast(next === "disabled" ? "রুম নিষ্ক্রিয় করা হয়েছে" : "রুম সক্রিয় করা হয়েছে", "success");
  } catch (err) {
    showToast(formatFirebaseError(err));
  }
}

async function handleAdminDeleteRoom() {
  const roomId = getSelectedAdminRoomId();
  if (!roomId) return;

  const room = await getRoom(roomId);
  const label = room?.label || roomId;
  if (!confirm(`"${label}" রুম মুছে ফেলবেন? সদস্য ও মেসেজ সহ সব ডেটা মুছে যাবে।`)) {
    return;
  }

  try {
    await ensureAnonymousAuth();
    await deleteRoom(roomId);
    hideAdminRoomDetail();
    await refreshAdminRooms();
    showToast("রুম মুছে ফেলা হয়েছে", "success");
  } catch (err) {
    showToast(formatFirebaseError(err));
  }
}

async function handleChatLogin(e) {
  e.preventDefault();
  const roomId = normalizeRoomCode(document.getElementById("chatRoomInput")?.value || "");
  const password = document.getElementById("chatPasswordInput")?.value || "";
  await startChatFromLogin(roomId, password);
}

async function startChatFromLogin(roomId, password) {
  const codeError = validateRoomCode(roomId);
  if (codeError) {
    showChatLoginError(codeError);
    playError();
    return;
  }

  setChatLoginLoading(true);
  isEnteringChat = true;
  try {
    await ensureAnonymousAuth();
    currentRoomId = roomId;

    if (!password) throw new Error("পাসওয়ার্ড দিন");
    const member = await verifyRoomLogin(roomId, password);

    const user = await enterChatAsMember(roomId, member.id);
    setChatAuthenticated(true);
    enterChat(user);
    playLogin();
    showToast("সংযোগ স্থাপিত হয়েছে — অন্য ডিভাইস থেকে লগআউট করা হয়েছে", "success");
  } catch (err) {
    console.error("Login failed:", err);
    playError();
    showChatLoginError(formatFirebaseError(err));
  } finally {
    isEnteringChat = false;
    setChatLoginLoading(false);
    const passwordInput = document.getElementById("chatPasswordInput");
    if (passwordInput) passwordInput.value = "";
  }
}

function enterChat(user) {
  if (isAdminRoute()) return;
  showView("chat");
  if (!sessionStarted) {
    startChatSession();
    sessionStarted = true;
  }
  const partner = getOtherMember(user.username);
  if (partner) {
    if (partnerUsername !== partner.id) {
      openPartnerChat(partner);
    }
  } else if (!partnerUsername) {
    showWaitingForPartner();
  }
}

function exitChat() {
  stopChatSession();
  sessionStarted = false;
  partnerUsername = null;
  currentRoomId = null;
  showView("home");
}

async function handleLogout(showMessage = true) {
  playLogout();
  setChatAuthenticated(false);
  await logout();
  await clearRoomSession();
  exitChat();
  navigateToHome();
  const passwordInput = document.getElementById("chatPasswordInput");
  if (passwordInput) passwordInput.value = "";
  if (showMessage) showToast("লগআউট হয়েছে", "success");
}

function onMembersUpdated(list) {
  members = list;
  const me = getCurrentUser();
  if (!me) return;
  const partner = getOtherMember(me.username);
  if (partner && !partnerUsername) openPartnerChat(partner);
  else if (!partner) showWaitingForPartner();
}

function handleConnectionChange(status, label) {
  setConnectionBar(status, label);
  if (prevConnectionStatus === "offline" && status === "online") playOnline();
  else if (prevConnectionStatus !== "offline" && status === "offline") playOffline();
  else if (prevConnectionStatus === "syncing" && status === "online") playSync();
  prevConnectionStatus = status;
}

function updateSoundToggleUI() {
  const on = isSoundEnabled();
  document.getElementById("soundOnIcon")?.classList.toggle("d-none", !on);
  document.getElementById("soundOffIcon")?.classList.toggle("d-none", on);
}

async function handleSoundToggle() {
  await saveSoundPreference(!isSoundEnabled());
  updateSoundToggleUI();
  if (isSoundEnabled()) playTap();
}

function getPartnerUserRecord(username) {
  return usersOnline.find((u) => u.username === username) || null;
}

function refreshPartnerHeader() {
  if (!partnerUsername) return;
  const partner = getMemberById(partnerUsername);
  if (!partner) return;
  const online = isUsernameOnline(usersOnline, partnerUsername);
  const record = getPartnerUserRecord(partnerUsername);
  const typing = online && isPartnerTyping(roomPresence, partnerUsername);
  let statusText = formatLastSeen(record?.lastSeen || 0, online);
  if (online && typing) statusText = "অনলাইন · লিখছেন…";
  if (statusText === lastPartnerStatusText) return;
  lastPartnerStatusText = statusText;
  updatePartnerHeader(partner, online, record?.lastSeen || 0, typing);
}

function getPinnedMessage() {
  const me = getCurrentUser();
  const pinned = currentMessages.filter(
    (m) => m.pinned && !isMessageDeletedForViewer(m, me?.username)
  );
  if (!pinned.length) return null;
  return pinned.sort((a, b) => (b.pinnedAt || b.createdAt) - (a.pinnedAt || a.createdAt))[0];
}

function buildReplyPayload(msg) {
  if (!msg) return null;
  return {
    id: msg.id,
    senderName: msg.senderName,
    text: getMessagePreviewText(msg),
  };
}

let scrollToBottomNext = false;

function refreshMessageUI({ scrollPolicy = "if-near" } = {}) {
  if (renderUiRaf) cancelAnimationFrame(renderUiRaf);
  renderUiRaf = requestAnimationFrame(() => {
    renderUiRaf = null;
    const me = getCurrentUser();
    const partner = partnerUsername ? getMemberById(partnerUsername) : null;
    if (!me) return;

    let policy = scrollPolicy;
    if (scrollToBottomNext) {
      policy = "smooth";
      scrollToBottomNext = false;
    }

    const allMsgs = [
      ...currentMessages,
      ...pendingLocalMessages.filter(
        (p) => !currentMessages.some((m) => m.localId && m.localId === p.localId)
      ),
    ];

    renderMessages(currentMessages, me.username, me.uid, pendingLocalMessages, {
      onRetry: handleRetry,
      onContextMenu: handleMessageContextMenu,
      onReaction: handleReactionToggle,
      onImageOpen: (url, name) => showImageLightbox(url, name),
      partnerUsername,
      currentUsername: me.username,
      getMessage: (id) => allMsgs.find((m) => m.id === id),
      scrollPolicy: policy,
    }, partner);

    renderPinnedBar(getPinnedMessage(), async (msgId) => {
      try {
        await toggleMessagePin(currentRoomId, msgId, false);
      } catch (err) {
        showToast(formatFirebaseError(err));
      }
    });
  });
}

function scheduleMessageAck() {
  const me = getCurrentUser();
  if (!me || !currentRoomId || !currentMessages.length) return;
  if (ackTimer) clearTimeout(ackTimer);
  ackTimer = setTimeout(() => {
    markMessagesAcknowledged(currentRoomId, currentMessages, me.username).catch(() => {});
  }, 900);
}

function handleInputChange(e) {
  autoResizeTextarea(e.target);
  setSendEnabled(e.target.value.trim().length > 0);
  resetChatIdleTimer();

  if (!currentRoomId) return;
  if (typingDebounceTimer) clearTimeout(typingDebounceTimer);
  typingDebounceTimer = setTimeout(() => {
    const hasText = e.target.value.trim().length > 0;
    setTyping(currentRoomId, hasText).catch(() => {});
  }, TYPING_DEBOUNCE_MS);
}

function handleInputKeydown(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
}

async function handleSend() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text || !partnerUsername || !currentRoomId) return;
  const me = getCurrentUser();
  if (!me) return;

  const replyTo = buildReplyPayload(replyToMessage);
  clearMessageInput();
  playSend();
  pulseSendButton();
  resetChatIdleTimer();
  stopTyping(currentRoomId);

  try {
    const optimistic = await sendMessage(currentRoomId, text, { replyTo });
    if (optimistic) {
      pendingLocalMessages.push(optimistic);
      refreshMessageUI({ scrollPolicy: "smooth" });
    }
    replyToMessage = null;
    showReplyPreview(null);
    if (navigator.onLine) flushOutbox();
  } catch (err) {
    playError();
    showToast(formatFirebaseError(err));
  }
}

async function handleImageSelect(e) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file || !currentRoomId || !partnerUsername) return;

  const me = getCurrentUser();
  if (!me) return;

  try {
    setUploadProgress(true, 0);
    const { imageUrl, width, height } = await prepareImageForMessage(file, (p) =>
      setUploadProgress(true, p)
    );
    const caption = document.getElementById("messageInput")?.value?.trim() || "";
    const replyTo = buildReplyPayload(replyToMessage);

    scrollToBottomNext = true;
    await sendImageMessage(currentRoomId, imageUrl, { width, height, replyTo }, caption);
    clearMessageInput();
    replyToMessage = null;
    showReplyPreview(null);
    playSend();
    setUploadProgress(false);
    showToast("ছবি পাঠানো হয়েছে", "success");
  } catch (err) {
    setUploadProgress(false);
    playError();
    showToast(formatFirebaseError(err));
  }
}

function handleMessageContextMenu(e, msg) {
  const me = getCurrentUser();
  if (!me || !currentRoomId) return;

  const x = e.clientX || e.touches?.[0]?.clientX || 0;
  const y = e.clientY || e.touches?.[0]?.clientY || 0;
  const own = isOwnMessage(msg, me.username, me.uid);
  const primary = isPrimaryMember(me.username);
  const withinWindow = Date.now() - (msg.createdAt || 0) < MESSAGE_DELETE_WINDOW_MS;
  const canDeletePrimary = primary && !msg.deletedAt;
  const canDeleteSecondary =
    !primary &&
    own &&
    !msg.deletedAt &&
    !isMessageHiddenForUser(msg, me.username) &&
    withinWindow;

  const items = [
    { action: "reply", label: "উত্তর দিন" },
    { action: "copy", label: "কপি করুন" },
    { action: "pin", label: msg.pinned ? "আনপিন করুন" : "পিন করুন" },
  ];

  if (msg.imageUrl && !isMessageDeletedForViewer(msg, me.username)) {
    items.splice(1, 0, { action: "download", label: "ছবি ডাউনলোড" });
  }

  if (canDeletePrimary || canDeleteSecondary) {
    items.push({ action: "delete", label: "মুছুন", danger: true });
  }

  items.push({ action: "react", label: "রিঅ্যাকশন" });

  showMessageContextMenu(x, y, items, async (action) => {
    try {
      if (action === "reply") {
        replyToMessage = msg;
        showReplyPreview(msg, () => {
          replyToMessage = null;
          showReplyPreview(null);
        });
        focusMessageInput();
      } else if (action === "copy") {
        await navigator.clipboard.writeText(getMessagePreviewText(msg, me.username));
        showToast("কপি হয়েছে", "success");
      } else if (action === "download") {
        const ts = msg.createdAt || Date.now();
        const sender = String(msg.senderName || msg.senderId || "image")
          .trim()
          .replace(/\s+/g, "-")
          .replace(/[^a-zA-Z0-9_-]/g, "")
          .slice(0, 24) || "image";
        const date = new Date(typeof ts === "number" ? ts : ts).toISOString().slice(0, 10);
        downloadImage(msg.imageUrl, `gitbridge-${sender}-${date}.webp`);
        showToast("ডাউনলোড শুরু হয়েছে", "success");
      } else if (action === "pin") {
        await toggleMessagePin(currentRoomId, msg.id, !msg.pinned);
      } else if (action === "delete") {
        const confirmText = primary
          ? "এই মেসেজ উভয় পক্ষ থেকে মুছে ফেলবেন?"
          : "এই মেসেজ মুছে ফেলবেন? উভয় পক্ষ থেকে মুছে যাবে।";
        if (!confirm(confirmText)) return;
        await deleteMessage(currentRoomId, msg.id, { forEveryone: primary });
        if (!primary) {
          showToast("মেসেজ মুছে ফেলা হয়েছে", "success");
        }
      } else if (action === "react") {
        await toggleReaction(currentRoomId, msg.id, "👍", msg.reactions || {});
      }
    } catch (err) {
      showToast(formatFirebaseError(err));
    }
  });
}

async function handleReactionToggle(messageId, emoji) {
  const msg = currentMessages.find((m) => m.id === messageId);
  if (!msg || !currentRoomId) return;
  try {
    await toggleReaction(currentRoomId, messageId, emoji, msg.reactions || {});
  } catch (err) {
    showToast(formatFirebaseError(err));
  }
}

function handleOpenSearch() {
  toggleRoomMenu(false);
  const me = getCurrentUser();
  const runSearch = (queryText) => {
    const results = searchMessages(currentMessages, queryText, me?.username);
    showSearchOverlay(
      results,
      queryText,
      runSearch,
      (msgId) => {
        const row = document.querySelector(`[data-msg-id="${msgId}"]`);
        row?.scrollIntoView({ behavior: "smooth", block: "center" });
        row?.classList.add("msg-highlight");
        setTimeout(() => row?.classList.remove("msg-highlight"), 1600);
      },
      () => {}
    );
  };
  runSearch("");
}

async function handleClearChat() {
  toggleRoomMenu(false);
  if (!currentRoomId) return;
  if (!confirm("সমস্ত কথোপকথন মুছে ফেলবেন? এটি পূর্বাবস্থায় ফেরানো যাবে না।")) return;

  try {
    await clearAllMessages(currentRoomId);
    currentMessages = [];
    pendingLocalMessages = [];
    refreshMessageUI();
    showToast("কথোপকথন মুছে ফেলা হয়েছে", "success");
  } catch (err) {
    showToast(formatFirebaseError(err));
  }
}

async function handleRetry(localId) {
  const pending = await getPendingMessages();
  const item = pending.find((p) => p.id === localId);
  if (!item) return;
  const ok = await retryOutboxMessage(item);
  if (ok) {
    pendingLocalMessages = pendingLocalMessages.filter((m) => m.localId !== localId);
    playSentConfirm();
    showToast("মেসেজ পাঠানো হয়েছে", "success");
  } else {
    playError();
    showToast("পাঠানো ব্যর্থ — আবার চেষ্টা করুন");
  }
}

async function handleRemoteLogout() {
  if (isRemoteLoggingOut) return;
  isRemoteLoggingOut = true;
  try {
    showToast("অন্য ডিভাইসে লগইন হয়েছে — এই ডিভাইস থেকে লগআউট হয়েছে");
    setChatAuthenticated(false);
    await logout();
    exitChat();
    if (!isAdminRoute()) navigateToHome();
  } finally {
    isRemoteLoggingOut = false;
  }
}

function startChatSession() {
  const me = getCurrentUser();
  if (!me || !currentRoomId) return;

  getDeviceSession().then((deviceSession) => {
    localSessionId = deviceSession?.sessionId || null;
    if (!localSessionId || unsubscribeSession) return;

    unsubscribeSession = listenMemberSession(currentRoomId, me.username, (data) => {
      if (!data.activeSessionId || data.activeSessionId === localSessionId) return;
      handleRemoteLogout().catch(() => {});
    });
  });

  unsubscribeMembers = listenToMembers(currentRoomId, onMembersUpdated);
  unsubscribeUsers = listenToRoomUsers(currentRoomId, (users) => {
    usersOnline = users;
    refreshPartnerHeader();
  });
  unsubscribePresence = listenPresence(currentRoomId, (presence) => {
    roomPresence = presence;
    refreshPartnerHeader();
  });
  unsubscribeMeta = listenRoomMeta(currentRoomId, (meta) => {
    roomClearedAt = meta.clearedAt || 0;
  });
  heartbeatTimer = setInterval(async () => {
    const result = await sendHeartbeat();
    if (result?.revoked) handleRemoteLogout().catch(() => {});
  }, 30000);
  sendHeartbeat().then((result) => {
    if (result?.revoked) handleRemoteLogout().catch(() => {});
  });
  resetChatIdleTimer();
}

function stopChatSession() {
  stopChatIdleWatch();
  stopTyping(currentRoomId);
  if (typingDebounceTimer) {
    clearTimeout(typingDebounceTimer);
    typingDebounceTimer = null;
  }
  if (markReadTimer) {
    clearTimeout(markReadTimer);
    markReadTimer = null;
  }
  if (ackTimer) {
    clearTimeout(ackTimer);
    ackTimer = null;
  }
  if (renderUiRaf) {
    cancelAnimationFrame(renderUiRaf);
    renderUiRaf = null;
  }
  resetMessageRenderCache();
  lastPartnerStatusText = "";
  replyToMessage = null;
  showReplyPreview(null);
  messagesListenerRoomId = null;
  localSessionId = null;
  if (unsubscribeSession) { unsubscribeSession(); unsubscribeSession = null; }
  if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; }
  if (unsubscribeUsers) { unsubscribeUsers(); unsubscribeUsers = null; }
  if (unsubscribeMembers) { unsubscribeMembers(); unsubscribeMembers = null; }
  if (unsubscribePresence) { unsubscribePresence(); unsubscribePresence = null; }
  if (unsubscribeMeta) { unsubscribeMeta(); unsubscribeMeta = null; }
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

async function openPartnerChat(partner) {
  const me = getCurrentUser();
  if (!me || !partner || !currentRoomId) return;

  if (partnerUsername === partner.id && unsubscribeMessages && messagesListenerRoomId === currentRoomId) {
    refreshPartnerHeader();
    return;
  }

  partnerUsername = partner.id;
  const record = getPartnerUserRecord(partner.id);
  showChatReady(partner, isUsernameOnline(usersOnline, partner.id), record?.lastSeen || 0);
  focusMessageInput();

  if (unsubscribeMessages) unsubscribeMessages();

  pendingLocalMessages = [];
  knownMessageIds = new Set();
  messagesInitialized = false;
  resetMessageRenderCache();
  lastPartnerStatusText = "";
  messagesListenerRoomId = currentRoomId;

  unsubscribeMessages = listenToMessages(currentRoomId, async (messages, err) => {
    if (err) {
      showToast("মেসেজ লোড করা যায়নি — পেজ রিফ্রেশ করুন");
      return;
    }
    if (messages === null) return;

    const isInitialHistoryLoad = !messagesInitialized;

    if (!messagesInitialized) {
      messages.forEach((m) => knownMessageIds.add(m.id));
      messagesInitialized = true;
    } else {
      const incoming = messages.filter(
        (m) => !knownMessageIds.has(m.id) && m.senderId !== me.username
      );
      if (incoming.length > 0) playReceive();
      messages.forEach((m) => knownMessageIds.add(m.id));
    }

    currentMessages = messages;
    const pending = await getPendingMessages();
    pendingLocalMessages = pending
      .filter((p) => p.roomId === currentRoomId)
      .map((p) => ({
        id: p.id,
        localId: p.id,
        senderId: me.username,
        senderName: me.displayName || me.username,
        text: p.text,
        type: p.type,
        imageUrl: p.imageUrl,
        replyTo: p.replyTo,
        createdAt: p.createdAt,
        status: p.status === "failed" ? "failed" : "pending",
        pending: true,
      }));

    messages.forEach((m) => {
      if (m.localId) {
        pendingLocalMessages = pendingLocalMessages.filter((p) => p.localId !== m.localId);
      }
    });

    refreshMessageUI({ scrollPolicy: isInitialHistoryLoad ? "force" : "if-near" });
    scheduleMessageAck();
  }, roomClearedAt);
}

function initDeviceLifecycle() {
  const markAdminActive = () => {
    touchAdminSession().catch(() => {});
  };
  const markChatActive = () => {
    if (sessionStarted) resetChatIdleTimer();
  };

  document.addEventListener("click", markAdminActive, { passive: true });
  document.addEventListener("keydown", markAdminActive, { passive: true });
  document.getElementById("chatView")?.addEventListener("click", markChatActive, { passive: true });
  document.getElementById("chatView")?.addEventListener("keydown", markChatActive, { passive: true });
  document.getElementById("chatView")?.addEventListener("touchstart", markChatActive, { passive: true });
  document.getElementById("messageInput")?.addEventListener("focus", markChatActive, { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && getCurrentUser() && sessionStarted) {
      sendHeartbeat().then((result) => {
        if (result?.revoked) handleRemoteLogout().catch(() => {});
      });
      resetChatIdleTimer();
    }
  });
  window.addEventListener("pagehide", () => markDeviceOffline());
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}

function isInStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function isInstallDismissedThisSession() {
  return sessionStorage.getItem("install-dismissed") === "1";
}

function dismissInstallThisSession() {
  sessionStorage.setItem("install-dismissed", "1");
}

function detectInstallMode() {
  if (deferredInstallPrompt) return "native";
  if (isIosDevice()) return "ios";

  const ua = navigator.userAgent;
  if (/firefox/i.test(ua)) return "firefox";
  if (/edg/i.test(ua)) return "edge";
  if (/chrome|crios/i.test(ua)) return "chrome";
  if (/safari/i.test(ua)) return "safari";
  return "generic";
}

function showInstallGuideToast(mode) {
  const guides = {
    chrome: "Chrome: ঠিকানা বারের ডান পাশে Install (⊕) আইকনে ক্লিক করুন",
    edge: "Edge: ঠিকানা বারে 'অ্যাপ হিসেবে ইনস্টল করুন' বাটনে ক্লিক করুন",
    firefox: "Firefox: মেনু (☰) → Install অথবা Page → Install App",
    safari: "Safari: File → Add to Dock অথবা Share → Add to Home Screen",
    ios: "iOS Safari: Share (□↑) → Add to Home Screen",
    generic: "ব্রাউজার মেনু থেকে Install app বা Add to Home Screen খুঁজুন",
    native: "ইনস্টল বাটনে ক্লিক করুন",
  };
  showToast(guides[mode] || guides.generic, "success");
}

async function maybeShowInstallBanner() {
  if (isInStandaloneMode()) return;
  if (isInstallDismissedThisSession()) return;
  showInstallBanner(detectInstallMode());
}

function initInstallPrompt() {
  window.addEventListener("beforeinstallprompt", async (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (!isInStandaloneMode() && !isInstallDismissedThisSession()) {
      showInstallBanner("native");
    }
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    hideInstallBanner();
    showToast(`${APP_NAME} ইনস্টল হয়েছে`, "success");
  });

  setTimeout(() => maybeShowInstallBanner(), 1000);

  document.getElementById("installBtn")?.addEventListener("click", async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      if (outcome === "accepted") hideInstallBanner();
      return;
    }
    showInstallGuideToast(detectInstallMode());
  });
  document.getElementById("dismissInstallBtn")?.addEventListener("click", () => {
    dismissInstallThisSession();
    hideInstallBanner();
  });
}

init();
