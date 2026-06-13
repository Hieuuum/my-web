import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, ApiError } from "../api";
import { mdComponents } from "../../lib/mdComponents.jsx";

// ── helpers ────────────────────────────────────────────────────────────────

function toSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100);
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function localKey(slug) {
  return `admin-draft:${slug || "new"}`;
}

// ── image downscaling ──────────────────────────────────────────────────────
// Shrink large raster images in the browser before upload so the base64
// request body stays under the serverless ~4.5MB limit — a full-resolution
// photo otherwise fails with HTTP 413 before the function even runs. SVG and
// GIF pass through untouched (the canvas would destroy vector/animation).

const MAX_IMAGE_DIM = 1600; // px, longest edge
const MAX_UPLOAD_BYTES = 3.5 * 1024 * 1024; // base64 of this stays under ~4.5MB

async function downscaleImage(file) {
  if (file.type === "image/svg+xml" || file.type === "image/gif") return file;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(bitmap.width, bitmap.height));
  if (scale === 1) {
    bitmap.close?.();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, file.type, 0.85));
  return blob && blob.size < file.size ? blob : file;
}

// ── markdown preview (mirrors public BlogPost) ─────────────────────────────

function Preview({ content }) {
  return (
    <div className="prose prose-slate dark:prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        remarkRehypeOptions={{ footnoteLabel: "References", footnoteLabelProperties: {} }}
        components={mdComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ── toolbar ────────────────────────────────────────────────────────────────

const TOOLBAR_ACTIONS = [
  { label: "B", wrap: ["**", "**"], placeholder: "bold" },
  { label: "I", wrap: ["*", "*"], placeholder: "italic" },
  { label: "H2", prefix: "## " },
  { label: "Code", wrap: ["`", "`"], placeholder: "code" },
  { label: "Quote", prefix: "> " },
  { label: "Link", template: (sel) => `[${sel || "text"}](url)` },
];

// Insert `text` replacing [start, end] in the textarea via execCommand, which
// keeps the browser's native undo stack (Ctrl+Z) intact — writing through
// React state would wipe it. React state syncs via the input event execCommand
// fires. Falls back to a state splice when execCommand fails (e.g. textarea
// hidden in Preview mode), losing undo for that one insertion only.
function insertTextUndoable(textarea, text, start, end, onChange) {
  textarea.focus();
  textarea.setSelectionRange(start, end);
  let ok = false;
  try {
    ok = document.execCommand("insertText", false, text);
  } catch {
    ok = false;
  }
  if (!ok) {
    const { value } = textarea;
    onChange(value.slice(0, start) + text + value.slice(end));
  }
}

function applyToolbar(action, textarea, onChange) {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const sel = value.slice(start, end);
  let insertion;
  let cursorOffset;

  if (action.template) {
    insertion = action.template(sel);
    cursorOffset = sel ? insertion.length : insertion.indexOf("url");
  } else if (action.prefix) {
    insertion = action.prefix + (sel || action.placeholder || "");
    cursorOffset = insertion.length;
  } else {
    const [open, close] = action.wrap;
    insertion = open + (sel || action.placeholder || "") + close;
    cursorOffset = sel ? insertion.length : open.length + (action.placeholder?.length || 0);
  }

  insertTextUndoable(textarea, insertion, start, end, onChange);

  requestAnimationFrame(() => {
    textarea.focus();
    const pos = start + cursorOffset;
    textarea.setSelectionRange(pos, pos);
  });
}

// ── editor key handling: wrap selections, auto-pair, type-over ──────────────
// Code-editor-style behavior for the markdown body. With a selection, the wrap
// keys surround it and keep it selected, so a second press nests (* → ** for
// bold, $ → $$ for display math). With no selection, brackets/backtick/quotes
// auto-insert their closer; * and $ type normally so lists and math aren't
// disrupted. Quotes only auto-pair after whitespace, leaving apostrophes in
// prose ("don't") literal. Typing a closer over an identical one skips past it;
// backspacing an empty pair removes both halves.

const WRAP_PAIRS = {
  "*": ["*", "*"],
  "$": ["$", "$"],
  "`": ["`", "`"],
  "{": ["{", "}"], "}": ["{", "}"],
  "[": ["[", "]"], "]": ["[", "]"],
  "(": ["(", ")"], ")": ["(", ")"],
  '"': ['"', '"'],
  "'": ["'", "'"],
};
const AUTO_PAIR = { "`": "`", "{": "}", "[": "]", "(": ")", '"': '"', "'": "'" };
const QUOTE_GATED = new Set(['"', "'"]);
const CLOSERS = new Set(["}", "]", ")", "`", '"', "'"]);

function handleEditorKeyDown(e, onChange) {
  if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
  const ta = e.currentTarget;
  const { selectionStart: start, selectionEnd: end, value } = ta;

  // Backspace between an empty auto-pair deletes both halves. Expanding the
  // selection and letting the default Backspace run keeps native undo intact.
  if (e.key === "Backspace" && start === end && start > 0) {
    const before = value[start - 1];
    if (AUTO_PAIR[before] && AUTO_PAIR[before] === value[start]) {
      ta.setSelectionRange(start - 1, start + 1);
    }
    return;
  }

  const pair = WRAP_PAIRS[e.key];
  if (!pair) return;

  // Selection present → wrap it, keeping the original text selected inside so a
  // second press nests the markers (* → **, $ → $$).
  if (start !== end) {
    const [open, close] = pair;
    e.preventDefault();
    insertTextUndoable(ta, open + value.slice(start, end) + close, start, end, onChange);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + open.length, end + open.length);
    });
    return;
  }

  // No selection: type over an identical closer instead of duplicating it.
  if (CLOSERS.has(e.key) && value[start] === e.key) {
    e.preventDefault();
    ta.setSelectionRange(start + 1, start + 1);
    return;
  }

  // No selection: auto-insert the closer (brackets/backtick/quotes only — not
  // * or $). Quotes are gated to whitespace/line-start to spare apostrophes.
  const closer = AUTO_PAIR[e.key];
  if (!closer) return;
  if (QUOTE_GATED.has(e.key) && start > 0 && !/\s/.test(value[start - 1])) return;
  e.preventDefault();
  insertTextUndoable(ta, e.key + closer, start, start, onChange);
  requestAnimationFrame(() => {
    ta.focus();
    ta.setSelectionRange(start + 1, start + 1);
  });
}

