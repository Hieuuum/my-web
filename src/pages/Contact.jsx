const links = [
  { label: "Email", value: "hieu.vm.nguyen@gmail.com", href: "mailto:hieu.vm.nguyen@gmail.com" },
  { label: "LinkedIn", value: "linkedin.com/in/mhieuuu", href: "https://www.linkedin.com/in/mhieuuu/", external: true },
  { label: "GitHub", value: "github.com/Hieuuum", href: "https://github.com/Hieuuum", external: true },
];

export default function Contact() {
  return (
    <div className="max-w-3xl mx-auto px-6 pt-20 pb-16">
      <h1 className="text-3xl font-semibold text-slate-900 dark:text-zinc-100 mb-2">
        Contact
      </h1>
      <p className="text-slate-600 dark:text-zinc-300 mb-12 max-w-lg">
        I&apos;m always happy to hear from people working on interesting
        problems. Whether it&apos;s research, a project idea, or just a question
        — feel free to reach out.
      </p>

      <ul className="divide-y divide-slate-100 dark:divide-zinc-800 max-w-lg">
        {links.map((link) => (
          <li
            key={link.label}
            className="py-4 flex items-baseline justify-between gap-6"
          >
            <span className="text-xs text-slate-500 dark:text-zinc-400 uppercase tracking-widest shrink-0">
              {link.label}
            </span>
            <a
              href={link.href}
              {...(link.external && {
                target: "_blank",
                rel: "noopener noreferrer",
              })}
              className="text-slate-900 dark:text-zinc-100 hover:text-slate-600 dark:hover:text-zinc-300 transition-colors text-right break-all"
            >
              {link.value}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
