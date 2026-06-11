// Mirror of src/lib/posts.js parseFrontmatter — same regex, same parsing logic.
export function parseFrontmatter(raw) {
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

// Build markdown string from fields + content.
// Replaces double quotes in title/excerpt with single quotes to avoid round-trip issues
// (the parser strips surrounding quotes but inner quotes could break YAML-like parsing).
// Strip newlines from title/excerpt to keep single-line frontmatter.
export function buildMarkdown({ title, date, excerpt, draft }, content) {
  const safeStr = (s) =>
    String(s || "")
      .replace(/\r?\n/g, " ")
      .replace(/"/g, "'");

  let fm = `---\ntitle: "${safeStr(title)}"\ndate: "${safeStr(date)}"`;
  if (excerpt) {
    fm += `\nexcerpt: "${safeStr(excerpt)}"`;
  }
  if (draft === true || draft === "true") {
    fm += `\ndraft: "true"`;
  }
  fm += `\n---\n\n${content}`;
  return fm;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateSlug(slug) {
  if (!slug || typeof slug !== "string") return false;
  if (slug.length > 100) return false;
  return SLUG_RE.test(slug);
}
