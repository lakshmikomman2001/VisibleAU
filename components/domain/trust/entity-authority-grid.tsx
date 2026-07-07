"use client";

interface EntityData {
  abnVerified: boolean;
  abnNumber: string | null;
  abnEntityName: string | null;
  wikipediaAuPresent: boolean;
  wikipediaAuUrl: string | null;
  auDirectoryPresence: unknown[];
}

export function EntityAuthorityGrid({ data }: { data: EntityData }) {
  const items = [
    {
      label: "ABN Registry",
      status: data.abnVerified ? "Verified" : "Not verified",
      detail: data.abnNumber ? `${data.abnNumber}${data.abnEntityName ? ` — ${data.abnEntityName}` : ""}` : null,
      ok: data.abnVerified,
    },
    {
      label: "Wikipedia (AU)",
      status: data.wikipediaAuPresent ? "Present" : "Not found",
      detail: data.wikipediaAuUrl,
      ok: data.wikipediaAuPresent,
    },
    {
      label: "Directory Presence",
      status: `${Array.isArray(data.auDirectoryPresence) ? data.auDirectoryPresence.length : 0} directories`,
      detail: null,
      ok: Array.isArray(data.auDirectoryPresence) && data.auDirectoryPresence.length > 0,
    },
  ];

  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)", backgroundColor: "var(--background)" }}
    >
      <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>Authority Signals</p>
      <div className="mt-3 space-y-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{item.label}</p>
              {item.detail && <p className="text-xs" style={{ color: "var(--muted)" }}>{item.detail}</p>}
            </div>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: item.ok
                  ? "color-mix(in srgb, var(--success) 15%, transparent)"
                  : "color-mix(in srgb, var(--destructive) 15%, transparent)",
                color: item.ok ? "var(--success)" : "var(--destructive)",
              }}
            >
              {item.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
