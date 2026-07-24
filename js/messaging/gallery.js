import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  limit,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "../firebase.js";
import { getCurrentUser } from "../auth.js";
import { isPrimaryMember } from "../users.js";

const GALLERY_OPEN_DEBOUNCE_MS = 30_000;
const GALLERY_VIEW_DEBOUNCE_MS = 5_000;
const GALLERY_OPENS_LIMIT = 20;
const GALLERY_VIEWS_LIMIT = 120;

/** @type {Map<string, number>} */
const lastOpenAtByRoom = new Map();
/** @type {Map<string, number>} */
const lastViewAtByKey = new Map();

function mapGalleryDoc(d) {
  const data = d.data();
  return {
    id: d.id,
    imageUrl: data.imageUrl || "",
    imageThumbUrl: data.imageThumbUrl || data.imageUrl || "",
    imageWidth: data.imageWidth || 0,
    imageHeight: data.imageHeight || 0,
    addedBy: data.addedBy || "",
    addedByUid: data.addedByUid || "",
    createdAt: data.createdAt?.toMillis?.() ?? data.clientAt ?? 0,
  };
}

function mapOpenDoc(d) {
  const data = d.data();
  return {
    id: d.id,
    openedBy: data.openedBy || "m2",
    openedAt: data.openedAt?.toMillis?.() ?? data.clientAt ?? 0,
    clientAt: data.clientAt || 0,
  };
}

function mapViewDoc(d) {
  const data = d.data();
  return {
    id: d.id,
    imageId: data.imageId || "",
    viewedBy: data.viewedBy || "m2",
    viewedAt: data.viewedAt?.toMillis?.() ?? data.clientAt ?? 0,
    clientAt: data.clientAt || 0,
  };
}

export function listenGalleryImages(roomId, onChange) {
  const q = query(
    collection(db, "rooms", roomId, "gallery"),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(
    q,
    (snap) => {
      onChange(snap.docs.map(mapGalleryDoc), null);
    },
    (err) => {
      console.warn("listenGalleryImages:", err);
      onChange([], err);
    }
  );
}

export async function addGalleryImage(roomId, imagePayload) {
  const me = getCurrentUser();
  if (!me) throw new Error("লগইন নেই");

  const { imageUrl, imageThumbUrl, width, height } = imagePayload;
  if (!imageUrl) throw new Error("ছবি পাওয়া যায়নি");

  const ref = await addDoc(collection(db, "rooms", roomId, "gallery"), {
    imageUrl,
    imageThumbUrl: imageThumbUrl || imageUrl,
    imageWidth: width || 0,
    imageHeight: height || 0,
    addedBy: me.username,
    addedByUid: me.uid,
    createdAt: serverTimestamp(),
    clientAt: Date.now(),
  });
  return ref.id;
}

export async function deleteGalleryImage(roomId, imageId) {
  await deleteDoc(doc(db, "rooms", roomId, "gallery", imageId));
}

export function canDeleteGalleryImage(image, username) {
  if (!image || !username) return false;
  if (isPrimaryMember(username)) return true;
  return image.addedBy === username;
}

/**
 * m2 only — records that the gallery was opened. Debounced per room.
 * Returns true if an event was written.
 */
export async function recordGalleryOpen(roomId) {
  const me = getCurrentUser();
  if (!me || isPrimaryMember(me.username)) return false;

  const now = Date.now();
  const last = lastOpenAtByRoom.get(roomId) || 0;
  if (now - last < GALLERY_OPEN_DEBOUNCE_MS) return false;
  lastOpenAtByRoom.set(roomId, now);

  await addDoc(collection(db, "rooms", roomId, "galleryOpens"), {
    openedBy: "m2",
    openedAt: serverTimestamp(),
    clientAt: Math.floor(now),
  });
  return true;
}

/** m1 only — realtime open events (permission-denied for m2). */
export function listenGalleryOpens(roomId, onChange) {
  const q = query(
    collection(db, "rooms", roomId, "galleryOpens"),
    orderBy("openedAt", "desc"),
    limit(GALLERY_OPENS_LIMIT)
  );
  return onSnapshot(
    q,
    (snap) => {
      onChange(snap.docs.map(mapOpenDoc), null);
    },
    (err) => {
      if (err?.code === "permission-denied") {
        onChange([], null);
        return;
      }
      console.warn("listenGalleryOpens:", err);
      onChange([], err);
    }
  );
}

/**
 * m2 only — records that a gallery image was opened (lightbox).
 * Debounced per room+image to avoid double-taps.
 */
export async function recordGalleryImageView(roomId, imageId) {
  const me = getCurrentUser();
  if (!me || isPrimaryMember(me.username)) return false;
  const id = String(imageId || "").trim();
  if (!roomId || !id) return false;

  const now = Date.now();
  const key = `${roomId}:${id}`;
  const last = lastViewAtByKey.get(key) || 0;
  if (now - last < GALLERY_VIEW_DEBOUNCE_MS) return false;
  lastViewAtByKey.set(key, now);

  await addDoc(collection(db, "rooms", roomId, "galleryViews"), {
    imageId: id,
    viewedBy: "m2",
    viewedAt: serverTimestamp(),
    clientAt: Math.floor(now),
  });
  return true;
}

/** m1 only — realtime per-image view events. */
export function listenGalleryViews(roomId, onChange) {
  const q = query(
    collection(db, "rooms", roomId, "galleryViews"),
    orderBy("viewedAt", "desc"),
    limit(GALLERY_VIEWS_LIMIT)
  );
  return onSnapshot(
    q,
    (snap) => {
      onChange(snap.docs.map(mapViewDoc), null);
    },
    (err) => {
      if (err?.code === "permission-denied") {
        onChange([], null);
        return;
      }
      console.warn("listenGalleryViews:", err);
      onChange([], err);
    }
  );
}

/** Group view events by imageId (newest first within each group). */
export function groupGalleryViewsByImage(views) {
  /** @type {Record<string, Array<{id:string,imageId:string,viewedAt:number,clientAt:number}>>} */
  const map = {};
  for (const v of views || []) {
    if (!v?.imageId) continue;
    if (!map[v.imageId]) map[v.imageId] = [];
    map[v.imageId].push(v);
  }
  return map;
}

export function resetGalleryOpenDebounce(roomId) {
  if (roomId) {
    lastOpenAtByRoom.delete(roomId);
    for (const key of [...lastViewAtByKey.keys()]) {
      if (key.startsWith(`${roomId}:`)) lastViewAtByKey.delete(key);
    }
  } else {
    lastOpenAtByRoom.clear();
    lastViewAtByKey.clear();
  }
}
