// Rewrites ```mermaid fences into a standalone <mermaid-diagram> hast element
// (mdComponents.jsx renders it) before rehypeShikiFromHighlighter runs, so
// Shiki never treats the diagram source as a code block to highlight.
import { visit } from "unist-util-visit";

export function remarkMermaid() {
  return (tree) => {
    visit(tree, "code", (node) => {
      if (node.lang !== "mermaid") return;
      node.type = "mermaidDiagram";
      node.data = {
        hName: "mermaid-diagram",
        hChildren: [{ type: "text", value: node.value }],
      };
    });
  };
}
