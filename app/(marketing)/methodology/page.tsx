import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";
import { getMethodsData } from "@/lib/methodology/methods";
import { MethodologyContent } from "./methodology-content";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Methodology",
    path: "/methodology",
    description:
      "Research-backed citability methods drawn from real studies. See how VisibleAU measures AI search visibility.",
  });
}

const RESEARCH_SOURCES = [
  {
    name: "Aggarwal et al., GEO (Princeton, KDD 2024)",
    description:
      "Generative Engine Optimization — method-level visibility improvements on GEO-bench",
    url: "https://arxiv.org/abs/2311.09735",
  },
  {
    name: "Ahrefs Q1-2026 AI Search Benchmark (75K brands)",
    description:
      "Correlation analysis across 75,000 brands — identifies signals associated with AI visibility",
    url: "https://ahrefs.com/blog/ai-brand-visibility-correlations/",
  },
  {
    name: "SE Ranking 2025 ChatGPT Citation Study",
    description:
      "Analysis of ~129K domains and 216K pages cited by ChatGPT",
  },
  {
    name: "BrightEdge",
    description:
      "Structured data and FAQ schema impact on AI search citations and AI Overview appearances",
  },
  {
    name: "Onely",
    description:
      "Analysis of ChatGPT commercial recommendation sources — industry lists, awards, reviews",
  },
  {
    name: "Zyppy / Leapd",
    description:
      "Citation position analysis — where on a page LLM citations originate",
    url: "https://www.leapd.ai/blog/ai-visibility/how-chatgpt-google-ai-overviews-and-perplexity-source-information-in-2026",
  },
  {
    name: "AirOps",
    description:
      "Heading structure and content organisation impact on AI citation likelihood",
  },
] as const;

export default async function MethodologyPage() {
  const { top10, all, total } = getMethodsData();
  const remaining = all.slice(10);

  return (
    <article className="max-w-4xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-4">VisibleAU Methodology</h1>
      <p className="text-muted-foreground mb-10">
        Our recommendations draw on published research into how AI engines
        choose what to cite — including the Princeton GEO study (KDD 2024),
        Ahrefs&apos; 75,000-brand AI visibility benchmark, and large-scale
        citation analyses from SE Ranking, BrightEdge and others. Below are{" "}
        {top10.length} of the highest-impact methods; effect sizes are reported
        as measured by each source (some are correlations, not guaranteed lifts).
      </p>

      <div className="space-y-4 mb-10">
        {top10.map((m) => (
          <div key={m.id} className="rounded-xl border p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold">{m.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {m.description}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="inline-block rounded-full bg-primary/10 text-primary text-sm font-semibold px-3 py-1">
                  {m.effectSizeDelta}
                </span>
              </div>
            </div>
            <div className="flex gap-3 mt-3 text-xs text-muted-foreground">
              <span className="rounded bg-muted px-2 py-0.5">
                {m.dimension}
              </span>
              <span className="rounded bg-muted px-2 py-0.5">
                Effort: {m.effort}
              </span>
              <span className="rounded bg-muted px-2 py-0.5">
                {m.citationUrl ? (
                  <a
                    href={m.citationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {m.citation}
                  </a>
                ) : (
                  m.citation
                )}
              </span>
            </div>
          </div>
        ))}
      </div>

      {remaining.length > 0 && (
        <MethodologyContent remaining={remaining} total={total} />
      )}

      <section className="mt-16 border-t pt-10">
        <h2 className="text-xl font-bold mb-4">Research Citations</h2>
        <ul className="space-y-3 text-sm text-muted-foreground">
          {RESEARCH_SOURCES.map((src) => (
            <li key={src.name}>
              <strong className="text-foreground">
                {"url" in src && src.url ? (
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {src.name}
                  </a>
                ) : (
                  src.name
                )}
              </strong>{" "}
              — {src.description}
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
