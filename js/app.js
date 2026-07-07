import {
  getMemberById,
  getOtherMember,
  getMembers,
  fetchMembersOnce,
  listenToMembers,
  clearMembersCache,
  adminAddMember,
  deleteMember,
} from "./users.js";
import {
  enterChatAsMember,
  logout,
  onAuthChange,
  sendHeartbeat,
  getCurrentUser,
  canQuickReenter,
  markDeviceOffline,
  isUsernameOnline,
  ensureAnonymousAuth,
} from "./auth.js";
import { loginAdmin, logoutAdmin, isAdminLoggedIn, touchAdminSession } from "./admin.js";
import {
  verifyRoomPassword,
  isRoomPasswordVerified,
  claimMemberSlot,
} from "./room-gate.js";
import {
  createRoom,
  getRoom,
  listRooms,
  updateRoomPassword,
  setRoomStatus,
  isRoomFull,
} from "./rooms.js";
import { onRouteChange, navigateToAdmin, navigateToHome } from "./router.js";
import { isInstallDismissed, dismissInstallPrompt, getPendingMessages, touchDeviceSession } from "./store.js";
import {
  enableOfflinePersistence,
  sendMessage,
  listenToMessages,
  listenToRoomUsers,
} from "./chat.js";
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
} from "./ui.js";
import {
  renderAdminRoomList,
  renderAdminRoomDetail,
  hideAdminRoomDetail,
  setAdminLoading,
  setAdminCreateLoading,
  setRoomGateLoading,
  showRoomGateError,
  hideRoomGateError,
  showQuickRoomHint,
  getSelectedAdminRoomId,
  setSelectedAdminRoomId,
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
import { formatFirebaseError } from "./errors.js";

let currentRoomId = null;
let partnerUsername = null;
let unsubscribeMessages = null;
let unsubscribeUsers = null;
let unsubscribeMembers = null;
let pendingLocalMessages = [];
let members = [];
let usersOnline = [];
let deferredInstallPrompt = null;
let heartbeatTimer = null;
let isEnteringChat = false;
let sessionStarted = false;
let prevConnectionStatus = "online";
let knownMessageIds = new Set();
let messagesInitialized = false;
let currentMessages = [];
let adminRooms = [];

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
  document.getElementById("adminChangePasswordForm")?.addEventListener("submit", handleAdminChangePassword);
  document.getElementById("adminAddMemberForm")?.addEventListener("submit", handleAdminAddMember);
  document.getElementById("adminCopyLinkBtn")?.addEventListener("click", handleAdminCopyLink);
  document.getElementById("adminToggleRoomBtn")?.addEventListener("click", handleAdminToggleRoom);
  document.getElementById("adminMemberList")?.addEventListener("click", handleAdminDeleteMemberClick);
  document.getElementById("roomGateForm")?.addEventListener("submit", handleRoomGate);
  document.getElementById("logoutBtn")?.addEventListener("click", handleLogout);
  document.getElementById("soundToggleBtn")?.addEventListener("click", handleSoundToggle);
  document.getElementById("sendBtn")?.addEventListener("click", handleSend);
  document.getElementById("messageInput")?.addEventListener("input", handleInputChange);
  document.getElementById("messageInput")?.addEventListener("keydown", handleInputKeydown);

  onAuthChange(async (user) => {
    if (isEnteringChat) return;
    if (user && currentRoomId && user.roomId === currentRoomId) {
      enterChat(user);
    } else if (user && currentRoomId && user.roomId !== currentRoomId) {
      await logout();
    } else if (!user && sessionStarted) {
      exitChat();
    }
  });

  onRouteChange(async (route) => {
    if (route.view === "home") {
      currentRoomId = null;
      clearMembersCache();
      showView("home");
      return;
    }
    if (route.view === "admin") {
      await bootstrapAdmin();
      return;
    }
    if (route.view === "room") {
      await bootstrapRoomGate(route.roomId);
    }
  });

  initDeviceLifecycle();
}

