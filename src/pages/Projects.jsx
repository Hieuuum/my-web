const projects = [
  {
    title: "BioRT-Bench",
    date: "Apr 2026",
    description:
      "First multi-model multi-attack red-teaming benchmark for bio-misuse safeguards in frontier LLMs. Ran 640 scored attacks across 4 production models (Claude Sonnet 4.6, GPT-5.4, DeepSeek V4-flash, Kimi K2.5), 4 attack methods (direct, base64, PAIR, Crescendo), and 5 biosecurity categories. Built a calibrated bio-aware LLM judge extending StrongREJECT with specificity and actionability dimensions, implemented in Microsoft PyRIT with resumable runs and SHA-256 prompt versioning.",
    github: "https://github.com/Avi161/BioRT",
    writeup: "https://drive.google.com/file/d/1P5TbH7JXWmz5D_0xx0IEraIZ-Zba-gnA/view?usp=sharing",
    demo: null,
    tags: ["Red-teaming", "LLM Safety", "PyRIT", "Benchmark"],
  },
  {
    title: "Predicting LLM Chain-of-Thought Robustness",
    date: "Jan 2026",
    description:
      "Used L2-regularized linear probes on Qwen3-4B residual streams to predict CoT resilience with 75.4% accuracy, identifying Layer 13 as the peak encoding layer with 0.793 test AUC. Recovered an interpretable resilience direction via PCA across 7,000 sentences.",
    github: "https://github.com/Hieuuum/linear-cot",
    demo: null,
    writeup: "https://drive.google.com/file/d/1RMQQOB8xCZvf21oByvR3AvrQZLR9rDJc/view?usp=sharing",
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
      <h1 className="text-3xl font-semibold text-slate-900 dark:text-zinc-100 mb-2">
        Projects
      </h1>
      <p className="text-slate-500 dark:text-zinc-400 mb-12">
        Things I&apos;ve built or am currently building.
      </p>

      <ul className="divide-y divide-slate-100 dark:divide-zinc-800">
        {projects.map((project) => (
          <li key={project.title} className="py-8">
            <div className="flex items-baseline justify-between gap-4 mb-2">
              <h2 className="text-base font-medium text-slate-900 dark:text-zinc-100">
                {project.title}
              </h2>
              <span className="text-sm text-slate-400 dark:text-zinc-500 shrink-0">
                {project.date}
              </span>
            </div>
            <p className="text-slate-500 dark:text-zinc-400 text-sm leading-relaxed mb-3">
              {project.description}
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {project.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-0.5 border border-slate-200 dark:border-zinc-700 rounded text-slate-400 dark:text-zinc-500"
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
                  className="text-sm text-slate-400 dark:text-zinc-500 hover:text-slate-900 dark:hover:text-zinc-100 transition-colors"
                >
                  GitHub ↗
                </a>
              )}
              {project.writeup && (
                <a
                  href={project.writeup}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-slate-400 dark:text-zinc-500 hover:text-slate-900 dark:hover:text-zinc-100 transition-colors"
                >
                  Writeup ↗
                </a>
              )}
              {project.demo && (
                <a
                  href={project.demo}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-slate-400 dark:text-zinc-500 hover:text-slate-900 dark:hover:text-zinc-100 transition-colors"
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
