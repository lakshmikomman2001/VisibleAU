import { ScoreBar } from "@/components/domain/shared/score-bar";
import { StatusBadge } from "@/components/domain/shared/status-badge";
import type { Audit, Citation } from "@/db/schema";
import { formatAudFromUsd } from "@/lib/constants/currency";
import { ENGINE_DISPLAY_NAMES } from "@/lib/llm/interface";

/**
 * Vunnara (21 Oct, hotfix: "Usually #16") -- LEGACY, unreachable:
 * grep confirms no route under app/ renders this component (it
 * predates Task #46's scoring rework -- trusts audit.score_* columns
 * and citations.position directly, with no insufficient_data/
 * not_measured handling at all). Left as-is rather than rewired onto
 * resolveAuditDimensionsAndHeadline/recomputeCitationPositions, since
 * that would be rebuilding a dead screen, not fixing a live one -- the
 * grep-guard test (tests/unit/scoring/no-stored-position-read.test.ts)
 * excludes this one file for exactly this reason. Delete this component
 * outright, instead of fixing it, if it's confirmed still unused next
 * time it comes up.
 */
export function AuditResultsRich({ audit, citations }: { audit: Audit; citations: Citation[] }) {
  const ci = audit.confidenceIntervals as Record<string, { lower: number; upper: number }> | null;
  const mentioned = citations.filter((c) => c.brandMentioned);
  const engines = audit.engines ?? [];

  // Vunnara (19 Oct, post-aa83b3a), "the headline is the mention rate":
  // no more weighted blend, so no more per-dimension "Weight" labels --
  // Frequency IS the headline above (AI Visibility Score), shown again
  // here as one of several real measurements, never implying it still
  // feeds a blend.
  const dimensions = [
    {
      label: "Frequency",
      score: parseFloat(audit.scoreFrequency ?? "0"),
      key: "frequency",
    },
    {
      label: "Position",
      score: parseFloat(audit.scorePosition ?? "0"),
      key: "position",
    },
    {
      label: "Sentiment",
      score: parseFloat(audit.scoreSentimentNumeric ?? "0"),
      key: "sentiment",
    },
    {
      label: "Context",
      score: parseFloat(audit.scoreContextNumeric ?? "0"),
      key: "context",
    },
    {
      // Display-only relabel: this dimension measures citation rate (accuracyDimensionScore), not
      // factual correctness. DB column (score_accuracy) and internal key (accuracy) are unchanged
      // — see docs/ops for the Phase 1 writeup.
      label: "Source citation",
      score: parseFloat(audit.scoreAccuracy ?? "0"),
      key: "accuracy",
    },
  ];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-semibold">Audit #{audit.auditNumber}</h1>
        <StatusBadge status={audit.status} />
      </div>
      <p className="text-sm text-muted-foreground mb-8">
        {/* Vunnara Build 1, Part F.1/F.2: runsPerPrompt defaults to 1
            now (the replay loop is gone), not the old 5; "answers",
            never "calls". */}
        {audit.promptsCount ?? 10} questions × {engines.length} engines
        {(audit.runsPerPrompt ?? 1) > 1 ? ` × ${audit.runsPerPrompt} runs` : ""} ={" "}
        {audit.totalCalls ?? "—"} answers ·{" "}
        {formatAudFromUsd(audit.totalCostUsd ? Number.parseFloat(audit.totalCostUsd) : 0)}
      </p>

      {/* AI Visibility Score -- the mention rate (Frequency), never a blend */}
      <div className="border rounded-lg p-6 mb-8 text-center">
        <p className="text-sm text-muted-foreground">AI Visibility Score</p>
        <p className="text-5xl font-bold text-primary mt-1">
          {audit.scoreComposite ? parseFloat(audit.scoreComposite).toFixed(1) : "—"}
        </p>
        {/* Vunnara (19 Oct, post-aa83b3a): confidenceIntervals.composite
            was renamed to .headline at write time -- an audit completed
            before this change still only has .composite stored; read
            either so this CI line doesn't silently disappear for a
            brand-new audit. */}
        {(ci?.headline ?? ci?.composite) && (
          <p className="text-xs text-muted-foreground mt-1">
            95% CI: {(ci?.headline ?? ci?.composite)!.lower.toFixed(1)} —{" "}
            {(ci?.headline ?? ci?.composite)!.upper.toFixed(1)}
          </p>
        )}
      </div>

      {/* 5 Dimension Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
        {dimensions.map((d) => (
          <div key={d.key} className="border rounded-lg p-4">
            <ScoreBar
              label={d.label}
              score={d.score}
              ciLower={ci?.[d.key]?.lower}
              ciUpper={ci?.[d.key]?.upper}
            />
          </div>
        ))}
      </div>

      {/* Per-Engine Breakdown */}
      <h2 className="text-lg font-semibold mb-4">Per-Engine Breakdown</h2>
      <div className="grid gap-4 md:grid-cols-2 mb-8">
        {engines.map((engine) => {
          const engineCits = citations.filter((c) => c.engine === engine);
          const engineMentions = engineCits.filter((c) => c.brandMentioned);
          const rate =
            engineCits.length > 0
              ? ((engineMentions.length / engineCits.length) * 100).toFixed(1)
              : "0";
          return (
            <div key={engine} className="border rounded-lg p-4">
              <h3 className="font-medium capitalize mb-2">{engine}</h3>
              <p className="text-sm">
                Mention rate: {rate}% ({engineMentions.length}/{engineCits.length})
              </p>
            </div>
          );
        })}
      </div>

      {/* Citations Feed */}
      <h2 className="text-lg font-semibold mb-4">Brand Mentions ({mentioned.length})</h2>
      <div className="space-y-3 mb-8">
        {mentioned.slice(0, 20).map((c) => (
          <div key={c.id} className="border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                Mentioned
              </span>
              <span className="text-xs text-muted-foreground">
                {ENGINE_DISPLAY_NAMES[c.engine as keyof typeof ENGINE_DISPLAY_NAMES] ?? c.engine}
              </span>
              {c.sentimentLabel && (
                <span className="text-xs text-muted-foreground">{c.sentimentLabel}</span>
              )}
              {c.position && (
                <span className="text-xs text-muted-foreground">Position: {c.position}</span>
              )}
            </div>
            <p className="text-sm">{c.responseSnippet}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
