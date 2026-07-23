/**
 * GitBridge Web Push sender (Cloudflare Worker).
 * POST /notify JSON: { roomId, target: "m1" | "m2" }
 *   m1 — rooms.pushNotifyM1 == true; sender must not be m1
 *   m2 — members/m2.pushNotifyEnabled; sender must be m1; no admin gate
 */

import webpush from "web-push";
import * as jose from "jose";

const DEFAULT_TEXT = "Today is rainy day";

const JWKS = jose.createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
  )
);

function corsHeaders(origin = "*") {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function json(status, body, origin = "*") {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

async function verifyFirebaseToken(idToken, projectId) {
  const { payload } = await jose.jwtVerify(idToken, JWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });
  if (!payload.user_id && !payload.sub) throw new Error("invalid token");
  return String(payload.user_id || payload.sub);
}

async function firestoreGet(projectId, path, idToken) {
  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
  const headers = {};
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  const res = await fetch(url, { headers });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`firestore ${res.status}: ${text.slice(0, 200)}`);
  }
  return await res.json();
}

function fieldString(doc, key) {
  return doc?.fields?.[key]?.stringValue ?? null;
}

function fieldBool(doc, key) {
  return doc?.fields?.[key]?.booleanValue === true;
}

function fieldMap(doc, key) {
  return doc?.fields?.[key]?.mapValue?.fields || null;
}

function parsePushSubs(mapFields) {
  if (!mapFields) return [];
  const out = [];
  for (const entry of Object.values(mapFields)) {
    const f = entry?.mapValue?.fields;
    if (!f) continue;
    const endpoint = f.endpoint?.stringValue;
    const p256dh = f.keys?.mapValue?.fields?.p256dh?.stringValue;
    const auth = f.keys?.mapValue?.fields?.auth?.stringValue;
    if (endpoint && p256dh && auth) {
      out.push({ endpoint, keys: { p256dh, auth } });
    }
  }
  return out;
}

async function sendToSubs(env, subs, cleanText) {
  webpush.setVapidDetails(
    env.VAPID_SUBJECT || "mailto:push@gitbridge.local",
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY
  );

  const payload = JSON.stringify({
    title: cleanText,
    body: cleanText,
    tag: "gitbridge-chat-notify",
  });
  let sent = 0;
  const stale = [];
  const errors = [];
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, payload, {
          TTL: 60 * 60,
          urgency: "high",
        });
        sent += 1;
      } catch (err) {
        const status = err?.statusCode || err?.status;
        const msg = String(err?.message || err?.body || err).slice(0, 160);
        errors.push({ status: status || 0, message: msg });
        if (status === 404 || status === 410) stale.push(sub.endpoint);
        console.error("webpush send failed", status, msg);
      }
    })
  );
  return { sent, stale, errors, subCount: subs.length };
}