// ── main component ─────────────────────────────────────────────────────────

export default function Editor() {
  const { slug: routeSlug } = useParams();
  const isNew = !routeSlug;
  const navigate = useNavigate();
  const location = useLocation();

  // form state
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayISO());
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [slug, setSlug] = useState("");
  const [slugMode, setSlugMode] = useState("auto"); // "auto" follows title | "custom" user-set
  const [isDraft, setIsDraft] = useState(true);
  // Initialise sha from navigation state when navigating to a newly-created post
  // so a fast second save doesn't run without a sha before getPost resolves.
  const [sha, setSha] = useState(() => location.state?.sha ?? null);

  // UI state
  const [view, setView] = useState("write"); // "write" | "preview" | "split"
  // Debounced copy of content for the preview pane: re-parsing markdown on
  // every keystroke remounts <img> nodes, which collapse to zero height
  // until the image reloads — shrinking the document and bouncing the
  // page scroll in Split view.
  const [previewContent, setPreviewContent] = useState("");
  const [status, setStatus] = useState(""); // status bar text
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [restoreBanner, setRestoreBanner] = useState(null); // local draft data to restore
  const [error, setError] = useState("");

  const textareaRef = useRef(null);
  const titleRef = useRef(null);
  const autosaveTimer = useRef(null);

  // track if dirty (unsaved changes after last server save)
  const savedSnapshot = useRef(null); // stringified {title,date,excerpt,content,draft}
  const isDirtyRef = useRef(false); // kept in sync alongside savedSnapshot for beforeunload
  const currentSnapshot = useCallback(() => {
    return JSON.stringify({ title, date, excerpt, content, draft: isDraft });
  }, [title, date, excerpt, content, isDraft]);

  const isDirty = loaded && savedSnapshot.current !== null && currentSnapshot() !== savedSnapshot.current;
  isDirtyRef.current = isDirty;

  // ── load post on mount ───────────────────────────────────────────────────

  useEffect(() => {
    if (!isNew) {
      api.getPost(routeSlug).then((post) => {
        if (!post) {
          navigate("/admin/posts", { replace: true });
          return;
        }
        setTitle(post.title || "");
        setDate(post.date || todayISO());
        setExcerpt(post.excerpt || "");
        setContent(post.content || "");
        setSlug(post.slug);
        setSlugMode(post.slug === toSlug(post.title || "") ? "auto" : "custom");
        setIsDraft(!!post.draft);
        setSha(post.sha);

        const snap = JSON.stringify({
          title: post.title || "",
          date: post.date || todayISO(),
          excerpt: post.excerpt || "",
          content: post.content || "",
          draft: !!post.draft,
        });
        savedSnapshot.current = snap;

        // check localStorage for unsaved changes
        const key = localKey(routeSlug);
        const stored = localStorage.getItem(key);
        if (stored) {
          try {
            const local = JSON.parse(stored);
            if (local.savedAt && JSON.stringify({ title: local.title, date: local.date, excerpt: local.excerpt, content: local.content, draft: local.draft }) !== snap) {
              setRestoreBanner(local);
            } else {
              localStorage.removeItem(key);
            }
          } catch {
            localStorage.removeItem(key);
          }
        }

        setLoaded(true);
      }).catch(() => {
        navigate("/admin/posts", { replace: true });
      });
    } else {
      // new post: check localStorage
      const key = localKey(null);
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          const local = JSON.parse(stored);
          if (local.savedAt) {
            setRestoreBanner(local);
          }
        } catch {
          localStorage.removeItem(key);
        }
      }
      savedSnapshot.current = JSON.stringify({ title: "", date: todayISO(), excerpt: "", content: "", draft: true });
      setLoaded(true);
    }
  }, [isNew, routeSlug, navigate]);

  // ── auto-slug from title (while in auto mode) ────────────────────────────

  useEffect(() => {
    if (slugMode === "auto") {
      setSlug(toSlug(title));
    }
  }, [title, slugMode]);

  // ── autosave to localStorage ─────────────────────────────────────────────

  useEffect(() => {
    if (!loaded) return;
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      const key = localKey(isNew ? null : routeSlug);
      localStorage.setItem(key, JSON.stringify({ title, date, excerpt, content, draft: isDraft, savedAt: Date.now() }));
      if (isDirty) setStatus("Unsaved changes");
    }, 1000);
    return () => clearTimeout(autosaveTimer.current);
  }, [title, date, excerpt, content, isDraft, loaded]);

  // ── beforeunload ─────────────────────────────────────────────────────────

  useEffect(() => {
    function handler(e) {
      if (isDirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []); // stable: reads isDirtyRef synchronously at event time

  // ── restore banner handlers ──────────────────────────────────────────────

  function handleRestore() {
    const local = restoreBanner;
    const restoredTitle = local.title || "";
    const restoredDate = local.date || todayISO();
    const restoredExcerpt = local.excerpt || "";
    const restoredContent = local.content || "";
    const restoredDraft = local.draft !== undefined ? local.draft : true;
    setTitle(restoredTitle);
    setDate(restoredDate);
    setExcerpt(restoredExcerpt);
    setContent(restoredContent);
    setIsDraft(restoredDraft);
    // Keep savedSnapshot at the server-fetched value (or the blank initial
    // snapshot for new posts) so isDirty=true after restore, which keeps the
    // beforeunload guard and 'Unsaved changes' status active.
    // (savedSnapshot.current was set to the server snapshot during load and
    //  must NOT be overwritten here.)
    // Remove the localStorage draft — it has been applied.
    const key = localKey(isNew ? null : routeSlug);
    localStorage.removeItem(key);
    setRestoreBanner(null);
  }

  function handleDiscard() {
    const key = localKey(isNew ? null : routeSlug);
    localStorage.removeItem(key);
    setRestoreBanner(null);
  }

  // ── save ─────────────────────────────────────────────────────────────────

  async function save(asDraft) {
    setSaving(true);
    setStatus("Saving…");
    setError("");

    const targetSlug = slug || toSlug(title);
    if (!targetSlug) {
      setSaving(false);
      const msg = "Title is required — slug must not be empty.";
      setStatus(msg);
      setError(msg);
      return;
    }
    const body = {
      title,
      date,
      excerpt,
      content,
      draft: asDraft,
    };
    if (sha) body.sha = sha;
    if (!isNew && routeSlug && routeSlug !== targetSlug) {
      body.renameFrom = routeSlug;
    }

    try {
      // block save if the link is already used by another post
      const existing = await api.getPosts();
      if (existing.some((p) => p.slug === targetSlug && p.slug !== routeSlug)) {
        setSaving(false);
        const msg = `Link "/blog/${targetSlug}" is already used by another post.`;
        setStatus(msg);
        setError(msg);
        return;
      }

      const result = await api.savePost(targetSlug, body);
      setSha(result.sha);
      setIsDraft(asDraft);
      const snap = JSON.stringify({ title, date, excerpt, content, draft: asDraft });
      savedSnapshot.current = snap;
      isDirtyRef.current = false;

      // clear localStorage
      const key = localKey(isNew ? null : routeSlug);
      localStorage.removeItem(key);

      setStatus("Saved — live in ~1 min");
      setSaving(false);

      // navigate to slug if new or renamed; pass sha in state so the
      // remounted component has it immediately (before getPost resolves).
      if (isNew) {
        navigate(`/admin/posts/${targetSlug}`, { replace: true, state: { sha: result.sha } });
      } else if (routeSlug !== targetSlug) {
        navigate(`/admin/posts/${targetSlug}`, { replace: true, state: { sha: result.sha } });
      }
    } catch (err) {
      setSaving(false);
      if (err instanceof ApiError && err.status === 409) {
        setStatus("Post changed elsewhere — reload page");
      } else {
        const msg = err instanceof ApiError ? err.message : "Save failed.";
        setStatus(msg);
        setError(msg);
      }
    }
  }

  async function handleDelete() {
    if (!sha) return;
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    try {
      await api.deletePost(isNew ? slug : routeSlug, sha);
      const key = localKey(isNew ? null : routeSlug);
      localStorage.removeItem(key);
      navigate("/admin/posts", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  // ── image upload ─────────────────────────────────────────────────────────

  async function uploadImage(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const img = await downscaleImage(file);
    if (img.size > MAX_UPLOAD_BYTES) {
      setError("Image is too large to upload — try one under ~3 MB.");
      return;
    }
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataBase64 = e.target.result.split(",")[1];
        try {
          const result = await api.upload(file.name, dataBase64);
          resolve(result.url);
        } catch (err) {
          setError("Image upload failed.");
          resolve(null);
        }
      };
      reader.readAsDataURL(img);
    });
  }

  function insertAtCursor(text) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    insertTextUndoable(ta, text, start, end, setContent);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + text.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  async function handleImageToolbar() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      const url = await uploadImage(file);
      if (url) insertAtCursor(`![](${url})`);
    };
    input.click();
  }

  async function handlePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        const url = await uploadImage(file);
        if (url) insertAtCursor(`![](${url})`);
        return;
      }
    }
  }

  async function handleDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    const url = await uploadImage(file);
    if (url) insertAtCursor(`![](${url})`);
  }

  // ── textarea auto-grow ───────────────────────────────────────────────────
  // Grow-only: never collapse the textarea to measure it. A momentary
  // collapse shrinks the document, the browser clamps the page scroll, and
  // the site's scroll-behavior:smooth animates the restore — a visible
  // bounce on every keystroke. Growing only means the document never
  // shrinks, so there is nothing to restore. useLayoutEffect runs before
  // paint so the grown size is never preceded by an overflowing frame.
  // Browsers with CSS field-sizing:content size the box natively and this
  // effect no-ops (scrollHeight never exceeds clientHeight).

  useLayoutEffect(() => {
    if (!loaded) return;
    const ta = textareaRef.current;
    if (!ta || ta.offsetParent === null) return; // hidden in Preview mode
    if (ta.scrollHeight > ta.clientHeight) {
      ta.style.height = ta.scrollHeight + "px";
    }
  }, [content, view, loaded]);

  // Same grow-only sizing for the wrapping title textarea.
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el || el.offsetParent === null) return;
    if (el.scrollHeight > el.clientHeight) {
      el.style.height = el.scrollHeight + "px";
    }
  }, [title, loaded]);

  useEffect(() => {
    const id = setTimeout(() => setPreviewContent(content), 150);
    return () => clearTimeout(id);
  }, [content]);

  function handleContentChange(e) {
    setContent(e.target.value);
  }

  // ── slug input handling ──────────────────────────────────────────────────

  function handleSlugChange(e) {
    // keep custom links URL-safe: lowercase, no spaces
    setSlug(
      e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
    );
  }

  function toggleSlugMode() {
    if (slugMode === "auto") {
      setSlugMode("custom");
    } else {
      setSlugMode("auto");
      setSlug(toSlug(title));
    }
  }

  // ── status text ──────────────────────────────────────────────────────────
  // When fields change after a save, show "Unsaved changes"
  useEffect(() => {
    if (!loaded || savedSnapshot.current === null) return;
    if (currentSnapshot() !== savedSnapshot.current) {
      setStatus("Unsaved changes");
    }
  }, [title, date, excerpt, content, isDraft, loaded, currentSnapshot]);

  if (!loaded) return null;

  return (
    <>
      {/* Sticky toolbar: full viewport width, formatting, view toggle, actions, status */}
      <div className="sticky top-0 z-10 bg-white dark:bg-zinc-950 border-b border-slate-100 dark:border-zinc-800 px-6 py-3">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Toolbar buttons */}
          <div className="flex items-center gap-1">
            {TOOLBAR_ACTIONS.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => {
                  if (textareaRef.current) {
                    applyToolbar(action, textareaRef.current, setContent);
                  }
                }}
                className="text-base text-slate-600 dark:text-white hover:text-slate-900 dark:hover:text-white/70 transition-colors px-1.5 py-1 font-mono"
              >
                {action.label}
              </button>
            ))}
            {/* Image button */}
            <button
              type="button"
              onClick={handleImageToolbar}
              className="text-base text-slate-600 dark:text-white hover:text-slate-900 dark:hover:text-white/70 transition-colors px-1.5 py-1 font-mono"
            >
              Image
            </button>
          </div>

          {/* Write / Preview / Split toggle */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => setView("write")}
              className={`text-base transition-colors ${view === "write" ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-white/60 hover:text-slate-700 dark:hover:text-white"}`}
            >
              Write
            </button>
            <span className="text-slate-200 dark:text-zinc-700">|</span>
            <button
              type="button"
              onClick={() => setView("preview")}
              className={`text-base transition-colors ${view === "preview" ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-white/60 hover:text-slate-700 dark:hover:text-white"}`}
            >
              Preview
            </button>
            <span className="text-slate-200 dark:text-zinc-700">|</span>
            <button
              type="button"
              onClick={() => setView("split")}
              className={`text-base transition-colors ${view === "split" ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-white/60 hover:text-slate-700 dark:hover:text-white"}`}
            >
              Split
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 border-l border-slate-200 dark:border-zinc-700 pl-4">
            {isDraft || !sha ? (
              <>
                <button
                  onClick={() => save(true)}
                  disabled={saving}
                  className="text-base text-slate-700 dark:text-white hover:text-slate-900 dark:hover:text-white/70 transition-colors disabled:opacity-50"
                >
                  Save draft
                </button>
                <button
                  onClick={() => save(false)}
                  disabled={saving}
                  className="text-base bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1 rounded hover:bg-slate-700 dark:hover:bg-zinc-300 transition-colors disabled:opacity-50"
                >
                  Publish
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => save(false)}
                  disabled={saving}
                  className="text-base bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1 rounded hover:bg-slate-700 dark:hover:bg-zinc-300 transition-colors disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  onClick={() => save(true)}
                  disabled={saving}
                  className="text-base text-slate-500 dark:text-white hover:text-slate-700 dark:hover:text-white/70 transition-colors disabled:opacity-50"
                >
                  Unpublish
                </button>
              </>
            )}
            {sha && (
              <button
                onClick={handleDelete}
                disabled={saving}
                className="text-base text-slate-500 dark:text-white hover:text-slate-700 dark:hover:text-white/70 transition-colors disabled:opacity-50"
              >
                Delete
              </button>
            )}
          </div>

          {/* Status bar */}
          {status && (
            <span className="text-base text-slate-500 dark:text-white">{status}</span>
          )}
        </div>

        {error && (
          <p className="text-base text-slate-600 dark:text-white mt-2">{error}</p>
        )}
      </div>

      <div className={`${view === "split" ? "max-w-5xl" : "max-w-3xl"} mx-auto px-6 pt-4 pb-10`}>
      {/* Restore banner */}
      {restoreBanner && (
        <div className="mb-6 flex items-center gap-4 border border-slate-200 dark:border-zinc-700 rounded px-4 py-3">
          <span className="text-sm text-slate-700 dark:text-white flex-1">
            Restore unsaved changes from {new Date(restoreBanner.savedAt).toLocaleString()}?
          </span>
          <button
            onClick={handleRestore}
            className="text-sm text-slate-900 dark:text-white hover:text-slate-700 dark:hover:text-white/70 transition-colors"
          >
            Restore
          </button>
          <button
            onClick={handleDiscard}
            className="text-sm text-slate-500 dark:text-white hover:text-slate-700 dark:hover:text-white/70 transition-colors"
          >
            Discard
          </button>
        </div>
      )}

      {/* Title — wraps onto multiple lines; literal newlines are blocked
          because the title is written into YAML frontmatter on save */}
      <textarea
        ref={titleRef}
        rows={1}
        value={title}
        onChange={(e) => setTitle(e.target.value.replace(/\n/g, ""))}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
        placeholder="Title"
        className="w-full text-3xl font-semibold text-slate-900 dark:text-white border-none outline-none resize-none overflow-hidden placeholder-slate-400 dark:placeholder-zinc-600 mb-1 bg-transparent [field-sizing:content]"
      />

      {/* Link — auto follows the title; custom lets you set your own */}
      <div className="flex items-center gap-1 mb-4">
        <span className="text-xs text-slate-500 dark:text-white">link: /blog/</span>
        <input
          type="text"
          value={slug}
          onChange={handleSlugChange}
          readOnly={slugMode === "auto"}
          placeholder={slugMode === "auto" ? "auto" : "custom-link"}
          className="flex-1 text-xs text-slate-500 dark:text-white border-none outline-none bg-transparent placeholder-slate-400 dark:placeholder-zinc-600"
        />
        <button
          type="button"
          onClick={toggleSlugMode}
          className="text-xs text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 rounded px-2 py-0.5 hover:border-slate-400 dark:hover:border-zinc-500 transition-colors"
        >
          {slugMode === "auto" ? "Auto" : "Custom"}
        </button>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap gap-4 mb-6 border-b border-slate-100 dark:border-zinc-800 pb-4">
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 dark:text-zinc-400">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="text-sm text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 rounded px-2 py-1 bg-transparent dark:bg-zinc-900 focus:outline-none focus:border-slate-400 dark:focus:border-zinc-500"
          />
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-48">
          <label className="text-xs text-slate-500 dark:text-zinc-400">Excerpt</label>
          <input
            type="text"
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            placeholder="One-line summary"
            className="flex-1 text-sm text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 rounded px-2 py-1 bg-transparent dark:bg-zinc-900 focus:outline-none focus:border-slate-400 dark:focus:border-zinc-500 placeholder-slate-400 dark:placeholder-zinc-500"
          />
        </div>
      </div>

      {/* Editor area */}
      <div className={view === "split" ? "xl:grid xl:grid-cols-2 xl:gap-8" : ""}>
        {/* Textarea */}
        <div className={view === "preview" ? "hidden" : ""}>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleContentChange}
            onKeyDown={(e) => handleEditorKeyDown(e, setContent)}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            placeholder="Write in markdown…"
            className="w-full font-mono text-sm text-slate-800 dark:text-white border-none outline-none resize-none bg-transparent placeholder-slate-400 dark:placeholder-zinc-600 [field-sizing:content]"
            style={{ minHeight: "60vh" }}
          />
        </div>

        {/* Preview */}
        <div
          className={
            view === "write"
              ? "hidden"
              : view === "split"
                ? "mt-6 pt-6 border-t xl:mt-0 xl:pt-0 xl:border-t-0 xl:border-l border-slate-100 dark:border-zinc-800 xl:pl-8"
                : ""
          }
        >
          <Preview content={previewContent} />
        </div>
      </div>

      </div>
    </>
  );
}
