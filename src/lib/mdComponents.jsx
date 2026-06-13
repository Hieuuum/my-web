// Shared react-markdown renderers so the admin preview and the published post
// render identically. An image given a markdown *title* renders as a captioned
// figure — the title text becomes the caption:
//
//   ![alt text](/images/photo.png "This shows up as the caption")
//
// (A plain `<span>` wrapper is used instead of <figure> so it stays valid
// inside the paragraph react-markdown wraps lone images in.)
export const mdComponents = {
  img({ node, title, ...props }) {
    if (!title) return <img {...props} />;
    return (
      <span className="block">
        <img {...props} />
        <span className="block text-center text-sm text-slate-500 dark:text-zinc-400 mt-2">
          {title}
        </span>
      </span>
    );
  },
};
