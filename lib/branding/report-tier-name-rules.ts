import { z } from "zod/v4";
import { DEFAULT_TIER_NAMES, REPORT_TIERS, type TierNames } from "@/lib/reports/report-tiers";

/**
 * S01 part 10 (LLD 7.5, 8.1.7 D-RT3; contract P18.error): the rule for the names an agency sells its report types
 * under -- each 1-24 characters after trimming, plain text with no line breaks or control characters, the three
 * different ignoring case (the migration's CHECK report_tier_names_ok says the same). No database here: the Report
 * names card checks as the user types, and the route checks again (lib/branding/report-tier-names.ts saves).
 */

export const TIER_NAME_MAX = 24;
export const TIER_NAME_PROBLEM = "Use 1–24 characters, different from your other report names.";

const CONTROL = /[\p{Cc}]/u;

function nameProblem(name: string): boolean {
  const v = name.trim();
  return v.length < 1 || v.length > TIER_NAME_MAX || CONTROL.test(name);
}

/** Which of the three names breaks the rule (P18.error, under that field); empty when all are fine. */
export function tierNameProblems(names: TierNames): Array<keyof TierNames> {
  const bad = new Set<keyof TierNames>();
  for (const t of REPORT_TIERS) if (nameProblem(names[t])) bad.add(t);
  for (const a of REPORT_TIERS)
    for (const b of REPORT_TIERS)
      if (a < b && names[a].trim().toLowerCase() === names[b].trim().toLowerCase()) {
        bad.add(a);
        bad.add(b);
      }
  return REPORT_TIERS.filter((t) => bad.has(t));
}

/** PUT /api/report-branding's `reportTierNames`: the three names, or null for the defaults. */
export const reportTierNamesSchema = z
  .strictObject({ basic: z.string(), standard: z.string(), enhanced: z.string() })
  .nullable()
  .refine((n) => n === null || tierNameProblems(n).length === 0, { message: TIER_NAME_PROBLEM });

/** What's stored: trimmed names, or null when they're the defaults (nothing to keep). */
export function storedTierNames(names: TierNames | null): TierNames | null {
  if (names === null) return null;
  const trimmed: TierNames = {
    basic: names.basic.trim(),
    standard: names.standard.trim(),
    enhanced: names.enhanced.trim(),
  };
  return REPORT_TIERS.every((t) => trimmed[t] === DEFAULT_TIER_NAMES[t]) ? null : trimmed;
}
