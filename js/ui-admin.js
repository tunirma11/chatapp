import { escapeHtml } from "./ui.js";
import { DEFAULT_PUSH_NOTIFY_TEXT } from "./push-config.js";

let selectedRoomId = null;

export function getSelectedAdminRoomId() {
  return selectedRoomId;
}

export function setSelectedAdminRoomId(roomId) {
  selectedRoomId = roomId;
}

export function showAdminLogin(show) {
  document.getElementById("adminLoginSection")?.classList.toggle("d-none", !show);
  document.getElementById("adminPanelSection")?.classList.toggle("d-none", show);
}

export function renderAdminRoomList(rooms, onSelect) {
  const container = document.getElementById("adminRoomList");
  if (!container) return;

  if (!rooms.length) {
    container.innerHTML = `<p class="text-muted small mb-0">এখনো কোনো রুম নেই — নিচে নতুন রুম তৈরি করুন।</p>`;
    return;
  }

  container.innerHTML = rooms
    .map((room) => {
      const statusBadge =
        room.status === "disabled"
          ? '<span class="badge text-bg-secondary">নিষ্ক্রিয়</span>'
          : '<span class="badge text-bg-success">সক্রিয়</span>';
      return `
        <button type="button" class="admin-room-item" data-room-id="${escapeHtml(room.id)}">
          <div class="fw-semibold">${escapeHtml(room.label || room.id)}</div>
          <div class="small text-muted">${escapeHtml(room.id)} · ${room.memberCount || 0}/২ সদস্য · ${statusBadge}${
            room.gallerySecretCode
              ? ' · <span class="badge text-bg-info">গ্যালারি</span>'
              : ""
          }</div>
        </button>`;
    })
    .join("");

  container.querySelectorAll(".admin-room-item").forEach((btn) => {
    btn.addEventListener("click", () => onSelect?.(btn.dataset.roomId));
  });
}

export function renderAdminRoomDetail(room, members) {
  const panel = document.getElementById("adminRoomDetail");
  if (!panel || !room) return;

  panel.classList.remove("d-none");
  document.getElementById("adminRoomTitle").textContent = room.label || room.id;
  document.getElementById("adminRoomCode").textContent = room.id;
  document.getElementById("adminRoomStatusText").textContent =
    room.status === "disabled" ? "নিষ্ক্রিয়" : "সক্রিয়";

  const toggleBtn = document.getElementById("adminToggleRoomBtn");
  if (toggleBtn) {
    toggleBtn.textContent = room.status === "disabled" ? "রুম সক্রিয় করুন" : "রুম নিষ্ক্রিয় করুন";
  }

  const pushEnabled = document.getElementById("adminPushNotifyEnabled");
  if (pushEnabled) pushEnabled.checked = room.pushNotifyM1 === true;

  const pushText = document.getElementById("adminPushNotifyText");
  if (pushText) {
    pushText.value = String(room.pushNotifyText || DEFAULT_PUSH_NOTIFY_TEXT);
  }

  const galleryCode = document.getElementById("adminGallerySecretCode");
  if (galleryCode) {
    galleryCode.value = String(room.gallerySecretCode || "");
  }

  const list = document.getElementById("adminMemberList");
  if (!list) return;

  if (!members.length) {
    list.innerHTML = `<p class="text-muted small mb-0">কোনো সদস্য নেই — নিচে যোগ করুন।</p>`;
    return;
  }

  list.innerHTML = members
    .map(
      (m) => `
      <div class="admin-member-row">
        <div class="admin-member-info">
          <div class="fw-semibold">${escapeHtml(m.name)}</div>
        </div>
        <div class="admin-member-actions">
          <form class="admin-member-password-form" data-username="${escapeHtml(m.id)}">
            <div class="input-group input-group-sm">
              <input type="password" class="form-control" placeholder="নতুন পাসওয়ার্ড" required aria-label="নতুন পাসওয়ার্ড">
              <button type="submit" class="btn btn-outline-primary">আপডেট</button>
            </div>
          </form>
          <button type="button" class="btn btn-sm btn-outline-danger admin-delete-member" data-username="${escapeHtml(m.id)}">মুছুন</button>
        </div>
      </div>`
    )
    .join("");
}

export function hideAdminRoomDetail() {
  document.getElementById("adminRoomDetail")?.classList.add("d-none");
  selectedRoomId = null;
}

export function setAdminLoading(loading) {
  document.getElementById("adminLoginBtn")?.toggleAttribute("disabled", loading);
  document.getElementById("adminLoginSpinner")?.classList.toggle("d-none", !loading);
}

export function setAdminCreateLoading(loading) {
  document.getElementById("adminCreateRoomBtn")?.toggleAttribute("disabled", loading);
}

export function setChatLoginLoading(loading) {
  document.getElementById("chatLoginBtn")?.toggleAttribute("disabled", loading);
  document.getElementById("chatLoginSpinner")?.classList.toggle("d-none", !loading);
}

export function showChatLoginError(message) {
  const el = document.getElementById("chatLoginError");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("d-none");
}

export function hideChatLoginError() {
  document.getElementById("chatLoginError")?.classList.add("d-none");
}

export function showQuickChatHint(show) {
  document.getElementById("quickChatHint")?.classList.toggle("d-none", !show);
}

export function setChatLoginQuickMode(enabled, roomId = "") {
  const passwordWrap = document.getElementById("chatPasswordWrap");
  const hint = document.getElementById("quickChatHint");
  const passwordInput = document.getElementById("chatPasswordInput");
  const roomInput = document.getElementById("chatRoomInput");
  const btnText = document.querySelector(".chat-login-btn-text");

  passwordWrap?.classList.toggle("d-none", enabled);
  hint?.classList.toggle("d-none", !enabled);

  if (passwordInput) {
    if (enabled) {
      passwordInput.removeAttribute("required");
      passwordInput.value = "";
    } else {
      passwordInput.setAttribute("required", "");
    }
  }

  if (enabled && roomId && roomInput) {
    roomInput.value = roomId;
  }

  if (btnText) {
    btnText.textContent = enabled ? "চালিয়ে যান" : "প্রবেশ করুন";
  }
}
