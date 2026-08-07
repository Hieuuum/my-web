import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAllPosts } from "../lib/posts";

const aboutLinks = [
  { label: "Email", href: "mailto:hieu.vm.nguyen@gmail.com" },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/mhieuuu/", external: true },
  { label: "Substack", href: "https://substack.com/@mhieuuu/posts", external: true },
  { label: "Resume", href: "/resume.pdf", external: true },
  { label: "CV", href: "/cv.pdf", external: true },
  { label: "GitHub", href: "https://github.com/Hieuuum", external: true },
];

export default function Home() {
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    getAllPosts().then((all) => setPosts(all.slice(0, 3)));
  }, []);

  return (
    <>
      {/* About */}
      <section id="about" className="max-w-3xl mx-auto px-6 pt-24 pb-16">
        <div className="grid md:grid-cols-[1fr_auto] gap-10 md:gap-12 items-start">
          <div>
            <h1 className="mb-8">
              <span className="block text-base text-slate-500 dark:text-zinc-400 mb-1">
                Hi, I&apos;m
              </span>
              <span className="text-5xl sm:text-6xl font-semibold text-slate-900 dark:text-zinc-100">
                Hieu
              </span>
            </h1>
            <div className="space-y-4 text-slate-700 dark:text-zinc-300 leading-relaxed">
              <p>
                Undergraduate at Union College studying Computer Science and
                Mathematics. I&apos;m interested in AI safety, making current AI
                systems more aligned. Currently doing research at{" "}
                <a
                  href="https://caish.org/mars"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-900 dark:text-zinc-100 underline"
                >
                  MARS V
                </a>{" "}
                under{" "}
                <a
                  href="https://superkaiba.github.io/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-900 dark:text-zinc-100 underline"
                >
                  Thomas Jiralerspong
                </a>{" "}
                to understand the mechanistic difference between eliciting
                tasks a model already knows and teaching it new tasks.
              </p>
            </div>
            <div className="flex gap-4 mt-8">
              <Link
                to="/projects"
                className="px-5 py-2.5 bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm rounded-md hover:bg-slate-700 dark:hover:bg-zinc-300 transition-colors"
              >
                View projects
              </Link>
              <Link
                to="/contact"
                className="px-5 py-2.5 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-200 text-sm rounded-md hover:border-slate-400 dark:hover:border-zinc-500 transition-colors"
              >
                Get in touch
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-600 dark:text-zinc-300">
              {aboutLinks.map((link, i) => (
                <span key={link.label} className="flex items-center gap-x-3">
                  {i > 0 && <span className="text-slate-300 dark:text-zinc-600">·</span>}
                  <a
                    href={link.href}
                    {...(link.external && {
                      target: "_blank",
                      rel: "noopener noreferrer",
                    })}
                    className="hover:text-slate-900 dark:hover:text-zinc-100 transition-colors"
                  >
                    {link.label}
                  </a>
                </span>
              ))}
            </div>
          </div>
          <div
            role="img"
            aria-label="Hieu"
            className="w-40 sm:w-52 md:w-56 aspect-square rounded-md order-first md:order-none bg-no-repeat"
            style={{
              backgroundImage: "url('/images/IMG_7106.JPG')",
              backgroundSize: "260%",
              backgroundPosition: "61% 59%",
            }}
          />
        </div>
      </section>

      {/* Recent posts */}
      {posts.length > 0 && (
        <section className="max-w-3xl mx-auto px-6 py-16 border-t border-slate-100 dark:border-zinc-800">
          <div className="flex items-baseline justify-between mb-8">
            <h2 className="text-xs text-slate-500 dark:text-zinc-400 tracking-widest uppercase">
              Recent Writing
            </h2>
            <Link
              to="/blog"
              className="text-sm text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-zinc-100 transition-colors"
            >
              All posts →
            </Link>
          </div>
          <ul className="space-y-6">
            {posts.map((post) => (
              <li key={post.slug}>
                <Link to={`/blog/${post.slug}`} className="group block">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-slate-900 dark:text-zinc-100 group-hover:text-slate-700 dark:group-hover:text-zinc-300 transition-colors">
                      {post.data.title}
                    </span>
                    <span className="text-sm text-slate-500 dark:text-zinc-400 shrink-0">
                      {post.data.date}
                    </span>
                  </div>
                  {post.data.excerpt && (
                    <p className="text-sm text-slate-600 dark:text-zinc-300 mt-1">
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
