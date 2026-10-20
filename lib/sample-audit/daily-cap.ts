import { BudgetPolicyService } from "@/lib/platform/budget-policy.service";
import { ensureSampleOrg } from "./synthetic-org";

/**
 * Vunnara (sample-audit follow-up, 20 Oct), item 5 -- a GLOBAL daily
 * spend cap across every public, pre-signup sample audit, regardless
 * of caller IP. Every sample audit shares exactly one synthetic
 * organization (lib/sample-audit/synthetic-org.ts's "__sample__" org),
 * so BudgetPolicyService.checkDailySpend(sampleOrg.id) already sums
 * today's real spend across EVERY sample audit worldwide -- this just
 * checks that sum against a cap sized for a free, unauthenticated
 * feature, not the generic AU$100/day/org default meant for a real
 * paying tenant.
 *
 * NOTE for whoever next touches BudgetPolicyService.record(): its
 * "Skip sample org (D-03, O-03)" check compares `org.slug === "sample"`,
 * but the real sample org's slug is "__sample__" (synthetic-org.ts) --
 * that comparison never matches, so sample-audit costs ARE recorded
 * today, which is a confirmed, pre-existing mismatch from whatever
 * renamed the slug after that skip was written. Do NOT "fix" it to
 * compare against "__sample__" without also replacing what this file
 * depends on -- this cap (and the org-level checkDailySpend call
 * run-audit-inline.ts already makes for every audit, sample included)
 * both read rows that skip would stop being written.
 */
export const SAMPLE_AUDIT_DAILY_SPEND_CAP_CENTS = Number(
  process.env.SAMPLE_AUDIT_DAILY_SPEND_CAP_CENTS ?? 2000, // AU$20/day, documented default
);

export async function checkSampleAuditDailyCap(): Promise<{
  allowed: boolean;
  spentTodayCents: number;
  capCents: number;
}> {
  const sampleOrg = await ensureSampleOrg();
  const result = await BudgetPolicyService.checkDailySpend(
    sampleOrg.id,
    SAMPLE_AUDIT_DAILY_SPEND_CAP_CENTS,
  );
  return result;
}
