import { escapeHtml } from "./ui.js";
import { buildShareLink } from "./router.js";

let selectedRoomId = null;

export function getSelectedAdminRoomId() {
  return selectedRoomId;
}

export function setSelectedAdminRoomId(roomId) {
  selectedRoomId = roomId;
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
          <div class="small text-muted">${room.memberCount || 0}/২ সদস্য · ${statusBadge}</div>
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
  document.getElementById("adminRoomLink").value = buildShareLink(room.id);
  document.getElementById("adminRoomCode").textContent = room.id;
  document.getElementById("adminRoomStatusText").textContent =
    room.status === "disabled" ? "নিষ্ক্রিয়" : "সক্রিয়";

  const toggleBtn = document.getElementById("adminToggleRoomBtn");
  if (toggleBtn) {
    toggleBtn.textContent = room.status === "disabled" ? "রুম সক্রিয় করুন" : "রুম নিষ্ক্রিয় করুন";
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
          <div class="small text-muted">${escapeHtml(m.id)}</div>
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

export function setRoomGateLoading(loading) {
  document.getElementById("roomGateBtn")?.toggleAttribute("disabled", loading);
  document.getElementById("roomGateSpinner")?.classList.toggle("d-none", !loading);
}

export function showRoomGateError(message) {
  const el = document.getElementById("roomGateError");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("d-none");
}

export function hideRoomGateError() {
  document.getElementById("roomGateError")?.classList.add("d-none");
}

export function showQuickRoomHint(show) {
  document.getElementById("quickRoomHint")?.classList.toggle("d-none", !show);
}

export function setRoomGateQuickMode(enabled, username = "") {
  const passwordWrap = document.getElementById("roomPasswordWrap");
  const hint = document.getElementById("quickRoomHint");
  const passwordInput = document.getElementById("roomPasswordInput");
  const usernameInput = document.getElementById("roomGateUsername");
  const btnText = document.querySelector(".room-gate-btn-text");

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

  if (enabled && username && usernameInput) {
    usernameInput.value = username;
  }

  if (btnText) {
    btnText.textContent = enabled ? "চালিয়ে যান" : "চ্যাট শুরু করুন";
  }
}

export function setRoomMemberHint(text) {
  const el = document.getElementById("roomMemberHint");
  if (el) el.textContent = text || "";
}
