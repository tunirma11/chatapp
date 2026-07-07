import { ROOM_ID_PATTERN } from "./constants.js";

const ADMIN_HASHES = ["#/admin", "#admin"];

function isAdminRoute(hash) {
  return ADMIN_HASHES.some((h) => hash === h || hash.startsWith(`${h}/`));
}

function extractRoomId(hash) {
  const patterns = [/^#\/room\/([a-z0-9]+)/i, /^#room\/([a-z0-9]+)/i];
  for (const pattern of patterns) {
    const match = hash.match(pattern);
    if (match && ROOM_ID_PATTERN.test(match[1])) return match[1];
  }
  return null;
}

export function parseRoute() {
  const hash = window.location.hash || "";
  if (isAdminRoute(hash)) {
    return { view: "admin" };
  }
  const roomId = extractRoomId(hash);
  if (roomId) return { view: "room", roomId };
  return { view: "home" };
}

export function getRoomIdFromHash() {
  return extractRoomId(window.location.hash || "");
}

export function navigateToRoom(roomId) {
  window.location.hash = `/room/${roomId}`;
}

export function navigateToAdmin() {
  window.location.hash = "/admin";
}

export function navigateToHome() {
  window.location.hash = "";
}

export function buildShareLink(roomId) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#/room/${roomId}`;
}

export function parseRoomIdFromInput(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) return null;

  const patterns = [/#\/room\/([a-z0-9]+)/i, /#room\/([a-z0-9]+)/i];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match && ROOM_ID_PATTERN.test(match[1])) return match[1];
  }

  if (ROOM_ID_PATTERN.test(trimmed)) return trimmed;
  return null;
}

export function onRouteChange(callback) {
  const handler = () => callback(parseRoute());
  window.addEventListener("hashchange", handler);
  handler();
}
