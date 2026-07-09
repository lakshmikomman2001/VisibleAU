"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { ContentStructureCard } from "@/components/domain/retrieval/content-structure-card";

interface ContentAudit {
  id: string;
  pageUrl: string;
  answerCapsuleScore: number | null;
  faqBlockPresent: boolean | null;
  faqSchemaPresent: boolean | null;
  wordCount: number | null;
  optimalPassageCount: number | null;
  freshnessRisk: string | null;
  contentFormatDetected: string | null;
  citationProbabilityScore: string | null;
  hasAuthorAttribution: boolean | null;
  isEntityHomeCandidate: boolean | null;
  auditedAt: string;
}

function citationBandColor(prob: number): string {
  if (prob >= 0.70) return "var(--success)";
  if (prob >= 0.40) return "var(--warning)";
  return "var(--destructive)";
}

function citationBandLabel(prob: number): string {
  if (prob >= 0.70) return "High";
  if (prob >= 0.40) return "Moderate";
  return "Low";
}

export default function ContentStructurePage() {
  const { brandId } = useParams<{ brandId: string }>();
  const [audits, setAudits] = useState<ContentAudit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/brands/${brandId}/content-structure`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setAudits(data.audits);
        }
      })
      .finally(() => setLoading(false));
  }, [brandId]);

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="retrieval" />
        <div className="h-24 animate-pulse rounded-lg" style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)" }} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg" style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)" }} />
          ))}
        </div>
      </div>
    );
  }

  const contentAudits = audits.filter((a) => a.citationProbabilityScore !== null || a.wordCount !== null);

  const primaryPage = contentAudits.find((a) => a.isEntityHomeCandidate === true)
    ?? contentAudits.reduce<ContentAudit | null>((best, a) => {
      const prob = Number(a.citationProbabilityScore ?? 0);
      const bestProb = Number(best?.citationProbabilityScore ?? 0);
      return prob > bestProb ? a : best;
    }, null);

  const primaryProb = Number(primaryPage?.citationProbabilityScore ?? 0);
  const primaryPct = (primaryProb * 100).toFixed(0);
  const bandColor = citationBandColor(primaryProb);

  return (
    <div className="space-y-6 p-6">
      <LayerBadge layer="retrieval" />
      <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>Content Structure Audit</h1>

      {contentAudits.length > 0 && primaryPage && (
        <div
          className="rounded-lg border p-5"
          style={{
            borderColor: `color-mix(in srgb, ${bandColor} 30%, transparent)`,
            backgroundColor: `color-mix(in srgb, ${bandColor} 6%, transparent)`,
          }}
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                How likely is this page to be cited by AI?
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                {primaryPage.pageUrl}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-4xl font-bold" style={{ color: bandColor }}>
                {primaryPct}%
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{
                  backgroundColor: `color-mix(in srgb, ${bandColor} 15%, transparent)`,
                  color: bandColor,
                }}
              >
                {citationBandLabel(primaryProb)}
              </span>
            </div>
          </div>
        </div>
      )}

      {contentAudits.length === 0 ? (
        <div className="text-center py-12" style={{ color: "var(--muted)" }}>
          No content structure audits yet. Audits run weekly on Wednesdays at 10pm.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {contentAudits.map((audit) => (
            <ContentStructureCard key={audit.id} audit={audit} />
          ))}
        </div>
      )}
    </div>
  );
}
