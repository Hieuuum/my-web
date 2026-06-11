import { requireAuth } from "../_lib/auth.js";
import { listDir, getFile } from "../_lib/github.js";
import { parseFrontmatter } from "../_lib/posts.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  if (!requireAuth(req, res)) return;

  let entries;
  try {
    entries = await listDir("src/posts");
  } catch (err) {
    return res.status(502).json({ error: "Failed to list posts" });
  }

  const mdFiles = entries.filter((e) => e.name.endsWith(".md"));

  const posts = await Promise.all(
    mdFiles.map(async (entry) => {
      const slug = entry.name.replace(/\.md$/, "");
      try {
        const file = await getFile(`src/posts/${entry.name}`);
        if (!file) return null;
        const { data } = parseFrontmatter(file.content);
        return {
          slug,
          title: data.title || "",
          date: data.date || "",
          excerpt: data.excerpt || "",
          draft: data.draft === "true",
          sha: file.sha,
        };
      } catch {
        return null;
      }
    })
  );

  const valid = posts
    .filter(Boolean)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  return res.status(200).json(valid);
}