async function bootstrapAdmin() {
  if (!(await isAdminLoggedIn())) {
    navigateToHome();
    showToast("অ্যাডমিন পাসওয়ার্ড দিন");
    return;
  }
  await touchAdminSession();
  await ensureAnonymousAuth();
  showView("admin");
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

async function bootstrapRoomGate(roomId) {
  currentRoomId = roomId;
  clearMembersCache();
  hideRoomGateError();

  const room = await getRoom(roomId);
  if (!room) {
    showView("gate");
    showRoomGateError("রুম পাওয়া যায়নি — লিংক যাচাই করুন");
    return;
  }
  if (room.status === "disabled") {
    showView("gate");
    showRoomGateError("এই রুম নিষ্ক্রিয় করা হয়েছে");
    return;
  }

  showView("gate");
  const quick = await canQuickReenter(roomId);
  const verified = await isRoomPasswordVerified(roomId);
  showQuickRoomHint(quick && verified);

  const user = getCurrentUser();
  if (user?.roomId === roomId) {
    enterChat(user);
    return;
  }

  if (quick && verified) {
    await startChatFromGate(null, true);
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
  navigateToHome();
  showToast("অ্যাডমিন লগআউট হয়েছে", "success");
}

async function handleAdminCreateRoom(e) {
  e.preventDefault();
  const label = document.getElementById("newRoomLabel")?.value || "";
  const password = document.getElementById("newRoomPassword")?.value || "";
  if (!password) {
    showToast("রুম পাসওয়ার্ড দিন");
    return;
  }

  setAdminCreateLoading(true);
  try {
    await ensureAnonymousAuth();
    const roomId = await createRoom(label, password);
    document.getElementById("newRoomLabel").value = "";
    document.getElementById("newRoomPassword").value = "";
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

async function handleAdminChangePassword(e) {
  e.preventDefault();
  const roomId = getSelectedAdminRoomId();
  const password = document.getElementById("adminNewRoomPassword")?.value || "";
  if (!roomId || !password) return;

  try {
    await updateRoomPassword(roomId, password);
    document.getElementById("adminNewRoomPassword").value = "";
    showToast("পাসওয়ার্ড আপডেট হয়েছে", "success");
  } catch (err) {
    showToast(formatFirebaseError(err));
  }
}

async function handleAdminAddMember(e) {
  e.preventDefault();
  const roomId = getSelectedAdminRoomId();
  const rawId = document.getElementById("adminMemberId")?.value || "";
  const name = document.getElementById("adminMemberName")?.value || "";
  if (!roomId) return;

  const room = await getRoom(roomId);
  if (isRoomFull(room)) {
    showToast("রুমে ইতিমধ্যে ২ জন আছে");
    return;
  }

  try {
    await ensureAnonymousAuth();
    await adminAddMember(roomId, rawId, name);
    document.getElementById("adminMemberId").value = "";
    document.getElementById("adminMemberName").value = "";
    await refreshAdminRooms();
    await loadAdminRoomDetail(roomId);
    showToast("সদস্য যোগ হয়েছে", "success");
  } catch (err) {
    showToast(formatFirebaseError(err));
  }
}

async function handleAdminDeleteMemberClick(e) {
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

async function handleAdminCopyLink() {
  const link = document.getElementById("adminRoomLink")?.value;
  if (!link) return;
  try {
    await navigator.clipboard.writeText(link);
    showToast("লিংক কপি হয়েছে", "success");
  } catch {
    showToast("কপি করা যায়নি");
  }
}

async function handleRoomGate(e) {
  e.preventDefault();
  await startChatFromGate(document.getElementById("roomPasswordInput")?.value || "", false);
}

async function startChatFromGate(password, skipPasswordCheck) {
  if (!currentRoomId) return;

  setRoomGateLoading(true);
  isEnteringChat = true;
  try {
    if (!skipPasswordCheck) {
      if (!password) throw new Error("রুম পাসওয়ার্ড দিন");
      await verifyRoomPassword(currentRoomId, password);
    } else if (!(await isRoomPasswordVerified(currentRoomId))) {
      throw new Error("আবার পাসওয়ার্ড দিন");
    }

    const username = await claimMemberSlot(currentRoomId);
    const user = await enterChatAsMember(currentRoomId, username);
    enterChat(user);
    playLogin();
    showToast("চ্যাট শুরু হয়েছে", "success");
  } catch (err) {
    playError();
    showRoomGateError(formatFirebaseError(err));
  } finally {
    isEnteringChat = false;
    setRoomGateLoading(false);
  }
}

function enterChat(user) {
  showView("chat");
  if (!sessionStarted) {
    startChatSession();
    sessionStarted = true;
  }
  const partner = getOtherMember(user.username);
  if (partner) openPartnerChat(partner);
  else showWaitingForPartner();
}

function exitChat() {
  stopChatSession();
  sessionStarted = false;
  partnerUsername = null;
  if (currentRoomId) showView("gate");
  else showView("home");
}

async function handleLogout() {
  playLogout();
  await logout();
  exitChat();
  showToast("লগআউট হয়েছে", "success");
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

function handleInputChange(e) {
  autoResizeTextarea(e.target);
  setSendEnabled(e.target.value.trim().length > 0);
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

  clearMessageInput();
  playSend();

  try {
    const optimistic = await sendMessage(currentRoomId, text);
    if (optimistic) {
      pendingLocalMessages.push(optimistic);
      renderMessages(currentMessages, me.username, me.uid, pendingLocalMessages, handleRetry);
    }
    if (navigator.onLine) flushOutbox();
  } catch (err) {
    playError();
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

function startChatSession() {
  const me = getCurrentUser();
  if (!me || !currentRoomId) return;

  unsubscribeMembers = listenToMembers(currentRoomId, onMembersUpdated);
  unsubscribeUsers = listenToRoomUsers(currentRoomId, (users) => {
    usersOnline = users;
    if (partnerUsername) {
      const partner = getMemberById(partnerUsername);
      if (partner) updatePartnerHeader(partner, isUsernameOnline(users, partnerUsername));
    }
  });
  heartbeatTimer = setInterval(sendHeartbeat, 30000);
  sendHeartbeat();
}

function stopChatSession() {
  if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; }
  if (unsubscribeUsers) { unsubscribeUsers(); unsubscribeUsers = null; }
  if (unsubscribeMembers) { unsubscribeMembers(); unsubscribeMembers = null; }
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

async function openPartnerChat(partner) {
  const me = getCurrentUser();
  if (!me || !partner || !currentRoomId) return;

  partnerUsername = partner.id;
  showChatReady(partner, isUsernameOnline(usersOnline, partner.id));
  focusMessageInput();

  if (unsubscribeMessages) unsubscribeMessages();

  pendingLocalMessages = [];
  knownMessageIds = new Set();
  messagesInitialized = false;

  unsubscribeMessages = listenToMessages(currentRoomId, async (messages, err) => {
    if (err) {
      showToast("মেসেজ লোড করা যায়নি — পেজ রিফ্রেশ করুন");
      return;
    }
    if (messages === null) return;

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
        createdAt: p.createdAt,
        status: p.status === "failed" ? "failed" : "pending",
        pending: true,
      }));

    messages.forEach((m) => {
      if (m.localId) {
        pendingLocalMessages = pendingLocalMessages.filter((p) => p.localId !== m.localId);
      }
    });

    renderMessages(currentMessages, me.username, me.uid, pendingLocalMessages, handleRetry);
  });
}

function initDeviceLifecycle() {
  const markActive = () => {
    touchDeviceSession().catch(() => {});
    touchAdminSession().catch(() => {});
  };
  document.addEventListener("click", markActive, { passive: true });
  document.addEventListener("keydown", markActive, { passive: true });
  document.addEventListener("touchstart", markActive, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && getCurrentUser()) {
      sendHeartbeat();
      touchDeviceSession().catch(() => {});
    }
  });
  window.addEventListener("pagehide", () => markDeviceOffline());
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

function initInstallPrompt() {
  window.addEventListener("beforeinstallprompt", async (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (!(await isInstallDismissed())) showInstallBanner();
  });
  document.getElementById("installBtn")?.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    hideInstallBanner();
  });
  document.getElementById("dismissInstallBtn")?.addEventListener("click", async () => {
    await dismissInstallPrompt();
    hideInstallBanner();
  });
}

init();
