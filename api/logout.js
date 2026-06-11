import { requireAuth } from "./_lib/auth.js";

export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  if (!requireAuth(req, res)) return;
  res.setHeader(
    "Set-Cookie",
    "admin_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
  );
  return res.status(204).end();
}
