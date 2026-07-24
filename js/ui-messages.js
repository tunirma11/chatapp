import { getUserIndex } from "./users.js";
import {
  REACTION_EMOJIS,
  MESSAGE_TYPES,
  isMessageDeletedForViewer,
  getMessagePreviewText,
  getOwnMessageStatus,
  getPartnerDeleteWarning,
  getPartnerHideUsernames,
  getDeletedMessageLabel,
} from "./messaging/message-model.js";
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

const DOUBLE_TICK_SVG = `<svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor" aria-hidden="true"><path d="M10.97 1.46a.75.75 0 0 1 1.06 0l3.5 3.5a.75.75 0 0 1 0 1.06l-6.25 6.25a.75.75 0 0 1-1.06 0L.97 6.53a.75.75 0 0 1 0-1.06l1.5-1.5a.75.75 0 0 1 1.06 0l3.22 3.22 5.22-5.22z"/><path d="M5.47 1.46a.75.75 0 0 1 1.06 0l3.5 3.5a.75.75 0 0 1 0 1.06l-.22.22-1.28-1.28 2.72-2.72a.75.75 0 0 0-1.06-1.06L6.53 3.4 5.47 2.34a.75.75 0 0 1 0-1.06z" opacity="0.85"/></svg>`;

const SINGLE_TICK_SVG = `<svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor" aria-hidden="true"><path d="M10.97 1.46a.75.75 0 0 1 1.06 0l3.5 3.5a.75.75 0 0 1 0 1.06l-6.25 6.25a.75.75 0 0 1-1.06 0L.97 6.53a.75.75 0 0 1 0-1.06l1.5-1.5a.75.75 0 0 1 1.06 0l3.22 3.22 5.22-5.22z"/></svg>`;

function renderStatusIcon(localStatus, msg, partnerUsername) {
  const status = getOwnMessageStatus(msg, partnerUsername, localStatus);

  if (status === "sending" || status === "pending") {
    return `<span class="msg-status pending" title="পাঠানো হচ্ছে" aria-label="পাঠানো হচ্ছে">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/></svg>
    </span>`;
  }
  if (status === "failed") {
    return `<span class="msg-status failed" title="ব্যর্থ" aria-label="ব্যর্থ">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"/></svg>
    </span>`;
  }
  if (status === "seen") {
    return `<span class="msg-status seen" title="দেখা হয়েছে" aria-label="দেখা হয়েছে">${DOUBLE_TICK_SVG}</span>`;
  }
  if (status === "delivered") {
    return `<span class="msg-status delivered" title="পৌঁছেছে" aria-label="পৌঁছেছে">${DOUBLE_TICK_SVG}</span>`;
  }
  return `<span class="msg-status sent" title="পাঠানো হয়েছে" aria-label="পাঠানো হয়েছে">${SINGLE_TICK_SVG}</span>`;
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
  if (msg.imageStripped || (!msg.imageUrl && msg.type === MESSAGE_TYPES.IMAGE)) {
    return `<div class="msg-image-stripped"><em>ছবি মুছে ফেলা হয়েছে (স্টোরেজ সাশ্রয়)</em></div>`;
  }
  if (!msg.imageUrl) return "";
  const alt = escapeHtml(msg.text || "ছবি");
  const filename = escapeHtml(imageDownloadName(msg));
  return `<button type="button" class="msg-image-btn" data-image-url="${escapeHtml(msg.imageUrl)}" data-download-name="${filename}" aria-label="ছবি দেখুন">
    <img class="msg-image" src="${escapeHtml(msg.imageThumbUrl || msg.imageUrl)}" alt="${alt}" loading="lazy" />
  </button>`;
}

function renderReactions(msg, myUsername) {
  if (!msg?.id || isMessageDeletedForViewer(msg, myUsername)) return "";
  const reactions = msg.reactions || {};
  const entries = Object.entries(reactions).filter(([, users]) => users?.length);
  const pills = entries
    .map(([emoji, users]) => {
      const active = users.includes(myUsername) ? " active" : "";
      return `<button type="button" class="msg-reaction-pill${active}" data-msg-id="${msg.id}" data-emoji="${escapeHtml(emoji)}">${emoji}<span>${users.length}</span></button>`;
    })
    .join("");
  return `<div class="msg-reactions" data-msg-id="${msg.id}">
    ${pills}
    <button type="button" class="msg-react-add" data-msg-id="${msg.id}" title="রিঅ্যাকশন" aria-label="রিঅ্যাকশন যোগ করুন">＋</button>
  </div>`;
}

