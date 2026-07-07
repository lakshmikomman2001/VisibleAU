"use client";

interface Props {
  present: boolean | null;
  url: string | null;
}

export function WikidataStatusCard({ present, url }: Props) {
  const hasEntry = present === true;

  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)", backgroundColor: "var(--background)" }}
    >
      <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>Wikidata Entry</p>
      <div className="mt-2 flex items-center gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{
            backgroundColor: hasEntry
              ? "color-mix(in srgb, var(--success) 15%, transparent)"
              : "color-mix(in srgb, var(--destructive) 15%, transparent)",
            color: hasEntry ? "var(--success)" : "var(--destructive)",
          }}
        >
          {hasEntry ? "Entry found" : "No entry"}
        </span>
      </div>
      {url && (
        <p className="mt-2 text-xs truncate" style={{ color: "var(--accent-primary)" }}>{url}</p>
      )}
    </div>
  );
}
