"use client";

/**
 * 16 Nov, part 4 -- the wizard's "What kind of business?": Tradies, Allied health, SaaS / software, or Other local
 * business. It replaced the vertical-pack cards, which offered only the three seeded packs (a café had to pick
 * Tradies) and locked "v1.1" cards for professional services and real estate. Those two have no question pack, so
 * they aren't offered here: a law firm or an agent picks "Other local business" and confirms its type (Legal
 * services, Real estate) on the next screen, and its questions come from that type -- as every confirmed brand's do.
 */
export const BUSINESS_KINDS = [
  {
    vertical: "tradies",
    name: "Tradies",
    hint: "Plumbers, electricians, builders and other trades",
  },
  {
    vertical: "allied_health",
    name: "Allied health",
    hint: "Dentists, physios, psychologists and other clinics",
  },
  {
    vertical: "saas",
    name: "SaaS / software",
    hint: "Software and online products",
  },
  {
    vertical: "local_business",
    name: "Other local business",
    hint: "Cafés, gyms, salons, shops, accountants, lawyers, real estate agents…",
  },
] as const;

export function BusinessKindPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (vertical: string) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="What kind of business?"
      className="grid grid-cols-1 sm:grid-cols-2"
      style={{ gap: 12 }}
    >
      {BUSINESS_KINDS.map((kind) => {
        const selected = value === kind.vertical;
        return (
          <button
            key={kind.vertical}
            type="button"
            role="radio"
            aria-checked={selected}
            data-business-kind={kind.vertical}
            onClick={() => onChange(kind.vertical)}
            style={{
              textAlign: "left",
              padding: 16,
              borderRadius: 8,
              cursor: "pointer",
              background: selected ? "var(--accent-blue-soft)" : "var(--bg-elevated)",
              border: `1px solid ${selected ? "var(--accent-blue)" : "var(--border-default)"}`,
            }}
          >
            <span
              style={{
                display: "block",
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 4,
              }}
            >
              {kind.name}
            </span>
            <span style={{ display: "block", fontSize: 12, color: "var(--text-secondary)" }}>
              {kind.hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}
