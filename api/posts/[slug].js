import { requireAuth } from "../_lib/auth.js";
import { getFile, putFile, deleteFile, listDir, getBlob, ConflictError } from "../_lib/github.js";
import { parseFrontmatter, buildMarkdown, validateSlug } from "../_lib/posts.js";
import { rewriteImageRefs, postImageDir, postImageRepoPath } from "../_lib/images.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function requireJson(req, res) {
  const ct = req.headers["content-type"] || "";
  if (!ct.includes("application/json")) {
    res.status(415).json({ error: "Unsupported Media Type" });
    return false;
  }
  return true;
}

async function handleGet(req, res, slug) {
  const file = await getFile(`src/posts/${slug}.md`);
  if (!file) return res.status(404).json({ error: "Not found" });
  const { data, content } = parseFrontmatter(file.content);
  return res.status(200).json({
    slug,
    title: data.title || "",
    date: data.date || "",
    excerpt: data.excerpt || "",
    draft: data.draft === "true",
    content,
    sha: file.sha,
  });
}

async function handlePut(req, res, slug) {
  if (!requireJson(req, res)) return;
  const { title, date, excerpt, draft, content, sha, renameFrom } = req.body || {};

  // Validations
  if (!title || String(title).length > 300) {
    return res.status(400).json({ error: "Invalid title" });
  }
  if (!date || !DATE_RE.test(date)) {
    return res.status(400).json({ error: "Invalid date" });
  }
  if (excerpt && String(excerpt).length > 300) {
    return res.status(400).json({ error: "Invalid excerpt" });
  }
  if (content && Buffer.byteLength(content, "utf8") > 200 * 1024) {
    return res.status(400).json({ error: "Content too large" });
  }
  if (renameFrom && !validateSlug(renameFrom)) {
    return res.status(400).json({ error: "Invalid renameFrom slug" });
  }

  const bodyContent = (renameFrom && renameFrom !== slug) ? rewriteImageRefs(content || "", renameFrom, slug) : (content || "");
  const markdown = buildMarkdown(
    { title, date, excerpt: excerpt || "", draft: draft === true },
    bodyContent
  );
  const base64Content = Buffer.from(markdown, "utf8").toString("base64");

  let commitMessage;
  if (!sha) {
    commitMessage = `Publish post: ${slug}`;
  } else if (draft === true) {
    commitMessage = `Save draft: ${slug}`;
  } else {
    commitMessage = `Update post: ${slug}`;
  }

  try {
    const result = await putFile(`src/posts/${slug}.md`, base64Content, commitMessage, sha || undefined);

    // If renaming, delete the old file
    if (renameFrom && renameFrom !== slug) {
      const oldFile = await getFile(`src/posts/${renameFrom}.md`);
      if (oldFile) {
        try {
          await deleteFile(`src/posts/${renameFrom}.md`, `Delete post: ${renameFrom}`, oldFile.sha);
        } catch (deleteErr) {
          if (deleteErr instanceof ConflictError) {
            // Compensate: remove the new file we just created to avoid duplicate posts
            try {
              await deleteFile(`src/posts/${slug}.md`, `Revert: ${slug}`, result.sha);
            } catch {
              // best-effort; log so the partial state can be detected
              console.error(`Rename partial failure: ${slug}.md created but ${renameFrom}.md not deleted`);
            }
            return res.status(409).json({ error: "conflict" });
          }
          throw deleteErr;
        }
      }
    }

    if (renameFrom && renameFrom !== slug) {
      try {
        const oldDir = postImageDir(renameFrom);
        const entries = await listDir(oldDir);
        for (const entry of entries) {
          if (entry.type !== "file") continue;
          const base64 = await getBlob(entry.sha);
          await putFile(postImageRepoPath(slug, entry.name), base64, `Move image: ${entry.name}`);
          await deleteFile(`${oldDir}/${entry.name}`, `Delete moved image: ${entry.name}`, entry.sha);
        }
      } catch (moveErr) {
        console.error(`Image folder move failed (${renameFrom} -> ${slug}):`, moveErr);
      }
    }

    return res.status(200).json({ slug, sha: result.sha });
  } catch (err) {
    if (err instanceof ConflictError) {
      return res.status(409).json({ error: "conflict" });
    }
    throw err;
  }
}

async function handleDelete(req, res, slug) {
  if (!requireJson(req, res)) return;
  const { sha } = req.body || {};
  if (!sha) return res.status(400).json({ error: "sha required" });

  try {
    await deleteFile(`src/posts/${slug}.md`, `Delete post: ${slug}`, sha);
    return res.status(204).end();
  } catch (err) {
    if (err instanceof ConflictError) {
      return res.status(409).json({ error: "conflict" });
    }
    throw err;
  }
}

export default async function handler(req, res) {
  const slug = req.query.slug;

  if (!validateSlug(slug)) {
    return res.status(400).json({ error: "Invalid slug" });
  }
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === "GET") return await handleGet(req, res, slug);
    if (req.method === "PUT") return await handlePut(req, res, slug);
    if (req.method === "DELETE") return await handleDelete(req, res, slug);
    return res.status(405).json({ error: "Method Not Allowed" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
