"use client";

interface Props {
  present: boolean | null;
  accurate: boolean | null;
  url: string | null;
}

export function KnowledgePanelCard({ present, accurate, url }: Props) {
  const status = present === true
    ? (accurate === true ? "Present & accurate" : "Present but inaccurate")
    : "Not found";

  const isOk = present === true && accurate === true;

  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)", backgroundColor: "var(--background)" }}
    >
      <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>Knowledge Panel</p>
      <div className="mt-2 flex items-center gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{
            backgroundColor: isOk
              ? "color-mix(in srgb, var(--success) 15%, transparent)"
              : "color-mix(in srgb, var(--warning) 15%, transparent)",
            color: isOk ? "var(--success)" : "var(--warning)",
          }}
        >
          {status}
        </span>
      </div>
      {url && (
        <p className="mt-2 text-xs truncate" style={{ color: "var(--accent-primary)" }}>{url}</p>
      )}
    </div>
  );
}
