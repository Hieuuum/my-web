// Shared react-markdown renderers so the admin preview and the published post
// render identically. An image given a markdown *title* renders as a captioned
// figure — the title text becomes the caption:
//
//   ![alt text](/images/photo.png "This shows up as the caption")
//
// An optional size hint may be appended to the alt text after a pipe — width
// alone keeps the aspect ratio, "WxH" forces both (standard width × height):
//
//   ![alt|400](…)      → 400px wide, height auto
//   ![alt|400x300](…)  → 400×300px
//
// The hint is stripped from the rendered alt so accessibility text stays clean.
// (A plain `<span>` wrapper is used instead of <figure> so it stays valid
// inside the paragraph react-markdown wraps lone images in.)
function parseSize(alt) {
  const m = /^(.*)\|(\d+)(?:x(\d+))?$/.exec(alt || "");
  if (!m) return { alt, style: undefined };
  const style = { width: `${m[2]}px`, maxWidth: "100%" };
  if (m[3]) style.height = `${m[3]}px`;
  return { alt: m[1], style };
}

export const mdComponents = {
  img({ node, title, alt, ...props }) {
    const { alt: cleanAlt, style } = parseSize(alt);
    const img = <img {...props} alt={cleanAlt} style={style} />;
    if (!title) return img;
    return (
      <span className="block">
        {img}
        <span className="block text-center text-sm text-slate-500 dark:text-zinc-400 mt-2">
          {title}
        </span>
      </span>
    );
  },
};