async function handleNotify(req, env, origin) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return json(500, { error: "vapid_not_configured" }, origin);
  }

  const projectId = env.FIREBASE_PROJECT_ID || "chatapp-1dfee";
  const auth = req.headers.get("Authorization") || "";
  const idToken = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!idToken) return json(401, { error: "missing_token" }, origin);

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" }, origin);
  }

  const roomId = String(body?.roomId || "").trim();
  const target = String(body?.target || "m1").trim().toLowerCase();
  if (!roomId) return json(400, { error: "missing_roomId" }, origin);
  if (target !== "m1" && target !== "m2") {
    return json(400, { error: "invalid_target" }, origin);
  }

  let uid;
  try {
    uid = await verifyFirebaseToken(idToken, projectId);
  } catch {
    return json(401, { error: "invalid_token" }, origin);
  }

  const userDoc = await firestoreGet(projectId, `users/${uid}`, idToken);
  if (!userDoc) return json(403, { error: "no_user" }, origin);

  const username = fieldString(userDoc, "username");
  const userRoomId = fieldString(userDoc, "roomId");
  if (!username) return json(403, { error: "no_username" }, origin);
  if (userRoomId !== roomId) {
    return json(403, { error: "room_mismatch" }, origin);
  }

  // Sender must be the other member (not the notify target)
  if (username === target) {
    return json(403, { error: "cannot_notify_self" }, origin);
  }

  const roomDoc = await firestoreGet(
    projectId,
    `rooms/${encodeURIComponent(roomId)}`
  );
  if (!roomDoc) return json(404, { error: "room_not_found" }, origin);

  if (target === "m1") {
    if (!fieldBool(roomDoc, "pushNotifyM1")) {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
  } else {
    const m2Doc = await firestoreGet(
      projectId,
      `rooms/${encodeURIComponent(roomId)}/members/m2`
    );
    const enabled =
      m2Doc?.fields?.pushNotifyEnabled?.booleanValue === true ||
      (m2Doc?.fields?.pushNotifyEnabled == null &&
        m2Doc?.fields?.pushNotifyApprove?.booleanValue === true);
    if (!enabled) {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
  }

  const text =
    String(fieldString(roomDoc, "pushNotifyText") || "").trim() || DEFAULT_TEXT;
  const cleanText = text.replace(/https?:\/\/\S+/gi, "").trim() || DEFAULT_TEXT;

  const memberDoc = await firestoreGet(
    projectId,
    `rooms/${encodeURIComponent(roomId)}/members/${target}`
  );
  const subs = parsePushSubs(fieldMap(memberDoc, "pushSubs"));
  if (!subs.length) {
    return json(200, { sent: 0, reason: "no_subscriptions", target }, origin);
  }

  const result = await sendToSubs(env, subs, cleanText);
  return json(200, { ...result, target }, origin);
}

/** Authenticated user pushes to their own device — verifies Web Push path (not local showNotification). */
async function handleSelfTest(req, env, origin) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return json(500, { error: "vapid_not_configured" }, origin);
  }

  const projectId = env.FIREBASE_PROJECT_ID || "chatapp-1dfee";
  const auth = req.headers.get("Authorization") || "";
  const idToken = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!idToken) return json(401, { error: "missing_token" }, origin);

  let uid;
  try {
    uid = await verifyFirebaseToken(idToken, projectId);
  } catch {
    return json(401, { error: "invalid_token" }, origin);
  }

  const userDoc = await firestoreGet(projectId, `users/${uid}`, idToken);
  if (!userDoc) return json(403, { error: "no_user" }, origin);
  const username = fieldString(userDoc, "username");
  const roomId = fieldString(userDoc, "roomId");
  if (!username || !roomId) return json(403, { error: "no_profile" }, origin);

  const roomDoc = await firestoreGet(
    projectId,
    `rooms/${encodeURIComponent(roomId)}`
  );
  const text =
    String(fieldString(roomDoc, "pushNotifyText") || "").trim() || DEFAULT_TEXT;
  const cleanText =
    ("[টেস্ট] " + text.replace(/https?:\/\/\S+/gi, "")).trim() || "[টেস্ট] OK";

  const memberDoc = await firestoreGet(
    projectId,
    `rooms/${encodeURIComponent(roomId)}/members/${username}`
  );
  const subs = parsePushSubs(fieldMap(memberDoc, "pushSubs"));
  if (!subs.length) {
    return json(200, {
      sent: 0,
      reason: "no_subscriptions",
      target: username,
      hint: "অ্যাপে নোটিফ টগল অফ→অন করে আবার চেষ্টা করুন",
    }, origin);
  }

  const result = await sendToSubs(env, subs, cleanText);
  return json(200, { ...result, target: username, selfTest: true }, origin);
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "*";
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (
      req.method === "GET" &&
      (url.pathname === "/" || url.pathname === "/health")
    ) {
      return json(
        200,
        {
          ok: true,
          service: "gitbridge-push-sender",
          features: {
            targetM1: true,
            targetM2: true,
            m2IgnoresAdmin: true,
            selfTest: true,
          },
        },
        origin
      );
    }

    if (req.method === "POST" && url.pathname === "/notify") {
      try {
        return await handleNotify(req, env, origin);
      } catch (err) {
        console.error(err);
        return json(500, { error: "server_error" }, origin);
      }
    }

    if (req.method === "POST" && url.pathname === "/self-test") {
      try {
        return await handleSelfTest(req, env, origin);
      } catch (err) {
        console.error(err);
        return json(500, { error: "server_error" }, origin);
      }
    }

    return json(404, { error: "not_found" }, origin);
  },
};
