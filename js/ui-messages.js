import { getUserIndex } from "./users.js";
import { REACTION_EMOJIS, MESSAGE_TYPES, isMessageDeleted, isMessageReadBy, getMessagePreviewText } from "./messaging/message-model.js";
import { linkifyText } from "./messaging/links.js";
import { formatTime, formatDateSeparator } from "./ui/format.js";

const AVATAR_COLORS = 10;

export function getInitial(name) {
  return (name || "?").charAt(0).toUpperCase();
}

export function getAvatarColorClass(userId) {
  const idx = getUserIndex(userId);
  return `avatar-color-${idx >= 0 ? idx % AVATAR_COLORS : 0}`;
}

export function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderStatusIcon(status, msg, myUsername, partnerUsername) {
  if (status === "sending" || status === "pending") {
    return `<span class="msg-status pending" aria-label="পাঠানো হচ্ছে">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/></svg>
    </span>`;
  }
  if (status === "failed") {
    return `<span class="msg-status failed" aria-label="ব্যর্থ">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"/></svg>
    </span>`;
  }

  const read = partnerUsername && isMessageReadBy(msg, partnerUsername);
  if (read) {
    return `<span class="msg-status read" aria-label="পড়া হয়েছে">
      <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor"><path d="M10.97 1.46a.75.75 0 0 1 1.06 0l3.5 3.5a.75.75 0 0 1 0 1.06l-6.25 6.25a.75.75 0 0 1-1.06 0L.97 6.53a.75.75 0 0 1 0-1.06l1.5-1.5a.75.75 0 0 1 1.06 0l3.22 3.22 5.22-5.22z"/><path d="M5.47 1.46a.75.75 0 0 1 1.06 0l3.5 3.5a.75.75 0 0 1 0 1.06l-.22.22-1.28-1.28 2.72-2.72a.75.75 0 0 0-1.06-1.06L6.53 3.4 5.47 2.34a.75.75 0 0 1 0-1.06z" opacity="0.85"/></svg>
    </span>`;
  }

  return `<span class="msg-status sent" aria-label="পাঠানো হয়েছে">
    <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor"><path d="M10.97 1.46a.75.75 0 0 1 1.06 0l3.5 3.5a.75.75 0 0 1 0 1.06l-6.25 6.25a.75.75 0 0 1-1.06 0L.97 6.53a.75.75 0 0 1 0-1.06l1.5-1.5a.75.75 0 0 1 1.06 0l3.22 3.22 5.22-5.22z"/></svg>
  </span>`;
}

function getMessageGroupClasses(isOwn, isFirst, isLast) {
  const classes = [];
  if (isFirst) classes.push("msg-first");
  if (!isFirst && !isLast) classes.push("msg-middle");
  if (!isFirst && isLast) classes.push("msg-last");
  if (!isFirst) classes.push("msg-grouped");
  return classes.join(" ");
}

function renderReplyQuote(replyTo) {
  if (!replyTo) return "";
  const preview = escapeHtml(replyTo.text || getMessagePreviewText(replyTo));
  const name = escapeHtml(replyTo.senderName || "");
  return `<div class="msg-reply-quote"><span class="msg-reply-name">${name}</span><span class="msg-reply-text">${preview}</span></div>`;
}

function renderLinkPreview(msg) {
  const preview = msg.linkPreview;
  const url = msg.linkUrl || preview?.url;
  if (!url) return "";
  const title = escapeHtml(preview?.title || url);
  const domain = escapeHtml(preview?.domain || "");
  return `
    <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="msg-link-card">
      <div class="msg-link-card-body">
        <div class="msg-link-card-title">${title}</div>
        ${domain ? `<div class="msg-link-card-domain">${domain}</div>` : ""}
      </div>
    </a>`;
}

function imageDownloadName(msg) {
  const ts = msg.createdAt || Date.now();
  const sender = String(msg.senderName || msg.senderId || "image")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 24) || "image";
  const date = new Date(typeof ts === "number" ? ts : ts).toISOString().slice(0, 10);
  return `gitbridge-${sender}-${date}.webp`;
}

