import { APP_NAME } from "./constants.js";
import { formatLastSeen } from "./ui/format.js";
import { getInitial, getAvatarColorClass, bindMessagesScroll } from "./ui-messages.js";

export { formatTime, formatDateSeparator } from "./ui/format.js";
export {
  renderMessages,
  scrollToBottom,
  bindMessagesScroll,
  isOwnMessage,
  showMessageContextMenu,
  showReactionPicker,
  showReplyPreview,
  showSearchOverlay,
  showImageLightbox,
  downloadImage,
  renderPinnedBar,
  setUploadProgress,
  pulseSendButton,
  resetMessageRenderCache,
  getInitial,
  getAvatarColorClass,
} from "./ui-messages.js";

export function showToast(message, type = "danger") {
  const container = document.getElementById("toastContainer");
  const id = `toast-${Date.now()}`;
  const html = `
    <div id="${id}" class="toast align-items-center text-bg-${type} border-0" role="alert">
      <div class="d-flex">
        <div class="toast-body">${escapeHtml(message)}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    </div>`;
  container.insertAdjacentHTML("beforeend", html);
  const el = document.getElementById(id);
  const toast = new bootstrap.Toast(el, { delay: 4000 });
  toast.show();
  el.addEventListener("hidden.bs.toast", () => el.remove());
}

export function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function setConnectionBar(status, label) {
  const bar = document.getElementById("connectionBar");
  const text = document.getElementById("connectionText");
  bar.className = `connection-bar ${status}`;
  text.textContent = label;
}

let currentView = null;

export function showView(viewName) {
  const views = {
    home: "homeView",
    admin: "adminView",
    chat: "chatView",
  };

  Object.entries(views).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const active = key === viewName;

    if (currentView && currentView !== viewName && active) {
      const prev = document.getElementById(views[currentView]);
      prev?.classList.add("view-exit");
      setTimeout(() => prev?.classList.remove("view-exit"), 320);
    }

    el.classList.toggle("d-none", !active);
    if (active) {
      el.classList.add("view-enter");
      setTimeout(() => el.classList.remove("view-enter"), 400);
    }
    if (key === "chat") {
      el.classList.toggle("view-active", active);
    }
  });

  currentView = viewName;
}

export function updatePartnerHeader(partner, isOnline, lastSeen = 0, isTyping = false) {
  if (!partner) return;
  document.getElementById("partnerName").textContent = partner.name;
  const statusEl = document.getElementById("partnerStatus");
  if (statusEl) {
    let statusText = formatLastSeen(lastSeen, isOnline);
    if (isOnline && isTyping) {
      statusText = "অনলাইন · লিখছেন…";
      statusEl.classList.add("is-typing");
    } else {
      statusEl.classList.remove("is-typing");
    }
    statusEl.textContent = statusText;
    statusEl.classList.toggle("is-online", isOnline);
  }
  const avatar = document.getElementById("partnerAvatar");
  avatar.className = `avatar avatar-lg ${getAvatarColorClass(partner.id)}`;
  avatar.innerHTML = `${getInitial(partner.name)}${isOnline ? '<span class="online-dot"></span>' : ""}`;
}

export function showWaitingForPartner() {
  const waiting = document.getElementById("waitingPartner");
  const body = document.getElementById("chatBody");
  waiting?.classList.remove("d-none");
  body?.classList.add("d-none");
  document.getElementById("partnerName").textContent = "সঙ্গীর অপেক্ষায়";
  const statusEl = document.getElementById("partnerStatus");
  if (statusEl) {
    statusEl.textContent = "অপেক্ষায়";
    statusEl.classList.remove("is-online", "is-typing");
  }
}

export function showChatReady(partner, isOnline, lastSeen = 0) {
  document.getElementById("waitingPartner")?.classList.add("d-none");
  const body = document.getElementById("chatBody");
  body?.classList.remove("d-none");
  body?.classList.add("chat-body-visible");
  updatePartnerHeader(partner, isOnline, lastSeen, false);
  bindMessagesScroll();
}

