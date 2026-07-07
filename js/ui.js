import { getUserIndex } from "./users.js";

const AVATAR_COLORS = 10;

export function getInitial(name) {
  return (name || "?").charAt(0).toUpperCase();
}

export function getAvatarColorClass(userId) {
  const idx = getUserIndex(userId);
  return `avatar-color-${idx >= 0 ? idx % AVATAR_COLORS : 0}`;
}

export function formatTime(ts) {
  if (!ts) return "";
  const date = new Date(typeof ts === "number" ? ts : ts);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const time = date.toLocaleTimeString("bn-BD", { hour: "2-digit", minute: "2-digit" });

  if (isToday) return time;
  if (isYesterday) return "গতকাল";
  return date.toLocaleDateString("bn-BD", { day: "numeric", month: "short" });
}

export function formatDateSeparator(ts) {
  if (!ts) return "";
  const date = new Date(typeof ts === "number" ? ts : ts);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return "আজ";
  if (isYesterday) return "গতকাল";
  return date.toLocaleDateString("bn-BD", { weekday: "long", day: "numeric", month: "long" });
}

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

export function showView(viewName) {
  const views = {
    home: "homeView",
    admin: "adminView",
    gate: "gateView",
    chat: "chatView",
  };
  Object.entries(views).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const active = key === viewName;
    el.classList.toggle("d-none", !active);
    if (key === "chat") {
      el.classList.toggle("view-active", active);
    }
  });
}

export function updatePartnerHeader(partner, isOnline) {
  if (!partner) return;
  document.getElementById("partnerName").textContent = partner.name;
  const statusEl = document.getElementById("partnerStatus");
  if (statusEl) {
    statusEl.textContent = isOnline ? "অনলাইন" : "অফলাইন";
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
    statusEl.classList.remove("is-online");
  }
}

export function showChatReady(partner, isOnline) {
  document.getElementById("waitingPartner")?.classList.add("d-none");
  const body = document.getElementById("chatBody");
  body?.classList.remove("d-none");
  body?.classList.add("chat-body-visible");
  updatePartnerHeader(partner, isOnline);
}

function renderStatusIcon(status) {
  if (status === "sending" || status === "pending") {
    return '<span class="msg-status pending" aria-label="পাঠানো হচ্ছে">🕐</span>';
  }
  if (status === "failed") {
    return '<span class="msg-status failed" aria-label="ব্যর্থ">!</span>';
  }
  return '<span class="msg-status sent" aria-label="পাঠানো হয়েছে">✓✓</span>';
}

export function isOwnMessage(msg, username, uid) {
  return (
    msg.senderId === username ||
    msg.senderName === username ||
    msg.senderUid === uid ||
    msg.senderId === uid
  );
}

export function renderMessages(messages, currentUsername, currentUid, pendingLocal = [], onRetry) {
  const container = document.getElementById("messages");
  document.getElementById("messagesSkeleton")?.remove();

  const all = [
    ...messages.map((m) => ({ ...m, status: m.status || "sent" })),
    ...pendingLocal.filter(
      (p) => !messages.some((m) => m.localId && m.localId === p.localId)
    ),
  ].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  if (all.length === 0) {
    container.innerHTML = `
      <div class="chat-empty">
        <div class="chat-empty-icon">💬</div>
        <p>মেসেজ পাঠিয়ে কথোপকথন শুরু করুন</p>
      </div>`;
    return;
  }

  let html = "";
  let lastDate = "";
  let animIndex = 0;

  all.forEach((msg) => {
    const ts = msg.createdAt?.toMillis?.() ?? msg.createdAt ?? Date.now();
    const dateLabel = formatDateSeparator(ts);
    if (dateLabel && dateLabel !== lastDate) {
      html += `<div class="date-separator"><span>${dateLabel}</span></div>`;
      lastDate = dateLabel;
    }

    const isOwn = isOwnMessage(msg, currentUsername, currentUid);
    const rowClass = isOwn ? "own" : "other";
    const pendingClass = msg.status === "pending" || msg.status === "sending" ? "pending" : "";
    const failedClass = msg.status === "failed" ? "failed" : "";
    const delay = Math.min(animIndex * 0.025, 0.35);
    animIndex += 1;

    const statusHtml = isOwn ? renderStatusIcon(msg.status) : "";

    const retryBtn =
      msg.status === "failed" && msg.localId
        ? `<button class="retry-btn" data-local-id="${msg.localId}">আবার চেষ্টা</button>`
        : "";

    html += `
      <div class="msg-row ${rowClass}" style="animation-delay:${delay}s">
        <div class="msg-bubble ${pendingClass} ${failedClass}">
          <span class="msg-text">${escapeHtml(msg.text)}</span>
          <div class="msg-meta">
            <span class="msg-time">${formatTime(ts)}</span>
            ${statusHtml}
            ${retryBtn}
          </div>
        </div>
      </div>`;
  });

  container.innerHTML = html;

  container.querySelectorAll(".retry-btn").forEach((btn) => {
    btn.addEventListener("click", () => onRetry?.(btn.dataset.localId));
  });

  scrollToBottom();
}

export function scrollToBottom(smooth = true) {
  const el = document.getElementById("messages");
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
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

export function showInstallBanner() {
  document.getElementById("installBanner").classList.remove("d-none");
}

export function hideInstallBanner() {
  document.getElementById("installBanner").classList.add("d-none");
}

export function setSendEnabled(enabled) {
  document.getElementById("sendBtn").disabled = !enabled;
}