function renderPartnerDeleteWarning(msg, currentUsername) {
  const warning = getPartnerDeleteWarning(msg, currentUsername);
  if (!warning) return "";
  return `<div class="msg-delete-warning" role="status" title="${escapeHtml(warning)}">
    <strong>সতর্কতা</strong> — ${escapeHtml(warning)}
  </div>`;
}

function renderMessageBody(msg, isOwn, currentUsername) {
  if (isMessageDeletedForViewer(msg, currentUsername)) {
    return `<div class="msg-deleted"><em>${escapeHtml(getDeletedMessageLabel(msg, currentUsername))}</em></div>`;
  }

  let html = renderPartnerDeleteWarning(msg, currentUsername);
  html += renderReplyQuote(msg.replyTo);

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

let renderCache = { bodyKey: "", ackKey: "", ids: [] };
let messageHandlers = {};

export function resetMessageRenderCache() {
  renderCache = { bodyKey: "", ackKey: "", ids: [] };
  const container = document.getElementById("messages");
  if (container) delete container.dataset.eventsBound;
}

function buildAllMessages(messages, pendingLocal) {
  return [
    ...messages.map((m) => ({ ...m, status: m.status || "sent" })),
    ...pendingLocal.filter(
      (p) => !messages.some((m) => m.localId && m.localId === p.localId)
    ),
  ].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

function bodyKey(all, currentUsername, currentUid, newMessagesSince = 0) {
  const dividerIdx = getNewDividerBeforeIndex(all, newMessagesSince, currentUsername, currentUid);
  return (
    all
      .map((m) =>
        [
          m.id,
          m.status,
          m.text,
          m.type,
          m.deletedAt,
          m.hiddenFor?.[currentUsername] ? 1 : 0,
          getPartnerHideUsernames(m, currentUsername).join(","),
          m.pinned,
          JSON.stringify(m.reactions || {}),
          m.imageUrl ? 1 : 0,
        ].join(":")
      )
      .join("|") + `|nd:${dividerIdx}:${newMessagesSince || 0}`
  );
}

function ackKey(all) {
  return all
    .map((m) => `${m.id}:${JSON.stringify(m.readBy || {})}:${JSON.stringify(m.deliveredBy || {})}`)
    .join("|");
}

function getNewDividerBeforeIndex(all, baselineTs, currentUsername, currentUid) {
  if (!baselineTs) return -1;
  let hasOlder = false;
  for (let i = 0; i < all.length; i++) {
    const msg = all[i];
    const ts = msg.createdAt?.toMillis?.() ?? msg.createdAt ?? 0;
    const incoming = !isOwnMessage(msg, currentUsername, currentUid);
    if (ts <= baselineTs) {
      hasOlder = true;
      continue;
    }
    if (incoming && hasOlder) return i;
  }
  return -1;
}

function renderNewMessagesSeparator() {
  return `<div class="new-messages-separator" role="separator" aria-label="নতুন মেসেজ"><span>নতুন মেসেজ</span></div>`;
}

function buildMessagesHtml(all, startIndex, currentUsername, currentUid, partner, partnerUsername, animate, newMessagesSince, initialLastDate = "", endIndex = all.length) {
  let html = "";
  let lastDate = initialLastDate;
  const dividerIdx = getNewDividerBeforeIndex(all, newMessagesSince, currentUsername, currentUid);
  const stop = Math.min(endIndex, all.length);

  for (let index = startIndex; index < stop; index++) {
    const msg = all[index];
    if (index === dividerIdx) html += renderNewMessagesSeparator();

    const ts = msg.createdAt?.toMillis?.() ?? msg.createdAt ?? Date.now();
    const dateLabel = formatDateSeparator(ts);
    if (dateLabel && dateLabel !== lastDate) {
      html += `<div class="date-separator"><span>${dateLabel}</span></div>`;
      lastDate = dateLabel;
    }

    const isIncomingNew =
      Boolean(newMessagesSince) &&
      ts > newMessagesSince &&
      !isOwnMessage(msg, currentUsername, currentUid);

    html += buildMessageRowHtml(
      msg, index, all, currentUsername, currentUid, partner, partnerUsername, animate, isIncomingNew
    );
  }

  return { html, lastDate };
}
function buildMessageRowHtml(msg, index, all, currentUsername, currentUid, partner, partnerUsername, animate, isIncomingNew = false) {
  const ts = msg.createdAt?.toMillis?.() ?? msg.createdAt ?? Date.now();

  if (msg.type === MESSAGE_TYPES.SYSTEM || msg.localOnly) {
    const animClass = animate ? " msg-row-new" : " msg-row-stable";
    const warnClass = msg.warning || msg.kind === "limit-warning" ? " is-warning" : "";
    return `
      <div class="msg-row system${animClass}" data-msg-id="${escapeHtml(msg.id)}" data-local-only="1">
        <div class="msg-system-notice${warnClass}" role="status">
          <span class="msg-system-text">${escapeHtml(msg.text || "")}</span>
          <time class="msg-system-time">${formatTime(ts)}</time>
        </div>
      </div>`;
  }

  const isOwn = isOwnMessage(msg, currentUsername, currentUid);
  const prev = index > 0 ? all[index - 1] : null;
  const next = index < all.length - 1 ? all[index + 1] : null;
  const prevIsNotice = Boolean(prev && (prev.type === MESSAGE_TYPES.SYSTEM || prev.localOnly));
  const nextIsNotice = Boolean(next && (next.type === MESSAGE_TYPES.SYSTEM || next.localOnly));
  const prevOwn = prev && !prevIsNotice ? isOwnMessage(prev, currentUsername, currentUid) : null;
  const nextOwn = next && !nextIsNotice ? isOwnMessage(next, currentUsername, currentUid) : null;
  const isFirst = prevOwn !== isOwn;
  const isLast = nextOwn !== isOwn;
  const rowClass = isOwn ? "own" : "other";
  const groupClass = getMessageGroupClasses(isOwn, isFirst, isLast);
  const pendingClass = msg.status === "pending" || msg.status === "sending" ? "pending" : "";
  const failedClass = msg.status === "failed" ? "failed" : "";
  const pinnedClass = msg.pinned ? "msg-pinned" : "";
  const animClass = animate ? " msg-row-new" : " msg-row-stable";
  const incomingNewClass = isIncomingNew ? " msg-row-incoming-new" : "";

  const partnerAvatarHtml = partner
    ? `<div class="msg-avatar avatar avatar-sm ${getAvatarColorClass(partner.id)}" aria-hidden="true">${getInitial(partner.name)}</div>`
    : `<div class="msg-avatar msg-avatar-spacer" aria-hidden="true"></div>`;

  const statusHtml = isOwn ? renderStatusIcon(msg.status, msg, partnerUsername) : "";
  const retryBtn =
    msg.status === "failed" && msg.localId
      ? `<button class="retry-btn" data-local-id="${msg.localId}">আবার চেষ্টা</button>`
      : "";
  const avatarSlot = isOwn ? "" : isLast ? partnerAvatarHtml : `<div class="msg-avatar msg-avatar-spacer" aria-hidden="true"></div>`;

  return `
    <div class="msg-row ${rowClass} ${groupClass} ${pinnedClass}${animClass}${incomingNewClass}" data-msg-id="${msg.id}">
      ${avatarSlot}
      <div class="msg-bubble ${pendingClass} ${failedClass}" data-msg-id="${msg.id}">
        <div class="msg-body">
          ${renderMessageBody(msg, isOwn, currentUsername)}
          ${renderReactions(msg, currentUsername)}
          <div class="msg-meta">
            <span class="msg-time">${formatTime(ts)}</span>
            ${statusHtml}
            ${retryBtn}
          </div>
        </div>
      </div>
    </div>`;
}

function patchMessageAcks(all, currentUsername, currentUid, partnerUsername) {
  const container = document.getElementById("messages");
  if (!container) return;

  all.forEach((msg) => {
    if (!isOwnMessage(msg, currentUsername, currentUid)) return;
    const row = container.querySelector(`.msg-row[data-msg-id="${CSS.escape(msg.id)}"]`);
    const meta = row?.querySelector(".msg-meta");
    if (!meta) return;

    const nextHtml = renderStatusIcon(msg.status, msg, partnerUsername);
    const current = meta.querySelector(".msg-status");
    if (!nextHtml) {
      current?.remove();
      return;
    }

    const wrap = document.createElement("div");
    wrap.innerHTML = nextHtml;
    const nextEl = wrap.firstElementChild;
    if (!nextEl) return;

    if (!current) {
      meta.insertAdjacentElement("beforeend", nextEl);
      return;
    }

    if (current.outerHTML !== nextEl.outerHTML) {
      current.replaceWith(nextEl);
    }
  });
}

function ensureMessageEvents(container) {
  if (container.dataset.eventsBound) return;
  container.dataset.eventsBound = "1";

  container.addEventListener("click", (e) => {
    const retry = e.target.closest(".retry-btn");
    if (retry) {
      messageHandlers.onRetry?.(retry.dataset.localId);
      return;
    }
    const pill = e.target.closest(".msg-reaction-pill");
    if (pill) {
      messageHandlers.onReaction?.(pill.dataset.msgId, pill.dataset.emoji);
      return;
    }
    const addReact = e.target.closest(".msg-react-add");
    if (addReact) {
      const rect = addReact.getBoundingClientRect();
      messageHandlers.onReactPicker?.(
        addReact.dataset.msgId,
        rect.left + rect.width / 2,
        rect.top
      );
      return;
    }
    const imgBtn = e.target.closest(".msg-image-btn");
    if (imgBtn) {
      messageHandlers.onImageOpen?.(imgBtn.dataset.imageUrl, imgBtn.dataset.downloadName);
    }
  });

  let pressTimer = null;
  let pressTarget = null;

  const openContext = (e, bubble) => {
    const msg = messageHandlers.getMessage?.(bubble.dataset.msgId);
    if (msg && !isMessageDeletedForViewer(msg, messageHandlers.currentUsername)) {
      messageHandlers.onContextMenu?.(e, msg);
    }
  };

  container.addEventListener("contextmenu", (e) => {
    const bubble = e.target.closest(".msg-bubble");
    if (bubble) {
      e.preventDefault();
      openContext(e, bubble);
    }
  });

  container.addEventListener(
    "touchstart",
    (e) => {
      const bubble = e.target.closest(".msg-bubble");
      if (!bubble) return;
      pressTarget = bubble;
      pressTimer = setTimeout(() => openContext(e, bubble), 500);
    },
    { passive: true }
  );
  container.addEventListener("touchend", () => {
    clearTimeout(pressTimer);
    pressTarget = null;
  });
  container.addEventListener("touchmove", () => clearTimeout(pressTimer));
}

function renderEmptyState(container) {
  container.innerHTML = `
    <div class="chat-empty">
      <div class="chat-empty-icon">🌉</div>
      <h3 class="chat-empty-title">কথোপকথন শুরু করুন</h3>
      <p>প্রথম মেসেজ পাঠান — এটি শুধু আপনার সঙ্গী দেখতে পারবে</p>
    </div>`;
  resetMessageRenderCache();
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

function applyScrollPolicy(container, policy) {
  if (!policy || policy === "none" || policy === "preserve") return;
  if (policy === "force") {
    scrollToBottom(false);
    return;
  }
  if (policy === "smooth") {
    scrollToBottom(true);
    return;
  }
  const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
  const rowCount = container.querySelectorAll(".msg-row").length;
  if (nearBottom || rowCount <= 3) scrollToBottom(false);
}

export function renderMessages(messages, currentUsername, currentUid, pendingLocal = [], handlers = {}, partner = null) {
  const container = document.getElementById("messages");
  if (!container) return;
  document.getElementById("messagesSkeleton")?.remove();

  messageHandlers = handlers;
  const { partnerUsername } = handlers;
  const all = buildAllMessages(messages, pendingLocal);

  if (all.length === 0) {
    renderEmptyState(container);
    return;
  }

  const newBodyKey = bodyKey(all, currentUsername, currentUid, handlers.newMessagesSince || 0);
  const newAckKey = ackKey(all);
  const scrollPolicy = handlers.scrollPolicy || "if-near";

  ensureMessageEvents(container);

  if (renderCache.bodyKey === newBodyKey && renderCache.ids.length === all.length) {
    if (renderCache.ackKey !== newAckKey) {
      patchMessageAcks(all, currentUsername, currentUid, partnerUsername);
      renderCache.ackKey = newAckKey;
    }
    return;
  }

  const canAppend =
    renderCache.ids.length > 0 &&
    all.length > renderCache.ids.length &&
    renderCache.ids.every((id, i) => all[i]?.id === id);

  const tailCount = renderCache.ids.length;
  const canPrepend =
    renderCache.ids.length > 0 &&
    all.length > tailCount &&
    all.slice(all.length - tailCount).every((m, i) => m.id === renderCache.ids[i]);

  if (canPrepend) {
    const prependCount = all.length - tailCount;
    const chunk = buildMessagesHtml(
      all,
      0,
      currentUsername,
      currentUid,
      partner,
      partnerUsername,
      false,
      0,
      "",
      prependCount
    );

    container.insertAdjacentHTML("afterbegin", chunk.html);
    renderCache.bodyKey = newBodyKey;
    renderCache.ackKey = newAckKey;
    renderCache.ids = all.map((m) => m.id);
    applyScrollPolicy(container, scrollPolicy);
    return;
  }

  if (canAppend) {
    let lastDate = "";
    const existingDates = [...container.querySelectorAll(".date-separator span")].map((el) => el.textContent);
    if (existingDates.length) lastDate = existingDates[existingDates.length - 1];

    const chunk = buildMessagesHtml(
      all,
      renderCache.ids.length,
      currentUsername,
      currentUid,
      partner,
      partnerUsername,
      true,
      handlers.newMessagesSince || 0,
      lastDate
    );

    container.insertAdjacentHTML("beforeend", chunk.html);
    renderCache.bodyKey = newBodyKey;
    renderCache.ackKey = newAckKey;
    renderCache.ids = all.map((m) => m.id);

    applyScrollPolicy(container, scrollPolicy);
    return;
  }

  const chunk = buildMessagesHtml(
    all,
    0,
    currentUsername,
    currentUid,
    partner,
    partnerUsername,
    false,
    handlers.newMessagesSince || 0
  );

  container.innerHTML = chunk.html;
  renderCache.bodyKey = newBodyKey;
  renderCache.ackKey = newAckKey;
  renderCache.ids = all.map((m) => m.id);

  applyScrollPolicy(container, scrollPolicy);
  bindMessagesScroll();
}

export function scrollToBottom(smooth = true) {
  const el = document.getElementById("messages");
  const btn = document.getElementById("scrollBottomBtn");
  if (!el) return;

  const behavior = smooth ? "smooth" : "auto";
  const apply = () => el.scrollTo({ top: el.scrollHeight, behavior });

  apply();
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
      btn?.classList.add("d-none");
    });
  });
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

export function showReactionPicker(x, y, onSelect) {
  let picker = document.getElementById("msgReactionPicker");
  if (!picker) {
    picker = document.createElement("div");
    picker.id = "msgReactionPicker";
    picker.className = "msg-reaction-picker";
    picker.setAttribute("role", "listbox");
    document.body.appendChild(picker);
  }

  picker.innerHTML = REACTION_EMOJIS.map(
    (emoji) =>
      `<button type="button" class="msg-reaction-pick" data-emoji="${emoji}" role="option" aria-label="${emoji}">${emoji}</button>`
  ).join("");

  picker.classList.remove("d-none");
  const width = Math.min(280, window.innerWidth - 16);
  picker.style.width = `${width}px`;
  picker.style.left = `${Math.max(8, Math.min(x - width / 2, window.innerWidth - width - 8))}px`;
  picker.style.top = `${Math.max(8, Math.min(y - 56, window.innerHeight - 80))}px`;

  const close = () => {
    picker.classList.add("d-none");
    document.removeEventListener("click", close);
  };

  picker.querySelectorAll(".msg-reaction-pick").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onSelect?.(btn.dataset.emoji);
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
