"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { EmptyState } from "@/components/phase2/empty-state";
import { CitationFailureCard } from "@/components/domain/visibility/citation-failure-card";
import type { CitationDiagnosis } from "@/lib/visibility/types";

export default function CitationFailurePage() {
  const { brandId } = useParams<{ brandId: string }>();
  const searchParams = useSearchParams();
  const promptId = searchParams.get("promptId");

  const [diagnoses, setDiagnoses] = useState<CitationDiagnosis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const url = promptId
          ? `/api/brands/${brandId}/citation-failure?promptId=${promptId}`
          : `/api/brands/${brandId}/citation-failure`;
        const res = await fetch(url);
        if (!res.ok) {
          setError("Failed to load diagnosis data");
          return;
        }
        const data = await res.json();
        setDiagnoses(data.diagnoses ?? []);
        setPartial(data.partial ?? false);
      } catch {
        setError("Failed to load diagnosis data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [brandId, promptId]);

  if (error) {
    return (
      <div className="p-6">
        <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <LayerBadge layer="visibility" />
        <h1
          className="text-lg font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Citation Failure Diagnosis
        </h1>
      </div>

      {loading && (
        <div className="space-y-3" aria-busy="true">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-lg p-4"
              style={{
                backgroundColor: "var(--bg-elevated)",
                boxShadow: "var(--elevation-rest)",
              }}
            >
              <div
                className="h-4 w-48 rounded anim-shimmer mb-3"
                style={{ backgroundColor: "var(--bg-hover)" }}
              />
              <div
                className="h-3 w-full rounded anim-shimmer"
                style={{ backgroundColor: "var(--bg-hover)" }}
              />
            </div>
          ))}
        </div>
      )}

      {!loading && diagnoses.length === 0 && (
        <EmptyState message="No citation gaps found for this prompt set" />
      )}

      {!loading && diagnoses.length > 0 && (
        <div className="space-y-3">
          {diagnoses.map((d, i) => (
            <CitationFailureCard key={`${d.patternKey}-${i}`} diagnosis={d} />
          ))}
        </div>
      )}

      {partial && (
        <div
          className="rounded-md px-4 py-3"
          style={{
            backgroundColor: `color-mix(in srgb, var(--text-secondary) 8%, transparent)`,
          }}
        >
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            Deeper diagnosis available after trust + comparison data is collected
          </p>
        </div>
      )}
    </div>
  );
}
