import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAllPosts } from "../lib/posts";

export default function Home() {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    getAllPosts().then((all) => setPosts(all.slice(0, 3)));
  }, []);

  return (
    <>
      {/* About */}
      <section id="about" className="max-w-4xl mx-auto px-6 pt-24 pb-16">
        <div className="grid md:grid-cols-[1fr_auto] gap-10 md:gap-12 items-start">
          <div>
            <h1 className="mb-8">
              <span className="block text-base text-slate-400 mb-1">
                Hi, I&apos;m
              </span>
              <span className="text-5xl sm:text-6xl font-semibold text-slate-900">
                Hieu
              </span>
            </h1>
            <div className="space-y-4 text-slate-600 leading-relaxed">
              <p>
                Undergraduate at Union College studying Computer Science and
                Mathematics. I&apos;m interested in AI safety, making current AI
                systems more aligned. Currently doing research at Algoverse to
                interpret models thinking in continuous latent space instead of
                natural language.
              </p>
            </div>
            <div className="flex gap-4 mt-8">
              <Link
                to="/projects"
                className="px-5 py-2.5 bg-slate-900 text-white text-sm rounded-md hover:bg-slate-700 transition-colors"
              >
                View projects
              </Link>
              <Link
                to="/contact"
                className="px-5 py-2.5 border border-slate-200 text-slate-700 text-sm rounded-md hover:border-slate-400 transition-colors"
              >
                Get in touch
              </Link>
            </div>
          </div>
          <div
            role="img"
            aria-label="Hieu"
            className="w-40 sm:w-52 md:w-56 aspect-square rounded-md order-first md:order-none bg-no-repeat"
            style={{
              backgroundImage: "url('/img/IMG_7106.JPG')",
              backgroundSize: "260%",
              backgroundPosition: "61% 59%",
            }}
          />
        </div>
      </section>

      {/* Recent posts */}
      {posts.length > 0 && (
        <section className="max-w-3xl mx-auto px-6 py-16 border-t border-slate-100">
          <div className="flex items-baseline justify-between mb-8">
            <h2 className="text-xs text-slate-400 tracking-widest uppercase">
              Recent Writing
            </h2>
            <Link
              to="/blog"
              className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
            >
              All posts →
            </Link>
          </div>
          <ul className="space-y-6">
            {posts.map((post) => (
              <li key={post.slug}>
                <Link to={`/blog/${post.slug}`} className="group block">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-slate-900 group-hover:text-slate-600 transition-colors">
                      {post.data.title}
                    </span>
                    <span className="text-sm text-slate-400 shrink-0">
                      {post.data.date}
                    </span>
                  </div>
                  {post.data.excerpt && (
                    <p className="text-sm text-slate-500 mt-1">
                      {post.data.excerpt}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
