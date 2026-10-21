"use client";

interface EntityData {
  abnVerified: boolean;
  abnNumber: string | null;
  abnEntityName: string | null;
  wikipediaAuPresent: boolean;
  wikipediaAuUrl: string | null;
}

// Vunnara (21 Oct, "directory listings... never scraping", Part A3):
// a neutral third state, alongside the existing green/red "ok" --
// "Directory Presence" is never measured here any more (the checker
// that fed it requested a page neither hipages nor ServiceSeeking
// actually permitted), so it must never render as a confident green
// "N directories" or a false red "0 directories" -- both would assert
// a fact this grid doesn't have. `ok: null` renders neutrally.
type AuthorityItem = {
  label: string;
  status: string;
  detail: string | null;
  ok: boolean | null;
};

export function EntityAuthorityGrid({ data }: { data: EntityData }) {
  const items: AuthorityItem[] = [
    {
      label: "ABN Registry",
      status: data.abnVerified ? "Verified" : "Not verified",
      detail: data.abnNumber
        ? `${data.abnNumber}${data.abnEntityName ? ` — ${data.abnEntityName}` : ""}`
        : null,
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
      status: "Not measured",
      detail: null,
      ok: null,
    },
  ];

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)",
        backgroundColor: "var(--background)",
      }}
    >
      <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>
        Authority Signals
      </p>
      <div className="mt-3 space-y-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                {item.label}
              </p>
              {item.detail && (
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  {item.detail}
                </p>
              )}
            </div>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor:
                  item.ok === null
                    ? "color-mix(in srgb, var(--muted) 15%, transparent)"
                    : item.ok
                      ? "color-mix(in srgb, var(--success) 15%, transparent)"
                      : "color-mix(in srgb, var(--destructive) 15%, transparent)",
                color:
                  item.ok === null
                    ? "var(--muted)"
                    : item.ok
                      ? "var(--success)"
                      : "var(--destructive)",
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
