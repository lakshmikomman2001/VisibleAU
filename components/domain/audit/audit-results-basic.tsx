import { StatusBadge } from "@/components/domain/shared/status-badge";
import type { Audit, Citation } from "@/db/schema";

export function AuditResultsBasic({ audit, citations }: { audit: Audit; citations: Citation[] }) {
  const mentioned = citations.filter((c) => c.brandMentioned);
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Audit #{audit.auditNumber}</h1>
        <StatusBadge status={audit.status} />
      </div>
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Score</p>
          <p className="text-3xl font-bold">
            {audit.scoreComposite ? `${parseFloat(audit.scoreComposite).toFixed(1)}` : "—"}
          </p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Mentions</p>
          <p className="text-3xl font-bold">
            {mentioned.length}/{citations.length}
          </p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Cost</p>
          <p className="text-3xl font-bold">
            US${audit.totalCostUsd ? parseFloat(audit.totalCostUsd).toFixed(4) : "0"}
          </p>
        </div>
      </div>
      <h2 className="text-lg font-semibold mb-4">Citations ({citations.length})</h2>
      <div className="space-y-3">
        {citations.map((c) => (
          <div key={c.id} className="border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${c.brandMentioned ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}
              >
                {c.brandMentioned ? "Mentioned" : "Not mentioned"}
              </span>
              <span className="text-xs text-muted-foreground">{c.engine}</span>
            </div>
            <p className="text-sm text-muted-foreground mb-1">{c.prompt}</p>
            <p className="text-sm">{c.responseSnippet}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
