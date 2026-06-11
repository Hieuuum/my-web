import { verifyPassword, createSessionCookie } from "./_lib/auth.js";

// In-memory rate limiter (best-effort: resets on cold start, but throttles
// sustained attacks on warm serverless instances).
// For production, replace with a persistent store (e.g. Upstash Redis).
const WINDOW_MS = 60_000; // 1 minute
const MAX_ATTEMPTS = 10;
const _attempts = new Map(); // ip -> { count, windowStart }

function isRateLimited(ip) {
  const now = Date.now();
  const entry = _attempts.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    _attempts.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  const ct = req.headers["content-type"] || "";
  if (!ct.includes("application/json")) {
    return res.status(415).json({ error: "Unsupported Media Type" });
  }

  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "Too Many Requests" });
  }

  const { password } = req.body || {};

  // ~500ms delay regardless of outcome to resist timing attacks
  await new Promise((r) => setTimeout(r, 500));

  if (!password || !verifyPassword(password)) {
    return res.status(401).json({ error: "Invalid password" });
  }

  res.setHeader("Set-Cookie", createSessionCookie());
  return res.status(204).end();
}
