"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { VerifiedSource } from "@/components/domain/brand-entity/verified-source";

// Task XXX: mirrors app/(auth)/methods/page.tsx's gate (task VVV) -- a ref
// is only ever shown as research when it genuinely carries sourceType
// "research" AND a real url. Every ref built before this field existed
// (every action_items.evidence_refs row frozen before this change) has no
// sourceType at all, so it falls through here exactly like an explicit
// "vunnara_estimate" would -- this is what neutralizes an already-frozen
// fabricated source/summary (e.g. the pre-UUU "SE Ranking Dec 2025" / "4.9
// vs 4.4" text) the moment this component deploys, with no DB change.
interface EvidenceRef {
  source: string;
  url: string;
  summary: string;
  sourceType?: "research" | "vunnara_estimate";
}

interface EvidenceLinkProps {
  evidenceRefs: EvidenceRef[];
  /** The recommendation's own honest copy (e.g. `action_items.action`),
   * shown in place of a non-research ref's `summary` -- never the raw,
   * possibly-fabricated or frozen `ref.summary` string. */
  fallbackDescription: string;
}

export function EvidenceLink({ evidenceRefs, fallbackDescription }: EvidenceLinkProps) {
  const [open, setOpen] = useState(false);

  if (!evidenceRefs || evidenceRefs.length === 0) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          fontWeight: 500,
          color: "var(--accent-blue)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
      >
        {open ? (
          <ChevronDown style={{ width: 14, height: 14 }} />
        ) : (
          <ChevronRight style={{ width: 14, height: 14 }} />
        )}
        View research ({evidenceRefs.length} citation{evidenceRefs.length !== 1 ? "s" : ""})
      </button>
      {open && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          {evidenceRefs.map((ref, i) => {
            // Task XXX: the only path that renders ref.source/ref.summary
            // raw. Missing sourceType (every ref frozen before this field
            // existed) or a non-"research" value both fall through to the
            // honest, neutral branch -- never the frozen source/summary.
            const isResearch = ref.sourceType === "research" && !!ref.url;
            return (
              <div
                key={`${ref.source}-${i}`}
                style={{
                  padding: "10px 14px",
                  borderRadius: 6,
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                {isResearch ? (
                  <VerifiedSource source={ref.source} url={ref.url} label={`Research: ${ref.source}`} />
                ) : (
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-tertiary)" }}>
                    Vunnara estimate
                  </span>
                )}
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 0" }}>
                  {isResearch ? ref.summary : fallbackDescription}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
