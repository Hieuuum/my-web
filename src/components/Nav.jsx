import { Link } from "react-router-dom";
import { useState } from "react";
import ThemeToggle from "./ThemeToggle";

const links = [
  { to: "/#about", label: "About" },
  { to: "/blog", label: "Blog" },
  { to: "/projects", label: "Projects" },
  { to: "/contact", label: "Contact" },
];

export default function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white/90 dark:bg-zinc-950/90 backdrop-blur border-b border-slate-100 dark:border-zinc-800">
      <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link
          to="/"
          className="font-medium text-slate-900 dark:text-zinc-100 tracking-tight"
        >
          Hieu Nguyen
        </Link>

        {/* desktop */}
        <nav className="hidden sm:flex items-center gap-6">
          {links.map(({ to, label }) =>
            to.startsWith("/#") ? (
              <a
                key={label}
                href={to}
                className="text-sm text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-zinc-100 transition-colors"
              >
                {label}
              </a>
            ) : (
              <Link
                key={label}
                to={to}
                className="text-sm text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-zinc-100 transition-colors"
              >
                {label}
              </Link>
            )
          )}
          <ThemeToggle />
        </nav>

        {/* mobile controls */}
        <div className="sm:hidden flex items-center gap-3">
          <ThemeToggle />
          <button
            className="text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-zinc-100"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {open ? (
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* mobile menu */}
      {open && (
        <div className="sm:hidden border-t border-slate-100 dark:border-zinc-800 px-6 py-4 flex flex-col gap-4">
          {links.map(({ to, label }) =>
            to.startsWith("/#") ? (
              <a
                key={label}
                href={to}
                className="text-sm text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-zinc-100"
                onClick={() => setOpen(false)}
              >
                {label}
              </a>
            ) : (
              <Link
                key={label}
                to={to}
                className="text-sm text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-zinc-100"
                onClick={() => setOpen(false)}
              >
                {label}
              </Link>
            )
          )}
        </div>
      )}
    </header>
  );
}
