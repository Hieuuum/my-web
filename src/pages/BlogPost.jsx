import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { getPost } from "../lib/posts";
import { mdComponents } from "../lib/mdComponents.jsx";

export default function BlogPost() {
  const { slug } = useParams();
  const [post, setPost] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setPost(null);
    setNotFound(false);
    getPost(slug).then((p) => {
      if (!p) setNotFound(true);
      else setPost(p);
      setLoading(false);
    });
  }, [slug]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-6 pt-16">
        <p className="text-slate-500 dark:text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="max-w-3xl mx-auto px-6 pt-20">
        <p className="text-slate-600 dark:text-zinc-300">Post not found.</p>
        <Link
          to="/blog"
          className="text-sm text-slate-900 dark:text-zinc-100 underline mt-4 inline-block"
        >
          ← Back to writing
        </Link>
      </div>
    );
  }

  if (!post) return null;

  return (
    <article className="max-w-3xl mx-auto px-6 pt-16 pb-16">
      <Link
        to="/blog"
        className="text-sm text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 transition-colors mb-10 inline-block"
      >
        ← Writing
      </Link>
      <header className="mb-12">
        <h1 className="font-sfpro text-3xl font-semibold text-slate-900 dark:text-zinc-100 leading-snug mb-3">
          {post.data.title}
        </h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400">
          {post.data.date}
        </p>
      </header>
      <div className="prose prose-slate dark:prose-invert max-w-none font-serif prose-headings:font-sfpro prose-code:font-mono prose-pre:font-mono">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          remarkRehypeOptions={{ footnoteLabel: "References", footnoteLabelProperties: {} }}
          components={mdComponents}
        >
          {post.content}
        </ReactMarkdown>
      </div>
    </article>
  );
}
