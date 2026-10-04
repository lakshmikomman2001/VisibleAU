import type { Metadata } from "next";
import { getMethodsData } from "@/lib/methodology/methods";
import { buildMetadata } from "@/lib/seo/metadata";
import { MethodologyContent } from "./methodology-content";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Methodology",
    path: "/methodology",
    description:
      "Research-backed citability methods drawn from real studies. See how VisibleAU measures AI search visibility.",
  });
}

// ⚠️ Every entry here must have a `url` that actually opens and actually
// contains the described finding -- task NN removed an entry for a
// fabricated "SE Ranking 2025 ChatGPT Citation Study" that doesn't exist
// (confirmed: no such study, anywhere), plus three entries (BrightEdge,
// Onely, AirOps) that no CITABILITY_METHODS entry cites with a verified
// figure any more. No aggregator-only, secondhand, or unsourced entries.
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
    name: "Ahrefs — Schema & AI Citations (1,885 pages, Aug 2025–Mar 2026)",
    description:
      "Tracked AI citations before/after adding JSON-LD schema; found no statistically significant lift for ChatGPT or Google AI Mode — schema alone doesn't reliably move AI citations",
    url: "https://ahrefs.com/blog/schema-ai-citations/",
  },
  {
    name: "Zyppy / Leapd",
    description: "Citation position analysis — where on a page LLM citations originate",
    url: "https://www.leapd.ai/blog/ai-visibility/how-chatgpt-google-ai-overviews-and-perplexity-source-information-in-2026",
  },
] as const;

export default async function MethodologyPage() {
  const { top10, all, total } = getMethodsData();
  const remaining = all.slice(10);

  return (
    <article className="max-w-4xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-4">VisibleAU Methodology</h1>
      <p className="text-muted-foreground mb-10">
        Our recommendations draw on published research into how AI engines choose what to cite —
        including the Princeton GEO study (KDD 2024) and Ahrefs&apos; large-scale AI citation
        studies. Below are {top10.length} of the highest-impact methods; effect sizes are reported
        as measured by each source (some are correlations, not guaranteed lifts, and some methods
        are directional best practices without a precisely verified figure).
      </p>

      <div className="space-y-4 mb-10">
        {top10.map((m) => (
          <div key={m.id} className="rounded-xl border p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold">{m.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{m.description}</p>
              </div>
              <div className="text-right shrink-0">
                <span className="inline-block rounded-full bg-primary/10 text-primary text-sm font-semibold px-3 py-1">
                  {m.effectSizeDelta}
                </span>
              </div>
            </div>
            <div className="flex gap-3 mt-3 text-xs text-muted-foreground">
              <span className="rounded bg-muted px-2 py-0.5">{m.dimension}</span>
              <span className="rounded bg-muted px-2 py-0.5">Effort: {m.effort}</span>
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

      {remaining.length > 0 && <MethodologyContent remaining={remaining} total={total} />}

      {/* Task GGG: honest provenance for the AI Discovery technical check --
          only ai.txt has independent external grounding (verified: the
          IETF draft below genuinely specifies this path). The three JSON
          endpoints are Vunnara's own recommended format, not an industry
          standard -- no fabricated authority, per the NN guardrail. */}
      <section className="mt-16 border-t pt-10">
        <h2 className="text-xl font-bold mb-4">AI Discovery Endpoints</h2>
        <p className="text-muted-foreground mb-4 text-sm">
          Our Technical Audit checks for four endpoints AI crawlers can use to discover a site&apos;s
          policies and content. Only one is grounded in an external standard; the other three are
          Vunnara&apos;s own recommended format — most sites don&apos;t have them yet, and adding
          them is a forward-looking best practice, not a fix for a standards violation.
        </p>
        <ul className="space-y-3 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">
              <a
                href="https://datatracker.ietf.org/doc/html/draft-car-ai-txt-wellknown-00"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                /.well-known/ai.txt (or root /ai.txt)
              </a>
            </strong>{" "}
            — Emerging standard: the IETF draft <em>draft-car-ai-txt-wellknown-00</em> specifies a
            machine-readable AI usage-preferences file served at /.well-known/ai.txt; the older
            Spawning convention uses root /ai.txt instead. We check both.
          </li>
          <li>
            <strong className="text-foreground">
              /ai/summary.json, /ai/faq.json, /ai/service.json
            </strong>{" "}
            — Vunnara-recommended structured endpoints for an AI-ready business summary, FAQ
            content, and a service API/feed. Not yet an industry standard.
          </li>
        </ul>
      </section>

      <section className="mt-16 border-t pt-10">
        <h2 className="text-xl font-bold mb-4">Research Citations</h2>
        <ul className="space-y-3 text-sm text-muted-foreground">
          {RESEARCH_SOURCES.map((src) => (
            <li key={src.name}>
              <strong className="text-foreground">
                <a
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {src.name}
                </a>
              </strong>{" "}
              — {src.description}
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
