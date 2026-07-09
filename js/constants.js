export const MAX_USERS = 2;
export const MAX_MEMBERS_PER_ROOM = 2;
// সহজ কোড (ali-sara, 4829) অথবা পুরনো দীর্ঘ রুম আইডি
export const ROOM_ID_PATTERN = /^(?:[a-z][a-z0-9_-]{2,23}|[0-9]{4,8}|[a-z0-9]{12,20})$/;
export const MIN_ROOM_CODE_LENGTH = 3;
export const MAX_ROOM_CODE_LENGTH = 24;
export const MAX_MESSAGE_LENGTH = 1000;
export const MIN_USER_ID_LENGTH = 2;
export const MAX_USER_ID_LENGTH = 20;
export const APP_NAME = "Chat App";
export const CHAT_IDLE_MS = 10 * 60 * 1000;
export const ADMIN_SESSION_MS = 24 * 60 * 60 * 1000;
export const ONLINE_THRESHOLD_MS = 90 * 1000;

export function normalizeUserId(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, MAX_USER_ID_LENGTH);
}

export function validateUserId(id) {
  if (!id || id.length < MIN_USER_ID_LENGTH) {
    return "ইউজারনেম কমপক্ষে ২ অক্ষর হতে হবে";
  }
  if (!/^[a-z][a-z0-9_]*$/.test(id)) {
    return "ইউজারনেম ছোট হাতের ইংরেজি অক্ষর দিয়ে শুরু হতে হবে (a-z, 0-9, _)";
  }
  return null;
}

export function validateDisplayName(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "নাম খালি রাখা যাবে না";
  if (trimmed.length > 40) return "নাম ৪০ অক্ষরের বেশি হতে পারবে না";
  return null;
}

export function normalizeRoomCode(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, MAX_ROOM_CODE_LENGTH);
}

export function validateRoomCode(code) {
  if (!code || code.length < MIN_ROOM_CODE_LENGTH) {
    return "রুম কোড কমপক্ষে ৩ অক্ষর হতে হবে";
  }
  if (/^[0-9]{4,8}$/.test(code)) return null;
  if (/^[a-z][a-z0-9_-]*$/.test(code)) return null;
  return "রুম কোড: ali-sara বা ৪-৮ সংখ্যার PIN (যেমন 4829)";
}
