"use client";

export interface EntityGridData {
  abnVerified: boolean;
  abnNumber: string | null;
  abnEntityName: string | null;
  /** "check_skipped" when the ABR lookup didn't run; null when no lookup result was recorded. */
  abnStatus?: string | null;
  wikipediaAuPresent: boolean;
  wikipediaAuUrl: string | null;
  /**
   * 17 Nov, part 3: the Wikipedia lookup's own state, from the technical audit that wrote this row; null when
   * it wasn't recorded (an audit from before then kept only true/false, and false covered a failed lookup).
   */
  wikipediaAuStatus?: "found" | "not_found" | "unavailable" | null;
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

/**
 * 17 Nov, part 3: an ABN counts as checked the way the score counts it (lib/brand-entity/score.ts's
 * entityScoreBasis): verified, or a lookup status other than "check_skipped". Otherwise it's "Not checked",
 * neutral; it showed a red "Not verified" when the lookup was skipped.
 */
function abnItem(data: EntityGridData): AuthorityItem {
  const detail = data.abnNumber
    ? `${data.abnNumber}${data.abnEntityName ? ` — ${data.abnEntityName}` : ""}`
    : null;
  if (data.abnVerified) return { label: "ABN Registry", status: "Verified", detail, ok: true };
  const status = data.abnStatus ?? null;
  if (status === null || status === "check_skipped") {
    return {
      label: "ABN Registry",
      status: "Not checked",
      detail: detail ?? "No ABN lookup result was recorded.",
      ok: null,
    };
  }
  return {
    label: "ABN Registry",
    status: "Not verified",
    detail: `${detail ?? "ABN"} (registry status: ${status})`,
    ok: false,
  };
}

/**
 * 17 Nov, part 3: "Not found" only when the lookup completed and found nothing; "Couldn't check" when it
 * didn't complete; and, when the state wasn't recorded, "None found" (neutral) saying it can't tell which.
 */
function wikipediaItem(data: EntityGridData): AuthorityItem {
  if (data.wikipediaAuPresent) {
    return { label: "Wikipedia (AU)", status: "Present", detail: data.wikipediaAuUrl, ok: true };
  }
  if (data.wikipediaAuStatus === "unavailable") {
    return {
      label: "Wikipedia (AU)",
      status: "Couldn't check",
      detail: "The Wikipedia lookup didn't complete on this check.",
      ok: null,
    };
  }
  if (data.wikipediaAuStatus === "not_found") {
    return { label: "Wikipedia (AU)", status: "Not found", detail: null, ok: false };
  }
  return {
    label: "Wikipedia (AU)",
    status: "None found",
    detail: "This check didn't record whether the Wikipedia lookup completed.",
    ok: null,
  };
}

export function EntityAuthorityGrid({ data }: { data: EntityGridData }) {
  const items: AuthorityItem[] = [
    abnItem(data),
    wikipediaItem(data),
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
      <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
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
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {item.detail}
                </p>
              )}
            </div>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              data-signal-ok={item.ok === null ? "neutral" : String(item.ok)}
              style={{
                backgroundColor:
                  item.ok === null
                    ? "color-mix(in srgb, var(--text-secondary) 15%, transparent)"
                    : item.ok
                      ? "color-mix(in srgb, var(--success) 15%, transparent)"
                      : "color-mix(in srgb, var(--danger) 15%, transparent)",
                color:
                  item.ok === null
                    ? "var(--text-secondary)"
                    : item.ok
                      ? "var(--success)"
                      : "var(--danger)",
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