export function focusMessageInput() {
  const input = document.getElementById("messageInput");
  if (input) input.focus();
}

export function clearMessageInput() {
  const input = document.getElementById("messageInput");
  input.value = "";
  input.style.height = "auto";
  document.getElementById("sendBtn").disabled = true;
}

export function autoResizeTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
}

export function showInstallBanner(mode = "native") {
  const banner = document.getElementById("installBanner");
  if (!banner) return;

  const configs = {
    native: {
      ios: false,
      title: `${APP_NAME} ইনস্টল করুন`,
      text: "এক ক্লিকে ইনস্টল করুন — দ্রুত ও অফলাইন অ্যাক্সেস",
      btn: "ইনস্টল",
      showBtn: true,
    },
    ios: {
      ios: true,
      title: "হোম স্ক্রিনে যোগ করুন",
      text: "Safari-তে শেয়ার (□↑) → Add to Home Screen",
      btn: "",
      showBtn: false,
    },
    chrome: {
      ios: false,
      title: `${APP_NAME} ইনস্টল করুন`,
      text: "ঠিকানা বারে ইনস্টল (⊕) আইকনে ক্লিক করুন",
      btn: "গাইড দেখুন",
      showBtn: true,
    },
    edge: {
      ios: false,
      title: `${APP_NAME} ইনস্টল করুন`,
      text: "ঠিকানা বারে 'অ্যাপ হিসেবে ইনস্টল করুন' ক্লিক করুন",
      btn: "গাইড দেখুন",
      showBtn: true,
    },
    safari: {
      ios: true,
      title: "অ্যাপ হিসেবে যোগ করুন",
      text: "Safari → File → Add to Dock অথবা Share → Add to Home Screen",
      btn: "",
      showBtn: false,
    },
    firefox: {
      ios: false,
      title: `${APP_NAME} ইনস্টল করুন`,
      text: "মেনু (☰) → Install অথবা Page → Install App (যদি থাকে)",
      btn: "গাইড দেখুন",
      showBtn: true,
    },
    generic: {
      ios: false,
      title: `${APP_NAME} ইনস্টল করুন`,
      text: "ব্রাউজার মেনু থেকে 'হোম স্ক্রিনে যোগ করুন' বা 'Install app' খুঁজুন",
      btn: "গাইড দেখুন",
      showBtn: true,
    },
  };

  const config = configs[mode] || configs.generic;
  banner.classList.toggle("ios-mode", config.ios);
  banner.dataset.installMode = mode;

  const title = document.getElementById("installBannerTitle");
  const text = document.getElementById("installBannerText");
  const installBtn = document.getElementById("installBtn");

  if (title) title.textContent = config.title;
  if (text) text.textContent = config.text;
  if (installBtn) {
    installBtn.textContent = config.btn || "ইনস্টল";
    installBtn.classList.toggle("d-none", !config.showBtn);
  }

  banner.classList.remove("d-none");
}

export function hideInstallBanner() {
  document.getElementById("installBanner")?.classList.add("d-none");
}

export function setSendEnabled(enabled) {
  document.getElementById("sendBtn").disabled = !enabled;
}

export function toggleRoomMenu(open) {
  document.getElementById("roomMenu")?.classList.toggle("d-none", !open);
}

export function setClearChatVisible(visible) {
  document.getElementById("clearChatBtn")?.classList.toggle("d-none", !visible);
}

export function setM2PushApproveVisible(visible) {
  document.getElementById("m2PushApproveRow")?.classList.toggle("d-none", !visible);
}

export function setM2PushApproveChecked(checked) {
  const el = document.getElementById("m2PushApproveToggle");
  if (el) el.checked = Boolean(checked);
}

export function setM2DevicePermCheckVisible(visible) {
  document.getElementById("m2DevicePermCheckBtn")?.classList.toggle("d-none", !visible);
}
