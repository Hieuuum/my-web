import { requireAuth } from "./_lib/auth.js";

export default function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  if (!requireAuth(req, res)) return;
  return res.status(204).end();
}
