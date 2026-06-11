import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAllPosts } from "../lib/posts";

export default function Blog() {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    getAllPosts().then(setPosts);
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-6 pt-20 pb-16">
      <h1 className="text-3xl font-semibold text-slate-900 dark:text-zinc-100 mb-2">
        Writing
      </h1>
      <p className="text-slate-600 dark:text-zinc-300 mb-3">
        Notes on research, engineering, and whatever else I&apos;m thinking
        about.
      </p>
      <a
        href="https://substack.com/@mhieuuu/posts"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block mb-12 text-sm text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-zinc-100 transition-colors"
      >
        Also on Substack →
      </a>

      {posts.length === 0 ? (
        <p className="text-slate-500 dark:text-zinc-400">No posts yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-zinc-800">
          {posts.map((post) => (
            <li key={post.slug} className="py-7">
              <Link to={`/blog/${post.slug}`} className="group block">
                <div className="flex items-baseline justify-between gap-4 mb-1">
                  <h2 className="text-lg font-medium text-slate-900 dark:text-zinc-100 group-hover:text-slate-700 dark:group-hover:text-zinc-300 transition-colors">
                    {post.data.title}
                  </h2>
                  <span className="text-sm text-slate-500 dark:text-zinc-400 shrink-0">
                    {post.data.date}
                  </span>
                </div>
                {post.data.excerpt && (
                  <p className="text-slate-600 dark:text-zinc-300 text-sm leading-relaxed">
                    {post.data.excerpt}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
