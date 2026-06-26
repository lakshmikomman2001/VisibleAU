"use client";

import { Check, X } from "lucide-react";
import { TIER_DEFINITIONS } from "@/lib/pricing/tiers";

const COMPARISON_ROWS = [
  { label: "Brands", get: (t: (typeof TIER_DEFINITIONS)[0]) => (t.brands < 0 ? "Unlimited" : String(t.brands)) },
  { label: "AI engines", get: (t: (typeof TIER_DEFINITIONS)[0]) => String(t.engines) },
  { label: "Audit frequency", get: (t: (typeof TIER_DEFINITIONS)[0]) => t.frequency },
  { label: "7-layer scoring", bool: true, tiers: ["starter", "growth", "agency", "agency_pro", "enterprise"] },
  { label: "Action items", bool: true, tiers: ["starter", "growth", "agency", "agency_pro", "enterprise"] },
  { label: "Drift alerts", bool: true, tiers: ["growth", "agency", "agency_pro", "enterprise"] },
  { label: "Competitor tracking", bool: true, tiers: ["growth", "agency", "agency_pro", "enterprise"] },
  { label: "PDF export", bool: true, tiers: ["growth", "agency", "agency_pro", "enterprise"] },
  { label: "Client portal", bool: true, tiers: ["agency", "agency_pro", "enterprise"] },
  { label: "White-label reports", bool: true, tiers: ["agency", "agency_pro", "enterprise"] },
  { label: "Webhook integrations", bool: true, tiers: ["agency", "agency_pro", "enterprise"] },
  { label: "GA4 integration", bool: true, tiers: ["agency_pro", "enterprise"] },
  { label: "SSO / SAML", bool: true, tiers: ["enterprise"] },
  { label: "Priority support", bool: true, tiers: ["agency", "agency_pro", "enterprise"] },
] as const;

export function TierComparisonTable({ showFreeTier }: { showFreeTier: boolean }) {
  const tiers = showFreeTier
    ? TIER_DEFINITIONS.filter((t) => t.key !== "enterprise")
    : TIER_DEFINITIONS.filter((t) => t.key !== "free" && t.key !== "enterprise");

  return (
    <div className="mt-16">
      <h2
        className="text-xl font-semibold text-center mb-6"
        style={{ color: "var(--text-primary)" }}
      >
        Compare plans
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
              <th
                className="text-left py-3 px-4 font-medium"
                style={{ color: "var(--text-secondary)", minWidth: 160 }}
              >
                Feature
              </th>
              {tiers.map((t) => (
                <th
                  key={t.key}
                  className="text-center py-3 px-4 font-semibold"
                  style={{
                    color: t.popular ? "#3b82f6" : "var(--text-primary)",
                    minWidth: 100,
                  }}
                >
                  {t.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARISON_ROWS.map((row) => (
              <tr
                key={row.label}
                style={{ borderBottom: "1px solid var(--border-subtle)" }}
              >
                <td
                  className="py-2.5 px-4"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {row.label}
                </td>
                {tiers.map((t) => (
                  <td key={t.key} className="text-center py-2.5 px-4">
                    {"bool" in row && row.bool ? (
                      (row.tiers as readonly string[]).includes(t.key) ? (
                        <Check
                          className="inline-block"
                          style={{ width: 16, height: 16, color: "#22c55e" }}
                        />
                      ) : (
                        <X
                          className="inline-block"
                          style={{ width: 16, height: 16, color: "var(--text-tertiary)" }}
                        />
                      )
                    ) : (
                      <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                        {"get" in row ? row.get(t) : "—"}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