export function downloadImage(url, filename) {
  if (!url) return;
  const name = filename || `gitbridge-${Date.now()}.webp`;
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function renderImageContent(msg) {
  if (!msg.imageUrl) return "";
  const alt = escapeHtml(msg.text || "ছবি");
  const filename = escapeHtml(imageDownloadName(msg));
  return `<button type="button" class="msg-image-btn" data-image-url="${escapeHtml(msg.imageUrl)}" data-download-name="${filename}" aria-label="ছবি দেখুন">
    <img class="msg-image" src="${escapeHtml(msg.imageThumbUrl || msg.imageUrl)}" alt="${alt}" loading="lazy" />
  </button>`;
}

function renderReactions(msg, myUsername) {
  const reactions = msg.reactions || {};
  const entries = Object.entries(reactions).filter(([, users]) => users?.length);
  if (!entries.length) return "";
  const pills = entries
    .map(([emoji, users]) => {
      const active = users.includes(myUsername) ? " active" : "";
      return `<button type="button" class="msg-reaction-pill${active}" data-msg-id="${msg.id}" data-emoji="${emoji}">${emoji}<span>${users.length}</span></button>`;
    })
    .join("");
  return `<div class="msg-reactions">${pills}</div>`;
}

function renderMessageBody(msg, isOwn) {
  if (isMessageDeleted(msg)) {
    return `<div class="msg-deleted"><em>মেসেজ মুছে ফেলা হয়েছে</em></div>`;
  }

  let html = renderReplyQuote(msg.replyTo);

  if (msg.type === MESSAGE_TYPES.IMAGE) {
    html += renderImageContent(msg);
    if (msg.text?.trim()) {
      html += `<span class="msg-text">${linkifyText(msg.text, escapeHtml)}</span>`;
    }
  } else {
    html += `<span class="msg-text">${linkifyText(msg.text, escapeHtml)}</span>`;
    if (msg.linkUrl || msg.linkPreview) {
      html += renderLinkPreview(msg);
    }
  }

  return html;
}

let scrollListenerBound = false;

export function bindMessagesScroll() {
  if (scrollListenerBound) return;
  const el = document.getElementById("messages");
  const btn = document.getElementById("scrollBottomBtn");
  if (!el || !btn) return;

  scrollListenerBound = true;
  el.addEventListener("scroll", () => {
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    btn.classList.toggle("d-none", nearBottom);
  });
  btn.addEventListener("click", () => scrollToBottom(true));
}

export function isOwnMessage(msg, username, uid) {
  return (
    msg.senderId === username ||
    msg.senderName === username ||
    msg.senderUid === uid ||
    msg.senderId === uid
  );
}

export function renderPinnedBar(pinnedMessage, onUnpin) {
  const bar = document.getElementById("pinnedBar");
  if (!bar) return;
  if (!pinnedMessage) {
    bar.classList.add("d-none");
    bar.innerHTML = "";
    return;
  }

  bar.classList.remove("d-none");
  bar.innerHTML = `
    <div class="pinned-bar-inner">
      <span class="pinned-bar-icon" aria-hidden="true">📌</span>
      <div class="pinned-bar-text text-truncate">${escapeHtml(getMessagePreviewText(pinnedMessage))}</div>
      <button type="button" class="pinned-bar-close" id="unpinBtn" aria-label="আনপিন">✕</button>
    </div>`;
  document.getElementById("unpinBtn")?.addEventListener("click", () => onUnpin?.(pinnedMessage.id));
}

export function renderMessages(messages, currentUsername, currentUid, pendingLocal = [], handlers = {}, partner = null) {
  const container = document.getElementById("messages");
  document.getElementById("messagesSkeleton")?.remove();

  const { onRetry, onContextMenu, onReaction, onImageOpen, partnerUsername } = handlers;

  const all = [
    ...messages.map((m) => ({ ...m, status: m.status || "sent" })),
    ...pendingLocal.filter(
      (p) => !messages.some((m) => m.localId && m.localId === p.localId)
    ),
  ].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  if (all.length === 0) {
    container.innerHTML = `
      <div class="chat-empty">
        <div class="chat-empty-icon">🌉</div>
        <h3 class="chat-empty-title">কথোপকথন শুরু করুন</h3>
        <p>প্রথম মেসেজ পাঠান — এটি শুধু আপনার সঙ্গী দেখতে পারবে</p>
      </div>`;
    return;
  }

  let html = "";
  let lastDate = "";
  let animIndex = 0;

  const partnerAvatarHtml = partner
    ? `<div class="msg-avatar avatar avatar-sm ${getAvatarColorClass(partner.id)}" aria-hidden="true">${getInitial(partner.name)}</div>`
    : `<div class="msg-avatar msg-avatar-spacer" aria-hidden="true"></div>`;

  all.forEach((msg, index) => {
    const ts = msg.createdAt?.toMillis?.() ?? msg.createdAt ?? Date.now();
    const dateLabel = formatDateSeparator(ts);
    if (dateLabel && dateLabel !== lastDate) {
      html += `<div class="date-separator"><span>${dateLabel}</span></div>`;
      lastDate = dateLabel;
    }

    const isOwn = isOwnMessage(msg, currentUsername, currentUid);
    const prevOwn = index > 0 ? isOwnMessage(all[index - 1], currentUsername, currentUid) : null;
    const nextOwn = index < all.length - 1 ? isOwnMessage(all[index + 1], currentUsername, currentUid) : null;
    const isFirst = prevOwn !== isOwn;
    const isLast = nextOwn !== isOwn;
    const rowClass = isOwn ? "own" : "other";
    const groupClass = getMessageGroupClasses(isOwn, isFirst, isLast);
    const pendingClass = msg.status === "pending" || msg.status === "sending" ? "pending" : "";
    const failedClass = msg.status === "failed" ? "failed" : "";
    const pinnedClass = msg.pinned ? "msg-pinned" : "";
    const delay = Math.min(animIndex * 0.02, 0.3);
    animIndex += 1;

    const statusHtml = isOwn ? renderStatusIcon(msg.status, msg, currentUsername, partnerUsername) : "";
    const retryBtn =
      msg.status === "failed" && msg.localId
        ? `<button class="retry-btn" data-local-id="${msg.localId}">আবার চেষ্টা</button>`
        : "";

    const avatarSlot = isOwn ? "" : isLast ? partnerAvatarHtml : `<div class="msg-avatar msg-avatar-spacer" aria-hidden="true"></div>`;

    html += `
      <div class="msg-row ${rowClass} ${groupClass} ${pinnedClass}" data-msg-id="${msg.id}" style="animation-delay:${delay}s">
        ${avatarSlot}
        <div class="msg-bubble ${pendingClass} ${failedClass}" data-msg-id="${msg.id}">
          <div class="msg-body">
            ${renderMessageBody(msg, isOwn)}
            ${renderReactions(msg, currentUsername)}
            <div class="msg-meta">
              <span class="msg-time">${formatTime(ts)}</span>
              ${statusHtml}
              ${retryBtn}
            </div>
          </div>
        </div>
      </div>`;
  });

  const wasNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
  container.innerHTML = html;

  container.querySelectorAll(".retry-btn").forEach((btn) => {
    btn.addEventListener("click", () => onRetry?.(btn.dataset.localId));
  });

  container.querySelectorAll(".msg-bubble").forEach((bubble) => {
    const msgId = bubble.dataset.msgId;
    const msg = all.find((m) => m.id === msgId);
    if (!msg || isMessageDeleted(msg)) return;

    bubble.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      onContextMenu?.(e, msg);
    });

    let pressTimer;
    bubble.addEventListener("touchstart", (e) => {
      pressTimer = setTimeout(() => onContextMenu?.(e, msg), 500);
    }, { passive: true });
    bubble.addEventListener("touchend", () => clearTimeout(pressTimer));
    bubble.addEventListener("touchmove", () => clearTimeout(pressTimer));
  });

  container.querySelectorAll(".msg-reaction-pill").forEach((btn) => {
    btn.addEventListener("click", () => onReaction?.(btn.dataset.msgId, btn.dataset.emoji));
  });

  container.querySelectorAll(".msg-image-btn").forEach((btn) => {
    btn.addEventListener("click", () =>
      onImageOpen?.(btn.dataset.imageUrl, btn.dataset.downloadName)
    );
  });

  if (wasNearBottom || animIndex <= 3) scrollToBottom();
  bindMessagesScroll();
}

