"use client";

import { useParams } from "next/navigation";
import { ComparisonVerdictCard } from "@/components/domain/discovery/comparison-verdict-card";
import { useBrandFeatureGate } from "@/components/domain/pricing/brand-feature-gate";
import { PlanLockedCard } from "@/components/domain/pricing/plan-lock";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { LoadError } from "@/components/shared/load-error";
import { useGatedJson } from "@/lib/hooks/use-load";

// 17 Nov, part 3: the route judges each row again from its stored answer (lib/conversational/comparison-verdict.ts)
// and says when only the start of the answer was kept.
interface ComparisonResult {
  id: string;
  competitorDomain: string;
  engine: string;
  brandWon: boolean | null;
  brandMentioned: boolean;
  competitorMentioned: boolean;
  answerCutOff?: boolean;
  runAt: string;
}

// Only before the load is in (the page shows its loading or error state then).
const NO_RESULTS: ComparisonResult[] = [];

export default function ComparisonsPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const { locked, planRefused } = useBrandFeatureGate("competitor_comparisons");
  // Follow-ups from af8de42..d1eb5a1, part 1: a failed fetch showed no comparisons, as if none had run. It
  // says it couldn't load now, with Try again.
  const loaded = useGatedJson<ComparisonResult[]>(
    `/api/brands/${brandId}/comparisons`,
    planRefused,
    { enabled: !locked },
  );
  const results = loaded.data ?? NO_RESULTS;

  if (locked) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="discovery" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Competitor Comparisons
        </h1>
        <PlanLockedCard feature="competitor_comparisons" />
      </div>
    );
  }

  if (loaded.status === "error") {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="discovery" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Competitor Comparisons
        </h1>
        <LoadError
          what="your competitor comparisons"
          detail={loaded.detail}
          onRetry={loaded.retry}
        />
      </div>
    );
  }

  if (loaded.status === "loading") {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="discovery" />
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-lg"
              style={{ backgroundColor: "color-mix(in srgb, var(--text-primary) 8%, transparent)" }}
            />
          ))}
        </div>
      </div>
    );
  }

  const grouped = results.reduce<Record<string, ComparisonResult[]>>((acc, r) => {
    (acc[r.competitorDomain] ??= []).push(r);
    return acc;
  }, {});

  const competitors = Object.keys(grouped).sort();

  const summary = {
    wins: results.filter((r) => r.brandWon === true).length,
    losses: results.filter((r) => r.brandWon === false).length,
    inconclusive: results.filter((r) => r.brandWon === null).length,
  };

  return (
    <div className="space-y-6 p-6">
      <LayerBadge layer="discovery" />
      <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
        Competitor Comparisons
      </h1>

      {results.length === 0 ? (
        <div className="py-12 text-center" style={{ color: "var(--text-tertiary)" }}>
          <p className="text-lg font-medium">
            Add competitors to your brand to see head-to-head results
          </p>
          {/* 17 Nov, part 2: what's true -- comparisons run with an audit started from the app
              (inngest/functions/run-comparison-prompts.ts on audit.complete), not "after your next audit". */}
          <p className="mt-1 text-sm">
            Head-to-head comparisons run with each audit you start, once competitors are set.
          </p>
        </div>
      ) : (
        <>
          {/* 17 Nov, part 3: what a card is. "Brand mentioned" read as the audit's verified mention; it's a
              text match in a separate head-to-head question. */}
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Each card is one engine&apos;s answer to a separate head-to-head question (&quot;Compare
            your site vs the competitor&apos;s. Which is better?&quot;), asked after an audit. Its
            badge is the verdict that answer gives, when it gives one we can read. &quot;Named in
            this answer&quot; means its text contains your business name or website: it isn&apos;t
            the audit&apos;s count of mentions.
          </p>
          <div className="flex gap-4">
            {[
              { label: "Wins", value: summary.wins, color: "var(--success)" },
              { label: "Losses", value: summary.losses, color: "var(--danger)" },
              { label: "Inconclusive", value: summary.inconclusive, color: "var(--warning)" },
            ].map((s) => (
              <div
                key={s.label}
                className="flex-1 rounded-lg border p-4 text-center"
                style={{
                  borderColor: "var(--border-default)",
                  backgroundColor: "var(--bg-elevated)",
                }}
              >
                <p className="text-2xl font-bold" style={{ color: s.color }}>
                  {s.value}
                </p>
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {s.label}
                </p>
              </div>
            ))}
          </div>

          {competitors.map((comp) => (
            <div key={comp}>
              <h2 className="text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                vs {comp}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {grouped[comp].map((r) => (
                  <ComparisonVerdictCard
                    key={r.id}
                    competitorDomain={r.competitorDomain}
                    engine={r.engine}
                    brandWon={r.brandWon}
                    brandMentioned={r.brandMentioned}
                    competitorMentioned={r.competitorMentioned}
                    runAt={r.runAt}
                    answerCutOff={r.answerCutOff === true}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
