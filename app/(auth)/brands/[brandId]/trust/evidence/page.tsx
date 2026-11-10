"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useBrandFeatureGate } from "@/components/domain/pricing/brand-feature-gate";
import { PlanLockedCard } from "@/components/domain/pricing/plan-lock";
import { EvidenceSnapshotRow } from "@/components/domain/trust/evidence-snapshot-row";
import { LayerBadge } from "@/components/phase2/layer-badge";

interface Snapshot {
  id: string;
  engine: string;
  prompt: string;
  rawResponse: string;
  scoreAtCapture: string | null;
  capturedAt: string;
}

export default function EvidenceArchivePage() {
  const { brandId } = useParams<{ brandId: string }>();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [citationCount, setCitationCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const { locked, planRefused } = useBrandFeatureGate("evidence_archive");

  useEffect(() => {
    if (locked) return;
    fetch(`/api/brands/${brandId}/evidence`)
      .then(async (res) => {
        if (await planRefused(res)) return;
        if (res.ok) {
          const data = await res.json();
          setSnapshots(data.snapshots);
          setCitationCount(data.citationCount);
        }
      })
      .finally(() => setLoading(false));
  }, [brandId, locked, planRefused]);

  if (locked) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          Evidence Archive
        </h1>
        <PlanLockedCard feature="evidence_archive" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          Evidence Archive
        </h1>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-lg"
            style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)" }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <LayerBadge layer="trust" />
      <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
        Evidence Archive
      </h1>

      {snapshots.length === 0 ? (
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
          ) : (
            <>
              <p className="text-lg font-medium">No evidence snapshots yet</p>
              <p className="text-sm">Immutable snapshots are captured after each audit.</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {snapshots.map((snap) => (
            <EvidenceSnapshotRow key={snap.id} snapshot={snap} />
          ))}
        </div>
      )}
    </div>
  );
}
