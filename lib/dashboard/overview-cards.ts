import { and, eq, gte, lt } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { audits } from "@/db/schema";
import { getAuditCosts } from "@/lib/audit/answered-count";
import {
  COST_INCOMPLETE_LABEL,
  formatAudCents,
  formatUsd,
  usdToAudCents,
} from "@/lib/constants/currency";
import { formatInOrgTimezone, getOrgTimezone, monthInTzSql } from "@/lib/platform/org-timezone";
import {
  type DimensionResult,
  MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE,
} from "@/lib/scoring/dimension-result";

/**
 * Overview (7 Nov), items 1-2: what the "Audits this month", "LLM spend" and "Avg visibility" cards
 * count, so each card can say it.
 *
 * Before this the page counted "this month" from the server's own midnight (UTC on Vercel: 11 am on
 * the 1st in Sydney), summed audits.total_cost_usd of complete audits only (a failed audit's billed
 * calls were left out, while "34 audits" counted it), and averaged every brand's latest audit,
 * deleted brands' included, without saying which brands were left out.
 */

export interface OverviewMonth {
  /** Audits started this calendar month in Sydney time, whatever their status. */
  auditCount: number;
  /** Those audits' own calls (answers and failed calls), as each call recorded its cost. */
  auditsUsd: number;
  /** Paid checks run on those audits afterwards (competitor comparisons, query fan-out), AUD cents. */
  otherFeaturesAudCents: number;
  /** Part of the cost had no price (lib/audit/answered-count.ts). */
  incomplete: boolean;
}

/** One window for both cards: audits created in this Sydney calendar month, and what they cost. */
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
  const costs = await getAuditCosts(
    tx,
    rows.map((r) => r.id),
  );
  let auditsUsd = 0;
  let otherFeaturesAudCents = 0;
  let incomplete = false;
  for (const cost of costs.values()) {
    auditsUsd += cost.knownUsd;
    otherFeaturesAudCents += cost.followUpAudCents;
    incomplete ||= cost.incomplete;
  }
  return { auditCount: rows.length, auditsUsd, otherFeaturesAudCents, incomplete };
}

/** "Since 1 Nov, Sydney time" -- the window both month cards count. */
export function monthWindowLabel(now: Date, organizationId: string): string {
  return `Since 1 ${formatInOrgTimezone(now, organizationId, "MMM")}, Sydney time`;
}

export const SPEND_CARD_LABEL = "LLM spend this month (Sydney time)";

export interface SpendCard {
  value: string;
  sub: string;
  /** The card's "how this is counted" note, readable on tap and focus. */
  note: string;
}

export function spendCard(month: OverviewMonth): SpendCard {
  const auditsCents = usdToAudCents(month.auditsUsd);
  const total = auditsCents + month.otherFeaturesAudCents;
  return {
    value: `A$${formatAudCents(total)}`,
    sub:
      `${month.incomplete ? `${COST_INCOMPLETE_LABEL} · ` : ""}` +
      `Audits A$${formatAudCents(auditsCents)} · Other features A$${formatAudCents(month.otherFeaturesAudCents)}`,
    note:
      "The same window as Audits this month: audits started since the 1st, Sydney time, whatever their status. " +
      `Audits: their answers and failed calls, as each call recorded its cost (${formatUsd(month.auditsUsd)} provider usage). ` +
      "Other features: competitor comparisons and query fan-out run on those audits afterwards. " +
      "Not included: content drafts, answer capsules, journeys and brand set-up, which don't record their cost yet.",
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
