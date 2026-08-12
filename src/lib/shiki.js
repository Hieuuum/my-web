// Shared Shiki highlighter for fenced code blocks, used by both the public
// BlogPost view and the admin editor preview. react-markdown processes
// synchronously, so the highlighter must be fully built (all languages
// loaded) before it's handed to the rehype plugin — hence the singleton
// promise plus a hook that renders unhighlighted code until it resolves,
// rather than passing an async plugin straight into ReactMarkdown.
import { useEffect, useState } from "react";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

// Languages actually used in posts today, plus common ones for a software
// blog. Anything else falls back to plain text (see fallbackLanguage below)
// instead of throwing — add a language here if a post needs it.
const LANGS = [
  import("@shikijs/langs/python"),
  import("@shikijs/langs/javascript"),
  import("@shikijs/langs/typescript"),
  import("@shikijs/langs/jsx"),
  import("@shikijs/langs/tsx"),
  import("@shikijs/langs/bash"),
  import("@shikijs/langs/json"),
  import("@shikijs/langs/yaml"),
  import("@shikijs/langs/html"),
  import("@shikijs/langs/css"),
  import("@shikijs/langs/markdown"),
];

// VS Code's actual "Dark Modern" / "Light Modern" themes inherit their
// tokenColors unchanged from "Dark+" / "Light+" — Shiki bundles those exact
// theme files, so this reproduces real VS Code syntax highlighting.
const THEMES = [import("@shikijs/themes/light-plus"), import("@shikijs/themes/dark-plus")];

export const shikiThemes = { light: "light-plus", dark: "dark-plus" };

let highlighterPromise;

function getShikiHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      langs: LANGS,
      themes: THEMES,
      engine: createJavaScriptRegexEngine(),
    });
  }
  return highlighterPromise;
}

export function useShikiHighlighter() {
  const [highlighter, setHighlighter] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getShikiHighlighter().then((h) => {
      if (!cancelled) setHighlighter(h);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return highlighter;
}
