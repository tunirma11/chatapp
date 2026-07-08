import { collection, doc, getDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { sha256Hex } from "./crypto-utils.js";
import { ONLINE_THRESHOLD_MS, normalizeUserId, validateUserId } from "./constants.js";
import { getRoom } from "./rooms.js";
import { fetchMembersOnce, getMembers } from "./users.js";
import { getRoomSession, saveRoomSession, getDeviceSession } from "./store.js";
import { ensureAnonymousAuth, isUserRecentlyActive } from "./auth.js";

export async function verifyMemberPassword(roomId, username, password) {
  const room = await getRoom(roomId);
  if (!room) throw new Error("রুম পাওয়া যায়নি");
  if (room.status === "disabled") throw new Error("এই রুম নিষ্ক্রিয় করা হয়েছে");

  const memberSnap = await getDoc(doc(db, "rooms", roomId, "members", username));
  if (!memberSnap.exists()) throw new Error("সদস্য পাওয়া যায়নি");

  const member = memberSnap.data();
  let storedHash = String(member.passwordHash || "").trim();

  // পুরনো রুম: শেয়ারড রুম পাসওয়ার্ড থাকলে ফলব্যাক
  if (!storedHash) {
    storedHash = String(room.passwordHash || "").trim();
  }

  const inputHash = await sha256Hex(String(password).trim());
  if (!storedHash || inputHash !== storedHash) {
    throw new Error("ভুল পাসওয়ার্ড");
  }

  await saveRoomSession({
    roomId,
    username,
    passwordVerifiedAt: Date.now(),
  });
  return member;
}

export async function isMemberPasswordVerified(roomId, username) {
  const session = await getRoomSession();
  if (!session?.roomId || session.roomId !== roomId) return false;
  if (!session?.username || session.username !== username) return false;
  if (!session.passwordVerifiedAt) return false;
  return Date.now() - session.passwordVerifiedAt < 24 * 60 * 60 * 1000;
}

async function getOnlineUsernames(roomId) {
  const snap = await getDocs(query(collection(db, "users"), where("roomId", "==", roomId)));
  const online = new Set();
  snap.docs.forEach((d) => {
    const data = d.data();
    if (data.isOnline && isUserRecentlyActive(data.lastSeen?.toMillis?.() ?? data.lastSeen, ONLINE_THRESHOLD_MS)) {
      online.add(data.username);
    }
  });
  return online;
}

export async function resolveRoomMember(roomId, rawUsername) {
  await ensureAnonymousAuth();

  const username = normalizeUserId(rawUsername);
  const idError = validateUserId(username);
  if (idError) throw new Error(idError);

  await fetchMembersOnce(roomId);
  const member = getMembers().find((m) => m.id === username);
  if (!member) {
    throw new Error("এই ইউজারনেম এই রুমে নেই — অ্যাডমিন যোগ করেছেন কিনা দেখুন");
  }

  const deviceSession = await getDeviceSession();
  if (deviceSession?.roomId === roomId && deviceSession?.username === username) {
    return username;
  }

  const onlineUsernames = await getOnlineUsernames(roomId);
  if (onlineUsernames.has(username)) {
    throw new Error("এই ইউজারনেম ইতিমধ্যে অনলাইন — আগে লগআউট করুন বা অপেক্ষা করুন");
  }

  return username;
}

export async function getRoomMemberUsernames(roomId) {
  await fetchMembersOnce(roomId);
  return getMembers().map((m) => m.id);
}
