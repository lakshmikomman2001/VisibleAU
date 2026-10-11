"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SourceGapCard } from "@/components/domain/trust/source-gap-card";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { TierGate } from "@/components/phase2/tier-gate";
import type { NoCitationsRow, TopDomainEntry } from "@/lib/trust/citation-intelligence";

// Task #46 (4th follow-up): deliberately NOT importing RealCategoryRow
// here -- that type describes the server-side row (citationShare as
// the DB's raw `string | null`), but the API route converts
// citationShare to a number before it goes over the wire (unchanged,
// pre-existing behaviour). This mirrors the actual JSON shape instead
// of the pre-serialization one.
interface CategoryCardRow {
  id: string;
  engine: string;
  sourceType: string;
  citationCount: number;
  citationShare: string;
  brandPresentInSource: boolean;
  gapSeverity: string;
  sourceAffinityNote: string | null;
  topDomains: TopDomainEntry[] | null;
}

export default function CitationSourcesPage() {
  const { brandId } = useParams<{ brandId: string }>();
  // Task #46 (4th follow-up): the API now pre-splits real categories
  // from "cited nothing" engines (getCurrentCitationSources's own
  // return shape) -- no more NO_CITATIONS_SOURCE_TYPE string compare
  // here, the server already did it.
  const [categoryCards, setCategoryCards] = useState<CategoryCardRow[]>([]);
  const [noCitationRows, setNoCitationRows] = useState<NoCitationsRow[]>([]);
  const [citationCount, setCitationCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tierLocked, setTierLocked] = useState(false);

  useEffect(() => {
    fetch(`/api/brands/${brandId}/citation-sources`)
      .then(async (res) => {
        if (res.status === 403) {
          setTierLocked(true);
          return;
        }
        if (res.ok) {
          const data = await res.json();
          setCategoryCards(data.categories);
          setNoCitationRows(data.enginesWithoutCitations);
          setCitationCount(data.citationCount);
        }
      })
      .finally(() => setLoading(false));
  }, [brandId]);

  if (tierLocked) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <TierGate requiredTier="Growth" locked>
          <div />
        </TierGate>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          Citation Source Intelligence
        </h1>
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

  return (
    <div className="space-y-4 p-6">
      <LayerBadge layer="trust" />
      <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
        Citation Source Intelligence
      </h1>
      {/* Task #41: this was never stated anywhere -- "Covered"/"gap"
          describes the brand's presence WITHIN a source category, not
          the brand's overall AI visibility. Task #44: corrected to match
          what brandPresent actually checks (buildCitationSourceIntelligence,
          lib/trust/citation-intelligence.ts) -- the engine mentioned the
          brand in an answer that cites this kind of source, or cited the
          brand's own site -- not "the brand is listed on these sources". */}
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Shows the sources AI engines cite when answering category-level questions in this brand&apos;s
        space — not the brand&apos;s own visibility. &quot;Covered&quot; means the engine mentioned this
        brand in an answer that cites this kind of source (or cited the brand&apos;s own site); a gap
        means it didn&apos;t, weighted by how much of this engine&apos;s citations come from that
        category. &quot;Unclassified&quot; sources haven&apos;t been matched to a category yet — not a
        gap, just not sorted.
      </p>

      {categoryCards.length === 0 && noCitationRows.length === 0 ? (
        <div
          className="flex flex-col items-center gap-2 py-12 text-center"
          style={{ color: "var(--muted)" }}
        >
          {citationCount === 0 ? (
            <>
              <p className="text-lg font-medium">Not enough AI coverage to assess</p>
              <p className="text-sm">
                No AI responses have been recorded for this brand yet — run an audit first.
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-medium">No citation source data yet</p>
              <p className="text-sm">Run an audit to analyse citation sources.</p>
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
                <li key={row.id} className="text-sm" style={{ color: "var(--muted)" }}>
                  {`${capitalize(row.engine)} cited no sources in ${row.answerCount} ${
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

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}
