"use client";

import { useParams } from "next/navigation";
import { useBrandFeatureGate } from "@/components/domain/pricing/brand-feature-gate";
import { PlanLockedCard } from "@/components/domain/pricing/plan-lock";
import { SourceGapCard } from "@/components/domain/trust/source-gap-card";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { LoadError } from "@/components/shared/load-error";
import { useGatedJson } from "@/lib/hooks/use-load";
import { ENGINE_DISPLAY_NAMES, type Engine } from "@/lib/llm/interface";
import type { NoCitationsRow, TopDomainEntry } from "@/lib/trust/citation-intelligence";
import { auditSourceLine } from "@/lib/trust/display-dates";

// Task #46 (4th follow-up): deliberately NOT importing LiveCategoryRow
// here -- that type describes the server-side row; this mirrors the
// actual JSON shape instead of the pre-serialization one.
interface CategoryCardRow {
  id: string;
  engine: string;
  sourceType: string;
  citationCount: number;
  citationShare: number;
  brandPresentInSource: boolean;
  gapSeverity: string;
  sourceAffinityNote: string | null;
  topDomains: TopDomainEntry[] | null;
}

interface CitationSourcesData {
  /** 17 Nov, part 3: the audit the figures come from; null when the brand has no complete audit. */
  audit?: { auditNumber: number; completedAt: string | null } | null;
  categories: CategoryCardRow[];
  enginesWithoutCitations: NoCitationsRow[];
  citationCount: number;
}

function Heading() {
  return (
    <>
      <LayerBadge layer="trust" />
      <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
        Citation Source Intelligence
      </h1>
    </>
  );
}

export default function CitationSourcesPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const { locked, planRefused } = useBrandFeatureGate("citation_sources");
  // 17 Nov, part 3: a failed fetch fell through to "Not enough AI coverage to assess ... No AI responses have
  // been recorded for this brand yet", as if there were none. It says it couldn't load now, with Try again.
  const loaded = useGatedJson<CitationSourcesData>(
    `/api/brands/${brandId}/citation-sources`,
    planRefused,
    { enabled: !locked },
  );

  if (locked) {
    return (
      <div className="space-y-4 p-6">
        <Heading />
        <PlanLockedCard feature="citation_sources" />
      </div>
    );
  }

  if (loaded.status === "error") {
    return (
      <div className="space-y-4 p-6">
        <Heading />
        <LoadError what="your citation sources" detail={loaded.detail} onRetry={loaded.retry} />
      </div>
    );
  }

  if (loaded.status === "loading" || !loaded.data) {
    return (
      <div className="space-y-4 p-6">
        <Heading />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-lg"
              style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)" }}
            />
          ))}
        </div>
      </div>
    );
  }

  const { categories: categoryCards, enginesWithoutCitations: noCitationRows } = loaded.data;
  const citationCount = loaded.data.citationCount;
  const audit = loaded.data.audit ?? null;

  return (
    <div className="space-y-4 p-6">
      <Heading />
      {/* Task #41: this was never stated anywhere -- "Covered"/"gap"
          describes the brand's presence WITHIN a source category, not
          the brand's overall AI visibility. Task #44: corrected to match
          what brandPresent actually checks (computeCitationSourceGroups,
          lib/trust/citation-intelligence.ts) -- the engine mentioned the
          brand in an answer that cites this kind of source, or cited the
          brand's own site -- not "the brand is listed on these sources".
          17 Nov, part 3: a mention is the audit page's (a name match it
          couldn't confirm as this business doesn't count). */}
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        Shows the sources AI engines cite when answering everyday questions in this brand&apos;s
        space — not the brand&apos;s own visibility. &quot;Covered&quot; means the engine mentioned
        this brand in an answer that cites this kind of source (a mention the audit confirmed as
        this business), or cited the brand&apos;s own site; a gap means it didn&apos;t, weighted by
        how much of this engine&apos;s citations come from that category. &quot;Unclassified&quot;
        sources haven&apos;t been matched to a category — not a gap, just not sorted.
      </p>
      {audit && (
        <p className="text-xs" style={{ color: "var(--text-secondary)" }} data-citation-audit>
          {auditSourceLine(audit)}
        </p>
      )}

      {categoryCards.length === 0 && noCitationRows.length === 0 ? (
        <div
          className="flex flex-col items-center gap-2 py-12 text-center"
          style={{ color: "var(--text-secondary)" }}
        >
          {citationCount === 0 ? (
            <>
              <p className="text-lg font-medium">Not enough AI coverage to assess</p>
              <p className="text-sm">
                No AI responses have been recorded for this brand yet — run an audit first.
              </p>
            </>
          ) : audit ? (
            <>
              <p className="text-lg font-medium">No everyday answers in this audit</p>
              <p className="text-sm">
                Audit #{audit.auditNumber} recorded no answers to everyday questions, so there are
                no sources to show.
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-medium">No finished audit yet</p>
              <p className="text-sm">Citation sources come from a finished audit&apos;s answers.</p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {categoryCards.map((source) => (
              <SourceGapCard key={source.id} source={source} />
            ))}
          </div>
          {/* Task #46 (3rd follow-up): an audited engine that cited
              nothing at all is a measured result, not missing data --
              without this, it would simply be absent from the screen,
              indistinguishable from an engine that was never audited. */}
          {noCitationRows.length > 0 && (
            <ul className="space-y-1">
              {noCitationRows.map((row) => (
                <li key={row.id} className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  {`${ENGINE_DISPLAY_NAMES[row.engine as Engine] ?? row.engine} cited no sources in ${row.answerCount} ${
                    row.answerCount === 1 ? "answer" : "answers"
                  }.`}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
