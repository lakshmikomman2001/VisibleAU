"use client";

import type { CitationDiagnosis } from "@/lib/visibility/types";

interface CitationFailureCardProps {
  diagnosis: CitationDiagnosis;
}

const SEVERITY_CONFIG: Record<
  CitationDiagnosis["severity"],
  { bg: string; fg: string; border: string }
> = {
  high: {
    bg: "var(--danger-soft)",
    fg: "var(--danger)",
    border: "var(--danger)",
  },
  medium: {
    bg: "var(--warning-soft)",
    fg: "var(--warning)",
    border: "var(--warning)",
  },
  low: {
    bg: `color-mix(in srgb, var(--text-secondary) 10%, transparent)`,
    fg: "var(--text-secondary)",
    border: "var(--text-tertiary)",
  },
};

// Task #46 follow-up: keyed by the patternKeys diagnose() actually emits
// (lib/visibility/citation-failure-diagnosis.ts) -- "no_brand_owned_citations"
// was a stale key from a since-deleted diagnosis branch and was never
// produced, so "brand_domain_not_cited" always fell through to the raw-key
// fallback below.
const PATTERN_HEADLINES: Record<string, string> = {
  missing_topic_coverage: "Missing Topic Coverage",
  brand_domain_not_cited: "AI engines don't cite your website",
  competitor_cited_instead: "Competitor Cited Instead",
};

// Matches the app's own impact-pill convention (e.g.
// app/(auth)/audits/[auditId]/page.tsx's labelMap).
const SEVERITY_LABELS: Record<CitationDiagnosis["severity"], string> = {
  high: "High",
  medium: "Med",
  low: "Low",
};

export function CitationFailureCard({ diagnosis }: CitationFailureCardProps) {
  const config = SEVERITY_CONFIG[diagnosis.severity];
  const headline = PATTERN_HEADLINES[diagnosis.patternKey] ?? diagnosis.patternKey;

  return (
    <div
      className="rounded-lg p-4"
      style={{
        backgroundColor: "var(--bg-elevated)",
        boxShadow: "var(--elevation-rest)",
        borderLeft: `4px solid ${config.border}`,
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {headline}
        </p>
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
          style={{
            backgroundColor: config.bg,
            color: config.fg,
          }}
        >
          {SEVERITY_LABELS[diagnosis.severity]}
        </span>
      </div>

      <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
        {diagnosis.evidence}
      </p>

      {diagnosis.competitorCited && (
        <p className="text-xs mb-2" style={{ color: "var(--text-tertiary)" }}>
          Competitor cited: <span className="font-medium">{diagnosis.competitorCited}</span>
        </p>
      )}

      {diagnosis.remediation && (
        <div
          className="rounded-md px-3 py-2 mt-2"
          style={{
            backgroundColor: `color-mix(in srgb, var(--layer-visibility) 8%, transparent)`,
          }}
        >
          <p className="text-xs" style={{ color: "var(--layer-visibility)" }}>
            {diagnosis.remediation}
          </p>
        </div>
      )}
    </div>
  );
}
