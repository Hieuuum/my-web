import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api";

export default function PostList() {
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      const data = await api.getPosts();
      setPosts(data);
    } catch (err) {
      setError("Failed to load posts.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(post) {
    if (!window.confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    try {
      await api.deletePost(post.slug, post.sha);
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-zinc-100">Posts</h1>
        <Link
          to="/admin/posts/new"
          className="text-sm text-slate-900 dark:text-zinc-100 hover:text-slate-600 dark:hover:text-zinc-400 transition-colors"
        >
          New post
        </Link>
      </div>

      {error && <p className="text-sm text-slate-500 dark:text-zinc-400 mb-4">{error}</p>}

      {posts === null && !error && (
        <p className="text-sm text-slate-400 dark:text-zinc-500">Loading…</p>
      )}

      {posts && posts.length === 0 && (
        <p className="text-sm text-slate-400 dark:text-zinc-500">No posts yet.</p>
      )}

      {posts && posts.length > 0 && (
        <div className="divide-y divide-slate-100 dark:divide-zinc-800">
          {posts.map((post) => (
            <div key={post.slug} className="flex items-center justify-between py-3">
              <div className="min-w-0 flex-1">
                <Link
                  to={`/admin/posts/${post.slug}`}
                  className="text-sm text-slate-900 dark:text-zinc-100 hover:text-slate-600 dark:hover:text-zinc-400 transition-colors"
                >
                  {post.title || <span className="italic text-slate-400 dark:text-zinc-500">Untitled</span>}
                </Link>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-slate-400 dark:text-zinc-500">{post.date}</span>
                  {post.draft && (
                    <span className="text-xs text-slate-400 dark:text-zinc-500">Draft</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDelete(post)}
                className="text-xs text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300 transition-colors ml-4 shrink-0"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