export function scrollToBottom(smooth = true) {
  const el = document.getElementById("messages");
  const btn = document.getElementById("scrollBottomBtn");
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  btn?.classList.add("d-none");
}

export function showMessageContextMenu(x, y, items, onSelect) {
  let menu = document.getElementById("msgContextMenu");
  if (!menu) {
    menu = document.createElement("div");
    menu.id = "msgContextMenu";
    menu.className = "msg-context-menu";
    menu.setAttribute("role", "menu");
    document.body.appendChild(menu);
  }

  menu.innerHTML = items
    .map(
      (item) =>
        `<button type="button" class="msg-context-item${item.danger ? " danger" : ""}" data-action="${item.action}" role="menuitem">${item.label}</button>`
    )
    .join("");

  menu.classList.remove("d-none");
  menu.style.left = `${Math.min(x, window.innerWidth - 200)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - 160)}px`;

  const close = () => {
    menu.classList.add("d-none");
    document.removeEventListener("click", close);
  };

  menu.querySelectorAll(".msg-context-item").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onSelect?.(btn.dataset.action);
      close();
    });
  });

  setTimeout(() => document.addEventListener("click", close), 0);
}

export function showReplyPreview(replyTo, onCancel) {
  const bar = document.getElementById("replyPreviewBar");
  if (!bar) return;
  if (!replyTo) {
    bar.classList.add("d-none");
    bar.innerHTML = "";
    return;
  }

  bar.classList.remove("d-none");
  bar.innerHTML = `
    <div class="reply-preview-inner">
      <div class="reply-preview-body">
        <span class="reply-preview-label">উত্তর দিচ্ছেন</span>
        <span class="reply-preview-text text-truncate">${escapeHtml(getMessagePreviewText(replyTo))}</span>
      </div>
      <button type="button" class="reply-preview-close" id="cancelReplyBtn" aria-label="বাতিল">✕</button>
    </div>`;
  document.getElementById("cancelReplyBtn")?.addEventListener("click", () => onCancel?.());
}

