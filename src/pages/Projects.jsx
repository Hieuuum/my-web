const projects = [
  {
    title: "Predicting LLM Chain-of-Thought Robustness",
    date: "Jan 2026",
    description:
      "Used L2-regularized linear probes on Qwen3-4B residual streams to predict CoT resilience with 75.4% accuracy, identifying Layer 13 as the peak encoding layer with 0.793 test AUC. Recovered an interpretable resilience direction via PCA across 7,000 sentences.",
    github: "https://github.com/Hieuuum/linear-cot",
    demo: null,
    tags: ["Mechanistic Interpretability", "Python", "Linear Probing"],
  },
  {
    title: "PhishSTX",
    date: "Nov 2025",
    description:
      "Phishing email classifier using an NLP preprocessing pipeline with NLTK and balanced undersampling on 50,000 entries. Evaluated 5 ML models, achieving 97.7% accuracy and 0.98 F1 with LightGBM.",
    github: "https://github.com/Hieuuum/phish-stx",
    demo: "https://phish-stx-deda6n8vytgxa5jzqmmref.streamlit.app/",
    tags: ["NLP", "LightGBM", "Python"],
  },
  {
    title: "The Anvil",
    date: "Aug 2025",
    description:
      "Full-stack productivity app built with React, Express, and Postgres, supporting 14 concurrent users across 200+ focused work sessions. Features an AI productivity coach via GPT-4o, deployed with CI/CD on Vercel.",
    github: "https://github.com/Hieuuum/the-anvil",
    demo: "https://the-anvil.vercel.app/",
    tags: ["React", "Express", "PostgreSQL", "GPT-4o"],
  },
];

export default function Projects() {
  return (
    <div className="max-w-3xl mx-auto px-6 pt-20 pb-16">
      <h1 className="text-3xl font-semibold text-slate-900 mb-2">Projects</h1>
      <p className="text-slate-500 mb-12">
        Things I&apos;ve built or am currently building.
      </p>

      <ul className="divide-y divide-slate-100">
        {projects.map((project) => (
          <li key={project.title} className="py-8">
            <div className="flex items-baseline justify-between gap-4 mb-2">
              <h2 className="text-base font-medium text-slate-900">
                {project.title}
              </h2>
              <span className="text-sm text-slate-400 shrink-0">
                {project.date}
              </span>
            </div>
            <p className="text-slate-500 text-sm leading-relaxed mb-3">
              {project.description}
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {project.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-0.5 border border-slate-200 rounded text-slate-400"
                >
                  {tag}
                </span>
              ))}
            </div>
            <div className="flex gap-4">
              {project.github && (
                <a
                  href={project.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-slate-400 hover:text-slate-900 transition-colors"
                >
                  GitHub ↗
                </a>
              )}
              {project.demo && (
                <a
                  href={project.demo}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-slate-400 hover:text-slate-900 transition-colors"
                >
                  Demo ↗
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
