"use client";

import { Check, X } from "lucide-react";
import type { PublicGoogleAi } from "@/lib/marketing/google-ai";
import {
  type ComparisonRow,
  comparisonIncludes,
  comparisonRows,
  PLAN_FEATURE_COPY,
  TIER_DEFINITIONS,
} from "@/lib/pricing/tiers";

/** A row's key on the page: which feature, from-plan row or value row it is. */
function rowKey(row: ComparisonRow): string {
  if ("feature" in row) return `feature:${row.feature}`;
  if ("from" in row) return `from:${row.label}`;
  return `value:${row.label}`;
}

/**
 * 6 Nov -- every plan, Enterprise included, and every row from lib/pricing/tiers.ts
 * (COMPARISON_ROWS): no ticks of its own. A server-checked feature's row is named and
 * described as the app's locks name it.
 * 16 Nov: with Google's AI answers' row while the global setting has them on (`googleAi`, the pricing page's
 * loadGoogleAiClaim()).
 */
export function TierComparisonTable({
  showFreeTier,
  googleAi = null,
}: {
  showFreeTier: boolean;
  googleAi?: PublicGoogleAi | null;
}) {
  const tiers = showFreeTier ? TIER_DEFINITIONS : TIER_DEFINITIONS.filter((t) => t.key !== "free");

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
                    color: t.popular ? "var(--accent-blue)" : "var(--text-primary)",
                    minWidth: 100,
                  }}
                >
                  {t.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comparisonRows(googleAi).map((row) => (
              <tr
                key={rowKey(row)}
                data-row={rowKey(row)}
                style={{ borderBottom: "1px solid var(--border-subtle)" }}
              >
                <td className="py-2.5 px-4" style={{ color: "var(--text-secondary)" }}>
                  {"feature" in row ? (
                    <>
                      {PLAN_FEATURE_COPY[row.feature].name}
                      <span className="block text-xs" style={{ color: "var(--text-tertiary)" }}>
                        {PLAN_FEATURE_COPY[row.feature].description}
                      </span>
                    </>
                  ) : "description" in row && row.description ? (
                    // 19 Nov: a from-plan row's grey line (Google's AI answers: lib/marketing/google-ai.ts).
                    <>
                      {row.label}
                      <span
                        className="block text-xs"
                        style={{ color: "var(--text-tertiary)" }}
                        data-row-description=""
                      >
                        {row.description}
                      </span>
                    </>
                  ) : (
                    row.label
                  )}
                </td>
                {tiers.map((t) => {
                  const included = comparisonIncludes(row, t.key);
                  return (
                    <td
                      key={t.key}
                      data-plan={t.key}
                      {...(included === null ? {} : { "data-included": String(included) })}
                      className="text-center py-2.5 px-4"
                    >
                      {included === null ? (
                        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                          {"value" in row ? row.value(t) : ""}
                        </span>
                      ) : included ? (
                        <>
                          <Check
                            aria-hidden="true"
                            className="inline-block"
                            style={{ width: 16, height: 16, color: "var(--success)" }}
                          />
                          <span className="sr-only">Included</span>
                        </>
                      ) : (
                        <>
                          <X
                            aria-hidden="true"
                            className="inline-block"
                            style={{ width: 16, height: 16, color: "var(--text-tertiary)" }}
                          />
                          <span className="sr-only">Not included</span>
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
