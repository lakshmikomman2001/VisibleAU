import { and, eq, gte, lt } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { audits } from "@/db/schema";
import { formatInOrgTimezone, getOrgTimezone, monthInTzSql } from "@/lib/platform/org-timezone";
import {
  type DimensionResult,
  MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE,
} from "@/lib/scoring/dimension-result";

/**
 * Overview (7 Nov), items 1-2: what the "Audits this month" and "Avg visibility" cards count, so each card
 * can say it. Part 14 (Sri, 13 Nov): the "LLM spend this month" card is gone -- what we pay the providers
 * is for operators only, on /admin/costs (lib/admin/costs.ts).
 *
 * Before this the page counted "this month" from the server's own midnight (UTC on Vercel: 11 am on
 * the 1st in Sydney), summed audits.total_cost_usd of complete audits only (a failed audit's billed
 * calls were left out, while "34 audits" counted it), and averaged every brand's latest audit,
 * deleted brands' included, without saying which brands were left out.
 */

export interface OverviewMonth {
  /** Audits started this calendar month in Sydney time, whatever their status. */
  auditCount: number;
}

/** The audits created in this Sydney calendar month. */
export async function getOverviewMonth(
  tx: DbClient,
  organizationId: string,
  now: Date,
): Promise<OverviewMonth> {
  const { start, end } = monthInTzSql(getOrgTimezone(organizationId), now);
  const rows = await tx
    .select({ id: audits.id })
    .from(audits)
    .where(
      and(
        eq(audits.organizationId, organizationId),
        gte(audits.createdAt, start),
        lt(audits.createdAt, end),
      ),
    );
  return { auditCount: rows.length };
}

/** "Since 1 Nov, Sydney time" -- the window both month cards count. */
export function monthWindowLabel(now: Date, organizationId: string): string {
  return `Since 1 ${formatInOrgTimezone(now, organizationId, "MMM")}, Sydney time`;
}

export const LATEST_AUDIT_CARD_LABEL = "Latest audit";

const AUDIT_STATUS_WORDS: Record<string, string> = {
  pending: "Queued",
  running: "Running",
  complete: "Complete",
  failed: "Failed",
};

/**
 * Part 14 (Sri, 13 Nov): the overview's 4th card, in place of "LLM spend this month" (what we pay the
 * providers is for operators only). The workspace's most recent audit as it stands: its date in Sydney
 * time, its brand and its status. Nothing estimated.
 */
export function latestAuditCard(
  latest: { brandName: string; status: string; createdAt: Date } | null,
  organizationId: string,
): { value: string; sub: string } {
  if (!latest) return { value: "—", sub: "No audits yet" };
  return {
    value: formatInOrgTimezone(latest.createdAt, organizationId, "d MMM"),
    sub: `${latest.brandName} · ${AUDIT_STATUS_WORDS[latest.status] ?? latest.status}`,
  };
}

export interface BrandVisibility {
  /** The latest complete audit's headline, or null when the brand has no complete audit. */
  headline: DimensionResult | null;
  /** That audit is missing a whole engine (lib/audit/engine-failure.ts). */
  missingAnEngine: boolean;
  /** That audit's methodology version (audits.methodology_version), when known. */
  methodologyVersion?: number | null;
}

export interface VisibilityAverage {
  /** The plain mean of the included brands' Visibility; null when no brand has one. */
  value: number | null;
  included: number;
  /** Of the included, latest audits missing a whole engine. */
  missingAnEngine: number;
  noAudit: number;
  notEnoughAnswers: number;
  /** How many methodology versions the averaged audits use (live invite test follow-ups, part 4). */
  methods: number;
}

/** Each brand's latest complete audit counts once; brands without a scored headline are counted, not averaged. */
export function averageVisibility(brands: readonly BrandVisibility[]): VisibilityAverage {
  const values: number[] = [];
  let missingAnEngine = 0;
  let noAudit = 0;
  let notEnoughAnswers = 0;
  const versions = new Set<number>();
  for (const brand of brands) {
    if (brand.headline === null) noAudit++;
    else if (brand.headline.status !== "scored") notEnoughAnswers++;
    else {
      values.push(brand.headline.value);
      if (brand.missingAnEngine) missingAnEngine++;
      if (brand.methodologyVersion != null) versions.add(brand.methodologyVersion);
    }
  }
  return {
    value: values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length,
    included: values.length,
    missingAnEngine,
    noAudit,
    notEnoughAnswers,
    methods: versions.size,
  };
}

/**
 * Live invite test follow-ups (8 Nov), part 4 -- said under the average when the audits it averages were
 * measured with different methodology versions: the figure isn't changed, but the reader should know it
 * mixes methods.
 */
export const MIXED_METHODS_NOTE = "Latest audits use different methods";

/** "Average of 3 brands' latest audits · 1 without enough answers · 1 with no audit yet". */
export function averageVisibilitySub(avg: VisibilityAverage): string {
  const left: string[] = [];
  if (avg.notEnoughAnswers > 0) left.push(`${avg.notEnoughAnswers} without enough answers`);
  if (avg.noAudit > 0) left.push(`${avg.noAudit} with no audit yet`);
  if (avg.included === 0) {
    return avg.notEnoughAnswers === 0 ? "Run audits to see it" : left.join(" · ");
  }
  const parts = [
    avg.included === 1
      ? "Average of 1 brand's latest audit"
      : `Average of ${avg.included} brands' latest audits`,
  ];
  if (avg.missingAnEngine > 0) {
    const which =
      avg.missingAnEngine === avg.included
        ? avg.included === 1
          ? "it"
          : "all"
        : String(avg.missingAnEngine);
    parts.push(`${which} missing an engine`);
  }
  if (avg.methods > 1) parts.push(MIXED_METHODS_NOTE);
  return [...parts, ...left].join(" · ");
}

export const AVG_VISIBILITY_NOTE =
  "A plain average of each brand's Visibility in its latest complete audit: every brand counts once, " +
  "however many answers its audit had. Left out: brands with no complete audit, and brands whose latest " +
  `audit had fewer than ${MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE} answers to everyday questions.`;
