// Renders a mermaid diagram from source text. Loaded via dynamic import so
// pages/posts without diagrams don't pay for it. Colors are pinned to the
// site's grayscale slate/zinc palette (mermaid's built-in themes are not
// grayscale) via `theme: "base"` + themeVariables. Mermaid bakes colors into
// the SVG at render time rather than exposing them as CSS variables, so —
// unlike Shiki's dual-theme CSS-var trick — switching light/dark means
// re-rendering; a MutationObserver on <html class> triggers that.
import { useEffect, useId, useRef, useState } from "react";

let mermaidPromise;
function loadMermaid() {
  if (!mermaidPromise) mermaidPromise = import("mermaid").then((m) => m.default);
  return mermaidPromise;
}

const THEME_VARIABLES = {
  light: {
    background: "#f1f5f9", // slate-100
    primaryColor: "#ffffff",
    primaryBorderColor: "#cbd5e1", // slate-300
    primaryTextColor: "#0f172a", // slate-900
    lineColor: "#94a3b8", // slate-400
    secondaryColor: "#f1f5f9",
    tertiaryColor: "#f8fafc",
    textColor: "#334155", // slate-700
    mainBkg: "#ffffff",
    nodeBorder: "#cbd5e1",
    clusterBkg: "#f8fafc",
    clusterBorder: "#e2e8f0",
    edgeLabelBackground: "#f1f5f9",
    fontFamily: "Inter, system-ui, sans-serif",
  },
  dark: {
    background: "#18181b", // zinc-900
    primaryColor: "#27272a", // zinc-800
    primaryBorderColor: "#52525b", // zinc-600
    primaryTextColor: "#f4f4f5", // zinc-100
    lineColor: "#71717a", // zinc-500
    secondaryColor: "#18181b",
    tertiaryColor: "#09090b",
    textColor: "#d4d4d8", // zinc-300
    mainBkg: "#27272a",
    nodeBorder: "#52525b",
    clusterBkg: "#09090b",
    clusterBorder: "#3f3f46",
    edgeLabelBackground: "#18181b",
    fontFamily: "Inter, system-ui, sans-serif",
  },
};

function isDarkMode() {
  return document.documentElement.classList.contains("dark");
}

export function MermaidDiagram({ children }) {
  const id = `mermaid-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const code = Array.isArray(children) ? children.join("") : children || "";
  const [svg, setSvg] = useState(null);
  const [dark, setDark] = useState(isDarkMode);

  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDarkMode()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadMermaid().then((mermaid) => {
      if (cancelled) return;
      mermaid.initialize({
        startOnLoad: false,
        theme: "base",
        themeVariables: dark ? THEME_VARIABLES.dark : THEME_VARIABLES.light,
      });
      mermaid
        .render(id, code)
        .then((result) => {
          if (!cancelled) setSvg(result.svg);
        })
        // Invalid/incomplete syntax (e.g. mid-keystroke in the admin editor)
        // — keep showing the last good render instead of an error box.
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [id, code, dark]);

  return (
    <div className="not-prose my-6 overflow-x-auto rounded border border-slate-300 bg-slate-100 p-4 dark:border-zinc-700 dark:bg-zinc-900">
      {svg ? (
        <div className="flex justify-center [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <p className="text-sm text-slate-500 dark:text-zinc-400">Rendering diagram…</p>
      )}
    </div>
  );
}
