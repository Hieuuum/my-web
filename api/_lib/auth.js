import { createHmac, timingSafeEqual, scryptSync } from "node:crypto";

const SESSION_COOKIE = "admin_session";
const SESSION_MAX_AGE = 604800; // 7 days in seconds
const SESSION_DURATION_MS = SESSION_MAX_AGE * 1000;

// Startup guard: fail loudly if secrets are misconfigured
const _sessionSecret = process.env.SESSION_SECRET;
if (!_sessionSecret || _sessionSecret.length < 32) {
  throw new Error("SESSION_SECRET env var must be set to at least 32 random characters");
}

// ADMIN_PASSWORD_HASH must be a scrypt-encoded string: "scrypt:<N>:<r>:<p>:<salt_hex>:<hash_hex>"
// Generate with: node -e "const {scryptSync,randomBytes}=require('crypto');const s=randomBytes(16).toString('hex');const h=scryptSync('<password>',Buffer.from(s,'hex'),32).toString('hex');console.log('scrypt:16384:8:1:'+s+':'+h)"
export function verifyPassword(password) {
  const encoded = process.env.ADMIN_PASSWORD_HASH || "";
  if (!encoded.startsWith("scrypt:")) return false;
  const parts = encoded.split(":");
  // format: scrypt:<N>:<r>:<p>:<salt_hex>:<hash_hex>
  if (parts.length !== 6) return false;
  const [, N, r, p, saltHex, hashHex] = parts;
  try {
    const derivedBuf = scryptSync(password, Buffer.from(saltHex, "hex"), 32, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    const expectedBuf = Buffer.from(hashHex, "hex");
    if (derivedBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(derivedBuf, expectedBuf);
  } catch {
    return false;
  }
}

export function createSessionCookie() {
  const secret = _sessionSecret;
  const expiry = Date.now() + SESSION_DURATION_MS;
  const expiryStr = String(expiry);
  const hmac = createHmac("sha256", secret).update(expiryStr).digest("hex");
  const token = `${expiryStr}.${hmac}`;
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_MAX_AGE}`;
}

export function verifySession(req) {
  const cookieHeader = req.headers.cookie || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const idx = c.indexOf("=");
      if (idx === -1) return [c.trim(), ""];
      return [c.slice(0, idx).trim(), c.slice(idx + 1).trim()];
    })
  );
  const token = cookies[SESSION_COOKIE];
  if (!token) return false;

  const dotIdx = token.lastIndexOf(".");
  if (dotIdx === -1) return false;
  const expiryStr = token.slice(0, dotIdx);
  const providedHmac = token.slice(dotIdx + 1);

  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || Date.now() > expiry) return false;

  const expectedHmac = createHmac("sha256", _sessionSecret).update(expiryStr).digest("hex");

  if (providedHmac.length !== expectedHmac.length) return false;
  return timingSafeEqual(Buffer.from(providedHmac, "hex"), Buffer.from(expectedHmac, "hex"));
}

export function requireAuth(req, res) {
  if (!verifySession(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}
