"use client";

import { useParams } from "next/navigation";
import { useBrandFeatureGate } from "@/components/domain/pricing/brand-feature-gate";
import { PlanLockedCard } from "@/components/domain/pricing/plan-lock";
import {
  type EvidenceSnapshot,
  EvidenceSnapshotRow,
} from "@/components/domain/trust/evidence-snapshot-row";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { LoadError } from "@/components/shared/load-error";
import { useGatedJson } from "@/lib/hooks/use-load";
import { EVIDENCE_ARCHIVE_SENTENCE } from "@/lib/trust/evidence-archive-copy";

interface EvidenceData {
  snapshots: EvidenceSnapshot[];
  citationCount: number;
}

function Heading() {
  return (
    <>
      <LayerBadge layer="trust" />
      <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
        Evidence Archive
      </h1>
    </>
  );
}

export default function EvidenceArchivePage() {
  const { brandId } = useParams<{ brandId: string }>();
  const { locked, planRefused } = useBrandFeatureGate("evidence_archive");
  // 17 Nov, part 3: a failed fetch fell through to "Not enough AI coverage to assess ... No AI responses have
  // been recorded for this brand yet", as if there were none. It says it couldn't load now, with Try again.
  const loaded = useGatedJson<EvidenceData>(`/api/brands/${brandId}/evidence`, planRefused, {
    enabled: !locked,
  });

  if (locked) {
    return (
      <div className="space-y-4 p-6">
        <Heading />
        <PlanLockedCard feature="evidence_archive" />
      </div>
    );
  }

  if (loaded.status === "error") {
    return (
      <div className="space-y-4 p-6">
        <Heading />
        <LoadError what="your evidence archive" detail={loaded.detail} onRetry={loaded.retry} />
      </div>
    );
  }

  if (loaded.status === "loading" || !loaded.data) {
    return (
      <div className="space-y-4 p-6">
        <Heading />
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

  const { snapshots, citationCount } = loaded.data;

  return (
    <div className="space-y-4 p-6">
      <Heading />
      {/* 17 Nov, part 3: what the archive really keeps (lib/trust/evidence-archive-copy.ts), not "Immutable
          snapshots" -- nothing makes them immutable. */}
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {EVIDENCE_ARCHIVE_SENTENCE} Answers to questions that named the business are marked: the
        audit doesn&apos;t count them as everyday answers.
      </p>

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
              <p className="text-lg font-medium">No answers archived yet</p>
              <p className="text-sm">
                Answers are archived when an audit finishes on a plan that includes the Evidence
                Archive.
              </p>
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
