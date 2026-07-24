import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { MAX_MEMBERS_PER_ROOM, normalizeRoomCode, validateRoomCode } from "./constants.js";
import { DEFAULT_PUSH_NOTIFY_TEXT } from "./push-config.js";

function mapRoomDoc(d) {
  return {
    id: d.id,
    ...d.data(),
    createdAt: d.data().createdAt?.toMillis?.() ?? 0,
  };
}

export async function createRoom(label, rawRoomCode) {
  const roomId = normalizeRoomCode(rawRoomCode);
  const codeError = validateRoomCode(roomId);
  if (codeError) throw new Error(codeError);

  const existing = await getDoc(doc(db, "rooms", roomId));
  if (existing.exists()) {
    throw new Error("এই রুম কোড ইতিমধ্যে আছে — অন্য কোড ব্যবহার করুন");
  }

  await setDoc(doc(db, "rooms", roomId), {
    label: String(label || "").trim() || roomId,
    code: roomId,
    memberCount: 0,
    maxMembers: MAX_MEMBERS_PER_ROOM,
    status: "active",
    pushNotifyM1: false,
    pushNotifyText: DEFAULT_PUSH_NOTIFY_TEXT,
    gallerySecretCode: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastActivityAt: serverTimestamp(),
  });

  return roomId;
}

const MAX_GALLERY_SECRET_LEN = 64;

export async function setRoomGallerySecret(roomId, code) {
  const trimmed = String(code ?? "").trim().slice(0, MAX_GALLERY_SECRET_LEN);
  await updateDoc(doc(db, "rooms", roomId), {
    gallerySecretCode: trimmed,
    updatedAt: serverTimestamp(),
  });
  return trimmed;
}

export async function getRoom(roomId) {
  const snap = await getDoc(doc(db, "rooms", roomId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function listRooms() {
  try {
    const snap = await getDocs(query(collection(db, "rooms"), orderBy("createdAt", "desc")));
    return snap.docs.map(mapRoomDoc);
  } catch (err) {
    if (err?.code !== "failed-precondition") throw err;
    const snap = await getDocs(collection(db, "rooms"));
    return snap.docs.map(mapRoomDoc).sort((a, b) => b.createdAt - a.createdAt);
  }
}

export async function setRoomStatus(roomId, status) {
  await updateDoc(doc(db, "rooms", roomId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

export async function setRoomPushNotify(roomId, { enabled, text }) {
  const payload = {
    updatedAt: serverTimestamp(),
  };
  if (typeof enabled === "boolean") payload.pushNotifyM1 = enabled;
  if (typeof text === "string") {
    const trimmed = text
      .replace(/https?:\/\/\S+/gi, "")
      .trim()
      .slice(0, 200);
    payload.pushNotifyText = trimmed || DEFAULT_PUSH_NOTIFY_TEXT;
  }
  await updateDoc(doc(db, "rooms", roomId), payload);
}

async function deleteCollectionDocs(colRef, { pageSize = 400 } = {}) {
  let deleted = 0;
  for (;;) {
    const snap = await getDocs(query(colRef, limit(pageSize)));
    if (snap.empty) break;
    let batch = writeBatch(db);
    let ops = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref);
      ops += 1;
      deleted += 1;
      if (ops >= 450) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();
    if (snap.size < pageSize) break;
  }
  return deleted;
}

/**
 * Delete room and all nested data: members, messages, gallery, galleryOpens,
 * galleryViews, presence, meta, plus users/{uid} profiles for this room.
 */
export async function deleteRoom(roomId) {
  const roomRef = doc(db, "rooms", roomId);
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) throw new Error("রুম পাওয়া যায়নি");

  const wipe = async (label, fn) => {
    try {
      return await fn();
    } catch (err) {
      if (err?.code === "permission-denied") {
        throw new Error(
          `${label} মুছতে অনুমতি নেই — Firebase Console-এ firestore.rules Publish করুন`
        );
      }
      throw err;
    }
  };

  await wipe("মেসেজ", () =>
    deleteCollectionDocs(collection(db, "rooms", roomId, "messages"))
  );
  await wipe("গ্যালারি", () =>
    deleteCollectionDocs(collection(db, "rooms", roomId, "gallery"))
  );
  await wipe("গ্যালারি ওপেন লগ", () =>
    deleteCollectionDocs(collection(db, "rooms", roomId, "galleryOpens"))
  );
  await wipe("গ্যালারি ভিউ লগ", () =>
    deleteCollectionDocs(collection(db, "rooms", roomId, "galleryViews"))
  );
  await wipe("সদস্য", () =>
    deleteCollectionDocs(collection(db, "rooms", roomId, "members"))
  );
  await wipe("presence", () =>
    deleteCollectionDocs(collection(db, "rooms", roomId, "presence"))
  );
  await wipe("meta", () =>
    deleteCollectionDocs(collection(db, "rooms", roomId, "meta"))
  );

  await wipe("ইউজার প্রোফাইল", async () => {
    const usersSnap = await getDocs(
      query(collection(db, "users"), where("roomId", "==", roomId))
    );
    if (usersSnap.empty) return 0;
    let batch = writeBatch(db);
    let ops = 0;
    let deleted = 0;
    for (const u of usersSnap.docs) {
      batch.delete(u.ref);
      ops += 1;
      deleted += 1;
      if (ops >= 450) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();
    return deleted;
  });

  await wipe("রুম", () => deleteDoc(roomRef));
}

export function isRoomFull(room) {
  return (room?.memberCount || 0) >= MAX_MEMBERS_PER_ROOM;
}
