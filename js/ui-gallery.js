import { escapeHtml, showImageLightbox } from "./ui.js";
import { formatTime } from "./ui/format.js";
import { canDeleteGalleryImage } from "./messaging/gallery.js";

let galleryOpen = false;
let galleryImages = [];
let currentUsername = "";
let handlers = null;

export function isSecretGalleryOpen() {
  return galleryOpen;
}

export function bindSecretGalleryUi(callbacks) {
  handlers = callbacks || null;

  document.getElementById("secretGalleryBackBtn")?.addEventListener("click", () => {
    handlers?.onClose?.();
  });
  document.getElementById("secretGalleryAddBtn")?.addEventListener("click", () => {
    document.getElementById("secretGalleryFileInput")?.click();
  });
  document.getElementById("secretGalleryEmptyAddBtn")?.addEventListener("click", () => {
    document.getElementById("secretGalleryFileInput")?.click();
  });
  document.getElementById("secretGalleryFileInput")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) handlers?.onAddImage?.(file);
  });
  document.getElementById("secretGalleryGrid")?.addEventListener("click", (e) => {
    const delBtn = e.target.closest("[data-gallery-delete]");
    if (delBtn) {
      e.preventDefault();
      e.stopPropagation();
      const id = delBtn.getAttribute("data-gallery-delete");
      if (id) handlers?.onDeleteImage?.(id);
      return;
    }
    const openBtn = e.target.closest("[data-gallery-open]");
    if (openBtn) {
      const url = openBtn.getAttribute("data-gallery-open");
      if (url) showImageLightbox(url, "gallery");
    }
  });
}

export function openSecretGalleryPanel() {
  const panel = document.getElementById("secretGalleryPanel");
  if (!panel) return;
  galleryOpen = true;
  panel.classList.remove("d-none");
  panel.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => panel.classList.add("is-open"));
}

export function closeSecretGalleryPanel() {
  const panel = document.getElementById("secretGalleryPanel");
  if (!panel) return;
  galleryOpen = false;
  panel.classList.remove("is-open");
  panel.setAttribute("aria-hidden", "true");
  const hide = () => {
    if (!galleryOpen) panel.classList.add("d-none");
  };
  panel.addEventListener("transitionend", hide, { once: true });
  setTimeout(hide, 320);
}

export function setSecretGalleryUploading(loading) {
  document.getElementById("secretGalleryAddBtn")?.toggleAttribute("disabled", !!loading);
  document.getElementById("secretGalleryEmptyAddBtn")?.toggleAttribute("disabled", !!loading);
  document.getElementById("secretGalleryUploadHint")?.classList.toggle("d-none", !loading);
}

export function renderSecretGalleryImages(images, username) {
  galleryImages = images || [];
  currentUsername = username || "";
  const grid = document.getElementById("secretGalleryGrid");
  const empty = document.getElementById("secretGalleryEmpty");
  if (!grid || !empty) return;

  if (!galleryImages.length) {
    grid.innerHTML = "";
    empty.classList.remove("d-none");
    return;
  }

  empty.classList.add("d-none");
  grid.innerHTML = galleryImages
    .map((img) => {
      const canDel = canDeleteGalleryImage(img, currentUsername);
      const src = escapeHtml(img.imageUrl || img.imageThumbUrl);
      const full = escapeHtml(img.imageUrl);
      const w = Number(img.imageWidth) || 0;
      const h = Number(img.imageHeight) || 0;
      const sizeAttrs = w > 0 && h > 0 ? ` width="${w}" height="${h}"` : "";
      return `
        <article class="secret-gallery-item">
          <button type="button" class="secret-gallery-thumb" data-gallery-open="${full}" aria-label="বড় করে দেখুন" title="ট্যাপ করে বড় করুন">
            <img src="${src}" alt="" loading="lazy" decoding="async"${sizeAttrs}>
            <span class="secret-gallery-expand-hint" aria-hidden="true">
              <svg width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M1.5 1a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4A1.5 1.5 0 0 1 1.5 0h4a.5.5 0 0 1 0 1zM10 .5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 16 1.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5M.5 10a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 0 14.5v-4a.5.5 0 0 1 .5-.5m15 0a.5.5 0 0 1 .5.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 .5-.5"/></svg>
              বড় করুন
            </span>
          </button>
          ${
            canDel
              ? `<button type="button" class="secret-gallery-delete" data-gallery-delete="${escapeHtml(img.id)}" aria-label="ছবি মুছুন" title="মুছুন">✕</button>`
              : ""
          }
        </article>`;
    })
    .join("");
}

export function setGalleryActivityMenuVisible(visible) {
  document.getElementById("galleryActivityBtn")?.classList.toggle("d-none", !visible);
}

export function renderGalleryActivityList(opens) {
  const list = document.getElementById("galleryActivityList");
  const empty = document.getElementById("galleryActivityEmpty");
  if (!list || !empty) return;

  if (!opens?.length) {
    list.innerHTML = "";
    empty.classList.remove("d-none");
    return;
  }

  empty.classList.add("d-none");
  list.innerHTML = opens
    .map((ev) => {
      const ts = ev.openedAt || ev.clientAt || 0;
      const when = formatGalleryActivityTime(ts);
      return `<li class="gallery-activity-item">সঙ্গী গ্যালারি খুলেছে · <time datetime="${new Date(ts).toISOString()}">${escapeHtml(when)}</time></li>`;
    })
    .join("");
}

export function showGalleryOpenBanner(openedAt) {
  const banner = document.getElementById("galleryOpenBanner");
  if (!banner) return;
  const when = formatGalleryActivityTime(openedAt || Date.now());
  banner.querySelector(".gallery-open-banner-text").textContent =
    `সঙ্গী গ্যালারি খুলেছে · ${when}`;
  banner.classList.remove("d-none");
  banner.classList.add("is-visible");
  if (banner._hideTimer) clearTimeout(banner._hideTimer);
  banner._hideTimer = setTimeout(() => hideGalleryOpenBanner(), 5000);
}

export function hideGalleryOpenBanner() {
  const banner = document.getElementById("galleryOpenBanner");
  if (!banner) return;
  banner.classList.remove("is-visible");
  setTimeout(() => {
    if (!banner.classList.contains("is-visible")) banner.classList.add("d-none");
  }, 280);
}

export function openGalleryActivitySheet() {
  const sheet = document.getElementById("galleryActivitySheet");
  if (!sheet) return;
  sheet.classList.remove("d-none");
  sheet.removeAttribute("hidden");
}

export function closeGalleryActivitySheet() {
  const sheet = document.getElementById("galleryActivitySheet");
  if (!sheet) return;
  sheet.classList.add("d-none");
  sheet.setAttribute("hidden", "");
}

function formatGalleryActivityTime(ts) {
  if (!ts) return "";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const time = date.toLocaleTimeString("bn-BD", { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === now.toDateString()) return time;
  const datePart = formatTime(ts);
  if (datePart === "গতকাল") return `গতকাল ${time}`;
  return `${date.toLocaleDateString("bn-BD", { day: "numeric", month: "short" })} ${time}`;
}
