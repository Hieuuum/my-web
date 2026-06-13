import { randomBytes } from "node:crypto";
import { requireAuth } from "./_lib/auth.js";
import { getFile, putFile } from "./_lib/github.js";
import { validateSlug } from "./_lib/posts.js";
import { postImageRepoPath, postImageUrl } from "./_lib/images.js";

const ALLOWED_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);
const MAX_BYTES = 4 * 1024 * 1024; // 4MB

function sanitizeFilename(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  const ct = req.headers["content-type"] || "";
  if (!ct.includes("application/json")) {
    return res.status(415).json({ error: "Unsupported Media Type" });
  }
  if (!requireAuth(req, res)) return;

  const { filename, dataBase64, slug } = req.body || {};
  if (!filename || !dataBase64) {
    return res.status(400).json({ error: "filename and dataBase64 required" });
  }
  if (!slug || !validateSlug(slug)) {
    return res.status(400).json({ error: "valid slug required" });
  }

  // Validate extension
  const dotIdx = filename.lastIndexOf(".");
  const ext = dotIdx !== -1 ? filename.slice(dotIdx + 1).toLowerCase() : "";
  if (!ALLOWED_EXTS.has(ext)) {
    return res.status(400).json({ error: "File type not allowed" });
  }

  // Validate size (base64 decoded length, accounting for padding)
  const padding = (dataBase64.match(/={1,2}$/) || [""])[0].length;
  const decodedLength = Math.floor((dataBase64.length * 3) / 4) - padding;
  if (decodedLength > MAX_BYTES) {
    return res.status(400).json({ error: "File too large (max 4MB)" });
  }

  let safeName = sanitizeFilename(filename);
  if (!safeName || safeName === `.${ext}`) {
    safeName = `upload.${ext}`;
  }

  // Check for collision and add random prefix if needed
  const path = postImageRepoPath(slug, safeName);
  const existing = await getFile(path).catch(() => null);
  let finalName = safeName;
  if (existing) {
    const prefix = randomBytes(4).toString("hex");
    finalName = `${prefix}-${safeName}`;
  }

  const finalPath = postImageRepoPath(slug, finalName);
  try {
    await putFile(finalPath, dataBase64, `Upload image: ${finalName}`, undefined);
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: "Failed to upload image" });
  }

  return res.status(200).json({ url: postImageUrl(slug, finalName) });
}