export function showSearchOverlay(results, queryText, onQuery, onSelect, onClose) {
  let overlay = document.getElementById("searchOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "searchOverlay";
    overlay.className = "search-overlay";
    document.body.appendChild(overlay);
  }

  const listHtml = results.length
    ? results
        .map(
          (m) => `
        <button type="button" class="search-result-item" data-msg-id="${m.id}">
          <span class="search-result-name">${escapeHtml(m.senderName || "")}</span>
          <span class="search-result-text text-truncate">${escapeHtml(getMessagePreviewText(m))}</span>
        </button>`
        )
        .join("")
    : `<div class="search-empty">${queryText ? "কিছু পাওয়া যায়নি" : "খুঁজুন…"}</div>`;

  overlay.innerHTML = `
    <div class="search-panel">
      <div class="search-header">
        <input type="search" class="search-input" id="searchInput" placeholder="মেসেজ খুঁজুন…" value="${escapeHtml(queryText || "")}" autocomplete="off" />
        <button type="button" class="search-close" id="searchCloseBtn" aria-label="বন্ধ">✕</button>
      </div>
      <div class="search-results">${listHtml}</div>
    </div>`;

  overlay.classList.remove("d-none");
  const input = document.getElementById("searchInput");
  input?.focus();
  input?.select();

  input?.addEventListener("input", (e) => onQuery?.(e.target.value));
  document.getElementById("searchCloseBtn")?.addEventListener("click", () => {
    overlay.classList.add("d-none");
    onClose?.();
  });
  overlay.querySelectorAll(".search-result-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      onSelect?.(btn.dataset.msgId);
      overlay.classList.add("d-none");
      onClose?.();
    });
  });
}

export function showImageLightbox(url, filename) {
  let box = document.getElementById("imageLightbox");
  if (!box) {
    box = document.createElement("div");
    box.id = "imageLightbox";
    box.className = "image-lightbox";
    document.body.appendChild(box);
  }

  const name = filename || `gitbridge-${Date.now()}.webp`;

  box.innerHTML = `
    <div class="image-lightbox-actions">
      <button type="button" class="image-lightbox-download" aria-label="ছবি ডাউনলোড">
        <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg>
        ডাউনলোড
      </button>
      <button type="button" class="image-lightbox-close" aria-label="বন্ধ">✕</button>
    </div>
    <img src="${escapeHtml(url)}" alt="ছবি" />`;
  box.classList.remove("d-none");

  const close = () => box.classList.add("d-none");
  box.querySelector(".image-lightbox-close")?.addEventListener("click", close);
  box.querySelector(".image-lightbox-download")?.addEventListener("click", (e) => {
    e.stopPropagation();
    downloadImage(url, name);
  });
  box.addEventListener("click", (e) => {
    if (e.target === box || e.target.tagName === "IMG") close();
  });
}

export function setUploadProgress(visible, percent = 0) {
  const bar = document.getElementById("uploadProgressBar");
  if (!bar) return;
  bar.classList.toggle("d-none", !visible);
  const fill = bar.querySelector(".upload-progress-fill");
  if (fill) fill.style.width = `${Math.round(percent * 100)}%`;
}

export function pulseSendButton() {
  document.getElementById("sendBtn")?.classList.add("composer-send-pulse");
  setTimeout(() => document.getElementById("sendBtn")?.classList.remove("composer-send-pulse"), 400);
}
