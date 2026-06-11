const modules = import.meta.glob("../posts/*.md", {
  query: "?raw",
  import: "default",
});

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { data: {}, content: raw };
  const data = {};
  match[1].split("\n").forEach((line) => {
    const idx = line.indexOf(":");
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    const val = line
      .slice(idx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    data[key] = val;
  });
  return { data, content: match[2].trim() };
}

function slugFromPath(path) {
  return path.replace(/^.*\//, "").replace(/\.md$/, "");
}

export async function getAllPosts() {
  const posts = await Promise.all(
    Object.entries(modules).map(async ([path, load]) => {
      const raw = await load();
      const { data, content } = parseFrontmatter(raw);
      return { slug: slugFromPath(path), data, content };
    }),
  );
  return posts
    .filter((p) => p.data.draft !== "true")
    .sort((a, b) => new Date(b.data.date) - new Date(a.data.date));
}

export async function getPost(slug) {
  const entry = Object.entries(modules).find(
    ([path]) => slugFromPath(path) === slug,
  );
  if (!entry) return null;
  const raw = await entry[1]();
  const { data, content } = parseFrontmatter(raw);
  if (data.draft === "true") return null;
  return { slug, data, content };
}
