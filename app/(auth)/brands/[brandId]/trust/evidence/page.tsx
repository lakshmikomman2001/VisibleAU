"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { TierGate } from "@/components/phase2/tier-gate";
import { EvidenceSnapshotRow } from "@/components/domain/trust/evidence-snapshot-row";

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
  const [loading, setLoading] = useState(true);
  const [tierLocked, setTierLocked] = useState(false);

  useEffect(() => {
    fetch(`/api/brands/${brandId}/evidence`)
      .then(async (res) => {
        if (res.status === 403) { setTierLocked(true); return; }
        if (res.ok) setSnapshots(await res.json());
      })
      .finally(() => setLoading(false));
  }, [brandId]);

  if (tierLocked) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <TierGate requiredTier="Agency" locked><div /></TierGate>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>Evidence Archive</h1>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg" style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)" }} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <LayerBadge layer="trust" />
      <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>Evidence Archive</h1>

      {snapshots.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center" style={{ color: "var(--muted)" }}>
          <p className="text-lg font-medium">No evidence snapshots yet</p>
          <p className="text-sm">Immutable snapshots are captured after each audit.</p>
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
