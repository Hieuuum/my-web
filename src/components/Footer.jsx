export default function Footer() {
  return (
    <footer className="border-t border-slate-100 dark:border-zinc-800 py-8 mt-24">
      <div className="max-w-3xl mx-auto px-6 flex items-center justify-between text-sm text-slate-400 dark:text-zinc-500">
        <span>© {new Date().getFullYear()} Hieu Nguyen</span>
        <div className="flex gap-4">
          <a
            href="mailto:hieu.vm.nguyen@gmail.com"
            className="hover:text-slate-700 dark:hover:text-zinc-200 transition-colors"
          >
            Email
          </a>
          <a
            href="https://github.com/Hieuuum"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-700 dark:hover:text-zinc-200 transition-colors"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
