import { ScoreBar } from "@/components/domain/shared/score-bar";
import { StatusBadge } from "@/components/domain/shared/status-badge";
import type { Audit, Citation } from "@/db/schema";

export function AuditResultsRich({ audit, citations }: { audit: Audit; citations: Citation[] }) {
  const ci = audit.confidenceIntervals as Record<string, { lower: number; upper: number }> | null;
  const mentioned = citations.filter((c) => c.brandMentioned);
  const engines = audit.engines ?? [];

  const dimensions = [
    {
      label: "Frequency",
      score: parseFloat(audit.scoreFrequency ?? "0"),
      weight: "25%",
      key: "frequency",
    },
    {
      label: "Position",
      score: parseFloat(audit.scorePosition ?? "0"),
      weight: "25%",
      key: "position",
    },
    {
      label: "Sentiment",
      score: parseFloat(audit.scoreSentimentNumeric ?? "0"),
      weight: "20%",
      key: "sentiment",
    },
    {
      label: "Context",
      score: parseFloat(audit.scoreContextNumeric ?? "0"),
      weight: "15%",
      key: "context",
    },
    {
      label: "Accuracy",
      score: parseFloat(audit.scoreAccuracy ?? "0"),
      weight: "15%",
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
        {engines.length} engines · {audit.promptsCount ?? 10} prompts × {audit.runsPerPrompt ?? 5}{" "}
        runs = {audit.totalCalls ?? "—"} calls · US$
        {audit.totalCostUsd ? parseFloat(audit.totalCostUsd).toFixed(4) : "0"}
      </p>

      {/* Composite Score */}
      <div className="border rounded-lg p-6 mb-8 text-center">
        <p className="text-sm text-muted-foreground">AI Visibility Score</p>
        <p className="text-5xl font-bold text-primary mt-1">
          {audit.scoreComposite ? parseFloat(audit.scoreComposite).toFixed(1) : "—"}
        </p>
        {ci?.composite && (
          <p className="text-xs text-muted-foreground mt-1">
            95% CI: {ci.composite.lower.toFixed(1)} — {ci.composite.upper.toFixed(1)}
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
              weight={d.weight}
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
              <span className="text-xs text-muted-foreground capitalize">{c.engine}</span>
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
