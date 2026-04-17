import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getPost } from "../lib/posts";

export default function BlogPost() {
  const { slug } = useParams();
  const [post, setPost] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    getPost(slug).then((p) => {
      if (!p) setNotFound(true);
      else setPost(p);
    });
  }, [slug]);

  if (notFound) {
    return (
      <div className="max-w-3xl mx-auto px-6 pt-20">
        <p className="text-slate-500">Post not found.</p>
        <Link
          to="/blog"
          className="text-sm text-slate-900 underline mt-4 inline-block"
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
        className="text-sm text-slate-400 hover:text-slate-900 transition-colors mb-10 inline-block"
      >
        ← Writing
      </Link>
      <header className="mb-12">
        <h1 className="text-3xl font-semibold text-slate-900 leading-snug mb-3">
          {post.data.title}
        </h1>
        <p className="text-sm text-slate-400">{post.data.date}</p>
      </header>
      <div className="prose prose-slate max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {post.content}
        </ReactMarkdown>
      </div>
    </article>
  );
}
