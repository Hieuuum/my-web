import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, ApiError } from "../api";

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

// ── markdown preview (mirrors public BlogPost) ─────────────────────────────

function Preview({ content }) {
  return (
    <div className="prose prose-slate dark:prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        remarkRehypeOptions={{ footnoteLabel: "References", footnoteLabelProperties: {} }}
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
  const [slugEdited, setSlugEdited] = useState(false); // user manually edited slug
  const [isDraft, setIsDraft] = useState(true);
  // Initialise sha from navigation state when navigating to a newly-created post
  // so a fast second save doesn't run without a sha before getPost resolves.
  const [sha, setSha] = useState(() => location.state?.sha ?? null);

  // UI state
  const [view, setView] = useState("write"); // "write" | "preview" | "split"
  const [status, setStatus] = useState(""); // status bar text
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [restoreBanner, setRestoreBanner] = useState(null); // local draft data to restore
  const [error, setError] = useState("");

  const textareaRef = useRef(null);
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

  // ── auto-slug from title (new post, not manually edited) ────────────────

  useEffect(() => {
    if (isNew && !slugEdited) {
      setSlug(toSlug(title));
    }
  }, [title, isNew, slugEdited]);

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
    if (file.size > 4 * 1024 * 1024) {
      setError("Image must be under 4 MB.");
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
      reader.readAsDataURL(file);
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
  // Runs on load, restore, view switch, and every content change. Collapsing
  // to "auto" momentarily shrinks the document, which yanks the page scroll
  // to the top — save and restore the scroll position around the measurement.

  useEffect(() => {
    if (!loaded) return;
    const ta = textareaRef.current;
    if (!ta || ta.offsetParent === null) return; // hidden in Preview mode
    const { scrollX, scrollY } = window;
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
    window.scrollTo(scrollX, scrollY);
  }, [content, view, loaded]);

  function handleContentChange(e) {
    setContent(e.target.value);
  }

  // ── slug input handling ──────────────────────────────────────────────────

  function handleSlugChange(e) {
    setSlug(e.target.value);
    if (!slugEdited) setSlugEdited(true);
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
    <div className="max-w-5xl mx-auto px-6 py-10">
      {/* Restore banner */}
      {restoreBanner && (
        <div className="mb-6 flex items-center gap-4 border border-slate-200 dark:border-zinc-700 rounded px-4 py-3">
          <span className="text-sm text-slate-600 dark:text-zinc-400 flex-1">
            Restore unsaved changes from {new Date(restoreBanner.savedAt).toLocaleString()}?
          </span>
          <button
            onClick={handleRestore}
            className="text-sm text-slate-900 dark:text-zinc-100 hover:text-slate-600 dark:hover:text-zinc-400 transition-colors"
          >
            Restore
          </button>
          <button
            onClick={handleDiscard}
            className="text-sm text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-400 transition-colors"
          >
            Discard
          </button>
        </div>
      )}

      {/* Title */}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="w-full text-3xl font-semibold text-slate-900 dark:text-zinc-100 border-none outline-none placeholder-slate-300 dark:placeholder-zinc-700 mb-1 bg-transparent"
      />

      {/* Slug (new post only until first save) */}
      {(isNew || !sha) && (
        <div className="flex items-center gap-1 mb-4">
          <span className="text-xs text-slate-400 dark:text-zinc-500">slug:</span>
          <input
            type="text"
            value={slug}
            onChange={handleSlugChange}
            placeholder="auto"
            className="text-xs text-slate-400 dark:text-zinc-500 border-none outline-none bg-transparent placeholder-slate-300 dark:placeholder-zinc-700"
          />
        </div>
      )}

      {/* Meta row */}
      <div className="flex flex-wrap gap-4 mb-6 border-b border-slate-100 dark:border-zinc-800 pb-4">
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 dark:text-zinc-500">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="text-sm text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 rounded px-2 py-1 bg-transparent dark:bg-zinc-900 focus:outline-none focus:border-slate-400 dark:focus:border-zinc-500"
          />
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-48">
          <label className="text-xs text-slate-400 dark:text-zinc-500">Excerpt</label>
          <input
            type="text"
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            placeholder="One-line summary"
            className="flex-1 text-sm text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 rounded px-2 py-1 bg-transparent dark:bg-zinc-900 focus:outline-none focus:border-slate-400 dark:focus:border-zinc-500 placeholder-slate-300 dark:placeholder-zinc-600"
          />
        </div>
      </div>

      {/* Toolbar + Write/Preview toggle */}
      <div className="flex items-center gap-4 mb-3 flex-wrap">
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
              className="text-xs text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 transition-colors px-1.5 py-1 font-mono"
            >
              {action.label}
            </button>
          ))}
          {/* Image button */}
          <button
            type="button"
            onClick={handleImageToolbar}
            className="text-xs text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 transition-colors px-1.5 py-1 font-mono"
          >
            Image
          </button>
        </div>

        {/* Write / Preview / Split toggle */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={() => setView("write")}
            className={`text-xs transition-colors ${view === "write" ? "text-slate-900 dark:text-zinc-100" : "text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-400"}`}
          >
            Write
          </button>
          <span className="text-slate-200 dark:text-zinc-700">|</span>
          <button
            type="button"
            onClick={() => setView("preview")}
            className={`text-xs transition-colors ${view === "preview" ? "text-slate-900 dark:text-zinc-100" : "text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-400"}`}
          >
            Preview
          </button>
          <span className="text-slate-200 dark:text-zinc-700">|</span>
          <button
            type="button"
            onClick={() => setView("split")}
            className={`text-xs transition-colors ${view === "split" ? "text-slate-900 dark:text-zinc-100" : "text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-400"}`}
          >
            Split
          </button>
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
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            placeholder="Write in markdown…"
            className="w-full font-mono text-sm text-slate-700 dark:text-zinc-300 border-none outline-none resize-none bg-transparent placeholder-slate-300 dark:placeholder-zinc-700"
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
          <Preview content={content} />
        </div>
      </div>

      {/* Actions row */}
      <div className="mt-8 pt-4 border-t border-slate-100 dark:border-zinc-800 flex items-center gap-4 flex-wrap">
        {isDraft || !sha ? (
          <>
            <button
              onClick={() => save(true)}
              disabled={saving}
              className="text-sm text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 transition-colors disabled:opacity-50"
            >
              Save draft
            </button>
            <button
              onClick={() => save(false)}
              disabled={saving}
              className="text-sm bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-1.5 rounded hover:bg-slate-700 dark:hover:bg-zinc-300 transition-colors disabled:opacity-50"
            >
              Publish
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => save(false)}
              disabled={saving}
              className="text-sm bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-1.5 rounded hover:bg-slate-700 dark:hover:bg-zinc-300 transition-colors disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => save(true)}
              disabled={saving}
              className="text-sm text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-400 transition-colors disabled:opacity-50"
            >
              Unpublish
            </button>
          </>
        )}

        {sha && (
          <button
            onClick={handleDelete}
            disabled={saving}
            className="text-sm text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-400 transition-colors ml-auto disabled:opacity-50"
          >
            Delete
          </button>
        )}

        {/* Status bar */}
        <span className={`text-xs text-slate-400 dark:text-zinc-500 ${sha ? "" : "ml-auto"}`}>
          {status}
        </span>
      </div>

      {error && (
        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2">{error}</p>
      )}
    </div>
  );
}
