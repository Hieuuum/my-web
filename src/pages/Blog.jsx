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
      <h1 className="text-3xl font-semibold text-slate-900 mb-2">Writing</h1>
      <p className="text-slate-500 mb-12">
        Notes on research, engineering, and whatever else I&apos;m thinking
        about.
      </p>

      {posts.length === 0 ? (
        <p className="text-slate-400">No posts yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {posts.map((post) => (
            <li key={post.slug} className="py-7">
              <Link to={`/blog/${post.slug}`} className="group block">
                <div className="flex items-baseline justify-between gap-4 mb-1">
                  <h2 className="text-lg font-medium text-slate-900 group-hover:text-slate-600 transition-colors">
                    {post.data.title}
                  </h2>
                  <span className="text-sm text-slate-400 shrink-0">
                    {post.data.date}
                  </span>
                </div>
                {post.data.excerpt && (
                  <p className="text-slate-500 text-sm leading-relaxed">
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
