import { useRef, useCallback, useLayoutEffect } from "react";

// Pause- and word-coalesced undo/redo for a React-controlled <textarea>.
//
// A controlled textarea can't rely on the browser's native undo: React reassigns
// `value` on every keystroke, which splits the native stack into per-character
// steps (so Ctrl+Z reverts one character at a time), and the execCommand-based
// programmatic inserts fragment it further. So we keep our own history.
//
// Consecutive edits collapse into a single undo step while they stay the same
// kind (typing vs. deleting vs. whitespace) and land within COALESCE_MS of each
// other; a pause, a kind change, or an explicit break() — used for discrete
// actions like inserting an image — begins a fresh step. Ctrl/Cmd+Z undoes;
// Ctrl/Cmd+Shift+Z and Ctrl+Y redo.

const COALESCE_MS = 500;

function editKind(prevLen, value, caret) {
  if (value.length < prevLen) return "del";
  return /\s/.test(value[caret - 1] ?? "") ? "space" : "type";
}

function seed(value) {
  return {
    entries: [{ value, selStart: value.length, selEnd: value.length }],
    index: 0,
    time: 0,
    kind: null,
    forceBreak: true,
  };
}

export function useUndoHistory(textareaRef, setValue) {
  const hist = useRef(null);
  if (hist.current === null) hist.current = seed("");
  const pendingSel = useRef(null);

  // Seed the history with a value loaded from outside (post load, draft restore).
  const reset = useCallback((value) => {
    hist.current = seed(value);
  }, []);

  // Record an edit made through the textarea's own input event.
  const record = useCallback((value, selStart, selEnd) => {
    const h = hist.current;
    const cur = h.entries[h.index];
    if (value === cur.value) return;
    const kind = editKind(cur.value.length, value, selEnd);
    const now = Date.now();
    const coalesce = !h.forceBreak && kind === h.kind && now - h.time < COALESCE_MS;
    if (h.index < h.entries.length - 1) h.entries.length = h.index + 1; // drop redo tail
    if (coalesce) {
      h.entries[h.index] = { value, selStart, selEnd };
    } else {
      h.entries.push({ value, selStart, selEnd });
      h.index++;
    }
    h.time = now;
    h.kind = kind;
    h.forceBreak = false;
  }, []);

  // Force the next recorded edit to begin a new undo step.
  const breakStep = useCallback(() => {
    hist.current.forceBreak = true;
  }, []);

  const go = useCallback((delta) => {
    const h = hist.current;
    const next = h.index + delta;
    if (next < 0 || next >= h.entries.length) return;
    h.index = next;
    h.forceBreak = true; // an edit after undo/redo starts its own step
    const snap = h.entries[next];
    pendingSel.current = { start: snap.selStart, end: snap.selEnd };
    setValue(snap.value);
  }, [setValue]);

  // Returns true when it handled the key, so the caller can stop.
  const onKeyDown = useCallback((e) => {
    if (!(e.metaKey || e.ctrlKey)) return false;
    const key = e.key.toLowerCase();
    if (key === "z" && !e.shiftKey) { e.preventDefault(); go(-1); return true; }
    if ((key === "z" && e.shiftKey) || key === "y") { e.preventDefault(); go(1); return true; }
    return false;
  }, [go]);

  // Restore the caret after an undo/redo re-render — the new value is in the DOM
  // by now, so setSelectionRange lands at the right offset.
  useLayoutEffect(() => {
    const sel = pendingSel.current;
    if (!sel) return;
    pendingSel.current = null;
    const ta = textareaRef.current;
    if (ta) {
      ta.focus();
      ta.setSelectionRange(sel.start, sel.end);
    }
  });

  return { reset, record, breakStep, onKeyDown };
}
