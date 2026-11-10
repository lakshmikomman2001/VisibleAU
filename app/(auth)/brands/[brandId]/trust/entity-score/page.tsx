"use client";

import { useParams } from "next/navigation";
import { useBrandFeatureGate } from "@/components/domain/pricing/brand-feature-gate";
import { PlanLockedCard } from "@/components/domain/pricing/plan-lock";
import { EntityAuthorityGrid } from "@/components/domain/trust/entity-authority-grid";
import { KnowledgePanelCard } from "@/components/domain/trust/knowledge-panel-card";
import { NotYetMeasuredCard } from "@/components/domain/trust/not-yet-measured-card";
import { WikidataStatusCard } from "@/components/domain/trust/wikidata-status-card";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { LoadError } from "@/components/shared/load-error";
import { useGatedJson } from "@/lib/hooks/use-load";
import { NOT_MEASURED } from "@/lib/scoring/measured";

interface EntityData {
  scoreOf10: string | null;
  /** Sri, 21 Oct follow-up, item 5: computed server-side by
   * entity-score/route.ts from this row's own abn/wikipedia/auTld
   * facts (recomputeEntityDisplayScore) -- never derived here from the
   * raw scoreOf10 above, whose scale isn't knowable from the value
   * alone (a pre-hotfix row's score_of_10 ran up to 10, not 8). */
  displayScore: number | null;
  scoreBasis?: string;
  abnVerified: boolean;
  abnNumber: string | null;
  abnEntityName: string | null;
  wikipediaAuPresent: boolean;
  wikipediaAuUrl: string | null;
  knowledgePanelPresent: boolean | null;
  knowledgePanelAccurate: boolean | null;
  knowledgePanelUrl: string | null;
  knowledgePanelImplemented: boolean;
  wikidataEntryPresent: boolean | null;
  wikidataEntryUrl: string | null;
  wikidataImplemented: boolean;
  // Vunnara (21 Oct, "directory listings... never scraping", Part A3):
  // always null now -- see entity-score/route.ts's own comment.
  auDirectoryPresence: null;
  rationale: string;
  confidence_label: string | null;
  scoreLevel: "Low" | "Medium" | "High" | null;
  top_action: string | null;
}

export default function EntityScorePage() {
  const { brandId } = useParams<{ brandId: string }>();
  const { locked, planRefused } = useBrandFeatureGate("entity_score");
  // Follow-ups from af8de42..d1eb5a1, part 1: a failed fetch fell through to the never-measured state. It
  // says it couldn't load now, with Try again.
  const loaded = useGatedJson<EntityData>(`/api/brands/${brandId}/entity-score`, planRefused, {
    enabled: !locked,
  });
  const data = loaded.data;

  if (locked) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          Entity Authority Score
        </h1>
        <PlanLockedCard feature="entity_score" />
      </div>
    );
  }

  if (loaded.status === "error") {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          Entity Authority Score
        </h1>
        <LoadError
          what="the entity authority score"
          detail={loaded.detail}
          onRetry={loaded.retry}
        />
      </div>
    );
  }

  if (loaded.status === "loading") {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          Entity Authority Score
        </h1>
        <div
          className="h-48 animate-pulse rounded-lg"
          style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)" }}
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          Entity Authority Score
        </h1>
        <div
          className="flex flex-col items-center gap-2 py-12 text-center"
          style={{ color: "var(--text-secondary)" }}
        >
          <p className="text-lg font-medium">Run an entity check</p>
        </div>
      </div>
    );
  }

  const displayScore = data.displayScore;

  return (
    <div className="space-y-4 p-6">
      <LayerBadge layer="trust" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          Entity Authority Score
        </h1>
        {/* Trust Intelligence honesty pass: this score only updates via a
            full technical audit (lib/audit/run-technical-audit-inline.ts)
            -- there is no isolated re-check that changes it, so no button
            here may claim to "refresh" it. See
            docs/ops/post-launch-db-hardening.md section 34. */}
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Updates with each full audit
        </span>
      </div>

      <div
        className="rounded-lg border p-4"
        style={{
          borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)",
          backgroundColor: "var(--background)",
        }}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            Entity Score
          </p>
          {data.scoreLevel && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: `color-mix(in srgb, var(${data.scoreLevel === "High" ? "--success" : data.scoreLevel === "Medium" ? "--warning" : "--danger"}) 15%, transparent)`,
                color: `var(${data.scoreLevel === "High" ? "--success" : data.scoreLevel === "Medium" ? "--warning" : "--danger"})`,
              }}
            >
              {data.scoreLevel}
            </span>
          )}
        </div>
        <p
          className="text-3xl font-bold"
          style={{ color: "var(--foreground)", fontVariantNumeric: "tabular-nums" }}
        >
          {/* 9 Nov (part 9): null when nothing was checked -- no number (lib/scoring/measured.ts). */}
          {displayScore === null ? (
            NOT_MEASURED
          ) : (
            <>
              {displayScore}
              <span className="text-lg font-normal" style={{ color: "var(--text-secondary)" }}>
                /100
              </span>
            </>
          )}
        </p>
        {data.scoreBasis && displayScore !== null && (
          <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }} data-score-basis>
            {data.scoreBasis}
          </p>
        )}
        <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          {data.rationale}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <EntityAuthorityGrid data={data} />
        {data.knowledgePanelImplemented ? (
          <KnowledgePanelCard
            present={data.knowledgePanelPresent}
            accurate={data.knowledgePanelAccurate}
            url={data.knowledgePanelUrl}
          />
        ) : (
          <NotYetMeasuredCard metric="Knowledge Panel" />
        )}
        {data.wikidataImplemented ? (
          <WikidataStatusCard present={data.wikidataEntryPresent} url={data.wikidataEntryUrl} />
        ) : (
          <NotYetMeasuredCard metric="Wikidata" />
        )}
      </div>
    </div>
  );
}
