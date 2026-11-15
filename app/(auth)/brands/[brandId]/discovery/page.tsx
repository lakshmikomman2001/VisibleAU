"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useBrandFeatureGate } from "@/components/domain/pricing/brand-feature-gate";
import { PlanLockBadge } from "@/components/domain/pricing/plan-lock";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { LoadError } from "@/components/shared/load-error";
import { pluralise } from "@/lib/format/pluralise";
import { type Loaded, useGatedJson } from "@/lib/hooks/use-load";

const DISCOVERY_TILES = [
  {
    key: "journeys",
    label: "Conversational Journeys",
    desc: "Multi-turn discovery simulations across AI engines",
    href: "journeys",
    noun: "journey",
    what: "your journeys",
  },
  {
    key: "comparisons",
    label: "Competitor Comparisons",
    desc: "Head-to-head brand vs competitor prompts",
    href: "comparisons",
    noun: "result",
    what: "your competitor comparisons",
  },
] as const;

/** A load's count: the same state, with the count of what loaded (null while locked by a plan refusal). */
function countOf<T>(loaded: Loaded<T | null>, count: (data: T) => number): Loaded<number | null> {
  if (loaded.status === "ready") {
    return { ...loaded, data: loaded.data === null ? null : count(loaded.data) };
  }
  if (loaded.status === "empty") {
    return { ...loaded, data: loaded.data === null ? null : count(loaded.data) };
  }
  return loaded;
}

/** What a tile's count line says: a count only from a load that worked (17 Nov, part 3). */
function countLine(loaded: Loaded<number | null>, noun: string): string {
  if (loaded.status === "error") return "Couldn't load";
  if (loaded.status === "loading" || loaded.data === null) return "";
  return pluralise(loaded.data, noun);
}

export default function DiscoveryHubPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const journeysGate = useBrandFeatureGate("journeys");
  const comparisonsGate = useBrandFeatureGate("competitor_comparisons");
  const journeyLocked = journeysGate.locked;
  const comparisonLocked = comparisonsGate.locked;

  // 17 Nov, part 3: the counts started at 0 and a failed fetch left them there, so a failure read "0 journeys"
  // and "0 results" as fact. Each tile shows its count only from a load that worked; a failure says so.
  const journeys = useGatedJson<{ journeys: unknown[] }>(
    `/api/brands/${brandId}/journeys`,
    journeysGate.planRefused,
    { enabled: !journeyLocked },
  );
  const comparisons = useGatedJson<unknown[]>(
    `/api/brands/${brandId}/comparisons`,
    comparisonsGate.planRefused,
    { enabled: !comparisonLocked },
  );

  const journeyCount = countOf(journeys, (d) => d.journeys.length);
  const comparisonCount = countOf(comparisons, (d) => d.length);

  const stillLoading =
    (!journeyLocked && journeys.status === "loading") ||
    (!comparisonLocked && comparisons.status === "loading");

  return (
    <div className="space-y-6 p-6">
      <LayerBadge layer="discovery" />
      <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
        Discovery Intelligence
      </h1>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        Understand how AI engines discover and recommend your brand across multi-turn conversations.
      </p>

      {stillLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-lg"
              style={{ backgroundColor: "color-mix(in srgb, var(--text-primary) 8%, transparent)" }}
            />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {DISCOVERY_TILES.map((tile) => {
              const locked = tile.key === "journeys" ? journeyLocked : comparisonLocked;
              const count = tile.key === "journeys" ? journeyCount : comparisonCount;

              return (
                <Link
                  key={tile.key}
                  href={`/brands/${brandId}/discovery/${tile.href}`}
                  className="group block rounded-lg border p-5 transition-all"
                  style={{
                    borderColor: "var(--border-default)",
                    backgroundColor: "var(--bg-elevated)",
                  }}
                >
                  <p className="font-medium" style={{ color: "var(--text-primary)" }}>
                    {tile.label}
                    {locked && (
                      <PlanLockBadge
                        feature={tile.key === "journeys" ? "journeys" : "competitor_comparisons"}
                      />
                    )}
                  </p>
                  <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                    {tile.desc}
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      {locked ? "" : countLine(count, tile.noun)}
                    </span>
                    <span className="text-sm" style={{ color: "var(--layer-discovery)" }}>
                      View &rarr;
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
          {!journeyLocked && journeys.status === "error" && (
            <LoadError
              what={DISCOVERY_TILES[0].what}
              detail={journeys.detail}
              onRetry={journeys.retry}
            />
          )}
          {!comparisonLocked && comparisons.status === "error" && (
            <LoadError
              what={DISCOVERY_TILES[1].what}
              detail={comparisons.detail}
              onRetry={comparisons.retry}
            />
          )}
        </>
      )}
    </div>
  );
}
