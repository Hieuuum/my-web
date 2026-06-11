# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start dev server at http://localhost:5173
npm run build     # production build to dist/
npm run preview   # preview production build
```

## Architecture

Vite + React SPA with React Router. No backend — all data is static.

**Routing** (`src/App.jsx`): Five routes — `/`, `/blog`, `/blog/:slug`, `/projects`, `/contact`. All wrapped in a shared `Layout` (Nav + Footer).

**Blog system** (`src/lib/posts.js`): Markdown files in `src/posts/*.md` are loaded at runtime via Vite's `import.meta.glob` with `?raw` query (returns raw strings). A custom `parseFrontmatter()` function handles `---` YAML blocks — no external parser. Posts are sorted by `date` frontmatter descending. Required frontmatter fields: `title`, `date`. Optional: `excerpt`.

**Markdown rendering** (`src/pages/BlogPost.jsx`): `react-markdown` + `remark-gfm`, styled via `@tailwindcss/typography` (`prose prose-slate`).

**Styling**: Tailwind CSS v3 with the slate color palette throughout. Max content width is `max-w-3xl` centered with `px-6` padding on all pages.

## Design principles

This site is **extremely minimalist**. Enforce these strictly:

- No decorative elements — no gradients, shadows, illustrations, icons, or background colors
- No animations or transitions beyond simple `transition-colors` on hover
- Typography and whitespace do all the work — resist adding visual complexity to fill space
- Palette: white background, slate-900 headings, slate-600/700 body, slate-500 muted, slate-100/200 borders only (dark: zinc-950 bg, zinc-100 headings, zinc-300 body, zinc-400 muted)
- If a UI element feels "designed", simplify it
- When in doubt, remove rather than add

## Adding content

**New blog post**: create `src/posts/your-slug.md` with frontmatter:

```md
---
title: "Title"
date: "YYYY-MM-DD"
excerpt: "One-line summary."
---
```

**New project**: edit the `projects` array in `src/pages/Projects.jsx`.

**References/citations in a post**: GFM footnote syntax — `[^1]` in text, `[^1]: Source details` at the bottom. Renders as a numbered "References" section (label configured via `remarkRehypeOptions` in `BlogPost.jsx` and the admin editor preview).
