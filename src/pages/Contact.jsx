export default function Contact() {
  return (
    <div className="max-w-3xl mx-auto px-6 pt-20 pb-16">
      <h1 className="text-3xl font-semibold text-slate-900 mb-2">Contact</h1>
      <p className="text-slate-500 mb-12 max-w-lg">
        I&apos;m always happy to hear from people working on interesting
        problems. Whether it&apos;s research, a project idea, or just a question
        — feel free to reach out.
      </p>

      <div className="border border-slate-100 rounded-lg p-8 max-w-sm">
        <p className="text-xs text-slate-400 uppercase tracking-widest mb-3">
          Email
        </p>
        <a
          href="mailto:hieu.vm.nguyen@gmail.com"
          className="text-slate-900 font-medium hover:text-slate-600 transition-colors break-all"
        >
          hieu.vm.nguyen@gmail.com
        </a>
        <p className="text-sm text-slate-400 mt-3">
          I read every message and reply when I can.
        </p>
      </div>
    </div>
  );
}
