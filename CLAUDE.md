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

**Code syntax highlighting** (`src/lib/shiki.js`): Shiki, using the real VS Code Dark Modern / Light Modern token colors (which inherit unchanged from the bundled `dark-plus` / `light-plus` themes) — not a hand-rolled palette. Runs on the JS regex engine (`shiki/engine/javascript`), not the default WASM oniguruma engine, to avoid a ~600KB binary in a static site. Only a curated language list is pre-loaded (see `LANGS` in `shiki.js`) because `react-markdown` processes synchronously and can't await Shiki's on-demand language loading — `fallbackLanguage: "text"` covers anything not in the list rather than throwing. Add a language to `LANGS` if a post needs one that isn't there. The highlighter is a module-level singleton (`useShikiHighlighter`) shared by `BlogPost.jsx` and the admin editor preview (`src/admin/pages/Editor.jsx`) so it's only built once.

**Styling**: Tailwind CSS v3 with the slate color palette throughout. Max content width is `max-w-3xl` centered with `px-6` padding on all pages.

## Design principles

This site is **extremely minimalist**. Enforce these strictly:

- No decorative elements — no gradients, shadows, illustrations, icons, or background colors
- No animations or transitions beyond simple `transition-colors` on hover
- Typography and whitespace do all the work — resist adding visual complexity to fill space
- Palette: white background, slate-900 headings, slate-600/700 body, slate-500 muted, slate-100/200 borders only (dark: zinc-950 bg, zinc-100 headings, zinc-300 body, zinc-400 muted)
- If a UI element feels "designed", simplify it
- When in doubt, remove rather than add
- **Exception**: fenced code blocks use real syntax-highlighting colors (see below) — the one deliberate departure from the grayscale palette

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
