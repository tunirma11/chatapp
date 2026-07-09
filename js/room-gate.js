import { collection, doc, getDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "./firebase.js";
import { sha256Hex } from "./crypto-utils.js";
import { ONLINE_THRESHOLD_MS, normalizeUserId, validateUserId } from "./constants.js";
import { getRoom } from "./rooms.js";
import { fetchMembersOnce, getMembers } from "./users.js";
import { getDeviceSession } from "./store.js";
import { ensureAnonymousAuth, isUserRecentlyActive } from "./auth.js";

export async function findMemberByPassword(roomId, password) {
  const room = await getRoom(roomId);
  if (!room) throw new Error("রুম পাওয়া যায়নি");
  if (room.status === "disabled") throw new Error("এই রুম নিষ্ক্রিয় করা হয়েছে");

  await fetchMembersOnce(roomId);
  const members = getMembers();
  if (!members.length) {
    throw new Error("এই রুমে এখনো সদস্য যোগ করা হয়নি");
  }

  const inputHash = await sha256Hex(String(password).trim());
  const sharedHash = String(room.passwordHash || "").trim();

  const matches = [];
  for (const member of members) {
    let storedHash = String(member.passwordHash || "").trim();
    if (!storedHash && sharedHash) storedHash = sharedHash;
    if (storedHash && inputHash === storedHash) {
      matches.push(member);
    }
  }

  if (matches.length === 0) throw new Error("ভুল পাসওয়ার্ড");
  if (matches.length > 1) {
    throw new Error("পাসওয়ার্ড অস্পষ্ট — প্রতিটি সদস্যের আলাদা পাসওয়ার্ড রাখুন");
  }
  return matches[0];
}

export async function verifyRoomLogin(roomId, password) {
  const member = await findMemberByPassword(roomId, password);
  const username = member.id;

  await ensureAnonymousAuth();

  const deviceSession = await getDeviceSession();
  if (!(deviceSession?.roomId === roomId && deviceSession?.username === username)) {
    const onlineUsernames = await getOnlineUsernames(roomId);
    if (onlineUsernames.has(username)) {
      throw new Error("এই অ্যাকাউন্ট ইতিমধ্যে অনলাইন — আগে লগআউট করুন বা অপেক্ষা করুন");
    }
  }

  return member;
}

export async function verifyMemberPassword(roomId, username, password) {
  const room = await getRoom(roomId);
  if (!room) throw new Error("রুম পাওয়া যায়নি");
  if (room.status === "disabled") throw new Error("এই রুম নিষ্ক্রিয় করা হয়েছে");

  const memberSnap = await getDoc(doc(db, "rooms", roomId, "members", username));
  if (!memberSnap.exists()) throw new Error("সদস্য পাওয়া যায়নি");

  const member = memberSnap.data();
  let storedHash = String(member.passwordHash || "").trim();

  if (!storedHash) {
    storedHash = String(room.passwordHash || "").trim();
  }

  const inputHash = await sha256Hex(String(password).trim());
  if (!storedHash || inputHash !== storedHash) {
    throw new Error("ভুল পাসওয়ার্ড");
  }

  return member;
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
    throw new Error("এই সদস্য এই রুমে নেই");
  }

  const deviceSession = await getDeviceSession();
  if (deviceSession?.roomId === roomId && deviceSession?.username === username) {
    return username;
  }

  const onlineUsernames = await getOnlineUsernames(roomId);
  if (onlineUsernames.has(username)) {
    throw new Error("এই অ্যাকাউন্ট ইতিমধ্যে অনলাইন — আগে লগআউট করুন বা অপেক্ষা করুন");
  }

  return username;
}
