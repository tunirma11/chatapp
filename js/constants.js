export const MAX_USERS = 2;
export const MAX_MEMBERS_PER_ROOM = 2;
// সহজ কোড (ali-sara, 4829) অথবা পুরনো দীর্ঘ রুম আইডি
export const ROOM_ID_PATTERN = /^(?:[a-z][a-z0-9_-]{2,23}|[0-9]{4,8}|[a-z0-9]{12,20})$/;
export const MIN_ROOM_CODE_LENGTH = 3;
export const MAX_ROOM_CODE_LENGTH = 24;
export const MAX_MESSAGE_LENGTH = 1000;
export const MIN_USER_ID_LENGTH = 2;
export const MAX_USER_ID_LENGTH = 20;
export const APP_NAME = "GitBridge";
export const CHAT_IDLE_MS = 5 * 60 * 1000;
export const ADMIN_SESSION_MS = 24 * 60 * 60 * 1000;
export const ONLINE_THRESHOLD_MS = 90 * 1000;
export const TYPING_TIMEOUT_MS = 3000;
export const TYPING_STALE_MS = 30000;
export const TYPING_DEBOUNCE_MS = 500;
export const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;
export const ACK_DEBOUNCE_MS = 2500;
export const MESSAGES_PAGE_SIZE = 80;
export const RETENTION_DAYS_DEFAULT = 30;
export const IMAGE_STRIP_DAYS_DEFAULT = 7;
export const MAINTENANCE_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const PURGE_BATCH_SIZE = 200;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** চ্যাটে পাঠানোর আগে সর্বোচ্চ পাশ — ছোট রাখলে আরও ছবি পাঠানো যায় */
export const MAX_IMAGE_DIMENSION = 720;
/** কম্প্রেসড WebP আউটপুট ~২০–৩০ KB */
export const MAX_IMAGE_OUTPUT_BYTES = 30 * 1024;
/** ~৩০ KB blob → base64 data URL (~৪০ KB) */
export const MAX_IMAGE_DATA_URL_LENGTH = 42000;
export const MESSAGE_DELETE_WINDOW_MS = 15 * 60 * 1000;

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
