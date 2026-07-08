import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { MAX_MEMBERS_PER_ROOM, normalizeRoomCode, validateRoomCode } from "./constants.js";

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
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastActivityAt: serverTimestamp(),
  });

  return roomId;
}

export async function getRoom(roomId) {
  const snap = await getDoc(doc(db, "rooms", roomId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function listRooms() {
  const snap = await getDocs(query(collection(db, "rooms"), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    createdAt: d.data().createdAt?.toMillis?.() ?? 0,
  }));
}

export async function setRoomStatus(roomId, status) {
  await updateDoc(doc(db, "rooms", roomId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

export function isRoomFull(room) {
  return (room?.memberCount || 0) >= MAX_MEMBERS_PER_ROOM;
}
