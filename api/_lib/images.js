// Helpers for per-post image storage under public/images/posts/{slug}/.
// Post images live at public/images/posts/{slug}/{filename} and are served from
// /images/posts/{slug}/{filename}. Site-level images stay flat in public/images/.
// Sharing these pure functions keeps the upload and rename handlers in sync
// (and lets a node script test them).

export function postImageDir(slug) {
  return `public/images/posts/${slug}`;
}

export function postImageRepoPath(slug, filename) {
  return `public/images/posts/${slug}/${filename}`;
}

export function postImageUrl(slug, filename) {
  return `/images/posts/${slug}/${filename}`;
}

// Rewrite every reference to a post's image folder when its slug changes.
// Matches the exact "/images/posts/{oldSlug}/" prefix so flat images and other
// posts' folders are left untouched.
export function rewriteImageRefs(content, oldSlug, newSlug) {
  if (!oldSlug || !newSlug || oldSlug === newSlug) return content;
  return content.split(`/images/posts/${oldSlug}/`).join(`/images/posts/${newSlug}/`);
}
