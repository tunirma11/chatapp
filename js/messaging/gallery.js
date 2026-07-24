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
const GALLERY_OPENS_LIMIT = 20;

/** @type {Map<string, number>} */
const lastOpenAtByRoom = new Map();

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

export function resetGalleryOpenDebounce(roomId) {
  if (roomId) lastOpenAtByRoom.delete(roomId);
  else lastOpenAtByRoom.clear();
}
