"use client";

interface EntityHomeStatus {
  orgSchemaPresent: boolean;
  idFieldPresent: boolean;
  sameAsCount: number;
  pageUrl: string | null;
}

interface EntityHomeCardProps {
  entityHomeStatus: EntityHomeStatus | null;
}

export function EntityHomeCard({ entityHomeStatus }: EntityHomeCardProps) {
  if (!entityHomeStatus) {
    return (
      <div className="rounded-lg border p-5" style={{ borderColor: "color-mix(in srgb, var(--destructive) 30%, transparent)", backgroundColor: "color-mix(in srgb, var(--destructive) 5%, transparent)" }}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>Entity Home</h3>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "color-mix(in srgb, var(--destructive) 15%, transparent)", color: "var(--destructive)" }}>Not identified</span>
        </div>
        <p className="mt-2 text-sm" style={{ color: "var(--destructive)" }}>
          We haven&apos;t identified your Entity Home yet &mdash; run an audit to detect the page anchoring your brand identity for AI engines.
        </p>
      </div>
    );
  }

  const isComplete = entityHomeStatus.orgSchemaPresent && entityHomeStatus.idFieldPresent && entityHomeStatus.sameAsCount >= 3;

  const gaps: string[] = [];
  if (!entityHomeStatus.orgSchemaPresent) gaps.push("Missing Organisation JSON-LD on Entity Home page.");
  if (!entityHomeStatus.idFieldPresent) gaps.push("@id field not pointing to canonical domain.");
  if (entityHomeStatus.sameAsCount < 3) gaps.push(`Only ${entityHomeStatus.sameAsCount} sameAs declarations (target: ≥3).`);

  const statusColor = isComplete ? "var(--success)" : "var(--warning)";
  const borderColor = isComplete ? "var(--success)" : "var(--warning)";

  return (
    <div className="rounded-lg border p-5" style={{ borderColor: `color-mix(in srgb, ${borderColor} 30%, transparent)`, backgroundColor: `color-mix(in srgb, ${borderColor} 5%, transparent)` }}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>Entity Home</h3>
        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `color-mix(in srgb, ${statusColor} 15%, transparent)`, color: statusColor }}>
          {isComplete ? "Complete" : "Incomplete"}
        </span>
      </div>

      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
        Page found: {entityHomeStatus.pageUrl ?? "unknown"} &mdash; {isComplete ? "Entity Home fully configured." : "Entity Home needs attention."}
      </p>

      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <span style={{ color: "var(--foreground)" }}>
          @id: <strong style={{ color: entityHomeStatus.idFieldPresent ? "var(--success)" : "var(--destructive)" }}>
            {entityHomeStatus.idFieldPresent ? "present" : "missing"}
          </strong>
        </span>
        <span style={{ color: "var(--foreground)" }}>
          sameAs count: <strong style={{ color: entityHomeStatus.sameAsCount >= 3 ? "var(--success)" : "var(--warning)" }}>
            {entityHomeStatus.sameAsCount}/3 required
          </strong>
        </span>
        <span style={{ color: "var(--foreground)" }}>
          Organisation schema: <strong style={{ color: entityHomeStatus.orgSchemaPresent ? "var(--success)" : "var(--destructive)" }}>
            {entityHomeStatus.orgSchemaPresent ? "present" : "missing"}
          </strong>
        </span>
      </div>

      {gaps.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <div className="text-xs font-medium" style={{ color: "var(--muted)" }}>Gaps</div>
          {gaps.map((gap, i) => (
            <div key={i} className="text-sm rounded px-2 py-1" style={{ backgroundColor: "color-mix(in srgb, var(--warning) 10%, transparent)", color: "var(--foreground)" }}>
              {gap}
            </div>
          ))}
          <button className="mt-2 text-sm font-medium" style={{ color: "var(--accent-primary)" }}>
            Fix entity schema &rarr;
          </button>
        </div>
      )}
    </div>
  );
}
