import { eq } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { brands } from "@/db/schema";
import { isEnabled } from "@/lib/flags/flags";
import { effectiveTier } from "@/lib/pricing/effective-tier";
import { loadAuditQuestionMix, type QuestionMix } from "@/lib/questions/mix";
import { getBeyondAiAnswers } from "./beyond-ai";
import { applyRefreshOutcomes, type RefreshOutcome } from "./enhanced-checks";
import type { ReportData } from "./report-data";
import { reportFindings } from "./report-findings";
import { reportCurationAllowed } from "./report-preferences-service";
import {
  buildReportSnapshot,
  type ReportDataV2,
  type ReportSnapshot,
  type ReportV2,
} from "./report-snapshot";
import { chooseReportTier, loadTierNames } from "./report-tier-choice";
import { pagesForTier, planNamesTiers, type ReportTier } from "./report-tiers";
import { loadWhatToDoNext } from "./what-to-do-next";

/**
 * S01 parts 7-8 (LLD 8.1.2, 8.1.3, 8.1.4, 8.1.7): a report's v2 contents for its tier, read with the same functions as
 * the audit page and the panel (no second calculation): "What to do next" for Standard and Enhanced, "Beyond AI answers"
 * for Enhanced (as of the report's own time), the tier's page set and name, and the question mix. Called only while
 * report_v2 is on; the caller has already checked the tier against the plan.
 */
export async function buildReportV2(
  db: DbClient,
  input: {
    data: ReportData;
    tier: ReportTier;
    now: Date;
    plan?: string;
    /** S01 part 9: what the Enhanced refresh step did (a check it couldn't finish prints its failure line). */
    refresh?: RefreshOutcome[];
    /**
     * S01B part 4: the report these contents are for, when its row is already written (an Enhanced report's are built
     * after its checks), so "Done since the last report" is measured from the report before it, not from itself.
     */
    reportId?: string;
  },
): Promise<ReportV2> {
  const { data, tier, now } = input;
  const organizationId = data.organizationId;
  const plan = input.plan ?? (await effectiveTier(db, organizationId));
  const [[brand], names] = await Promise.all([
    db
      .select({
        id: brands.id,
        name: brands.name,
        domain: brands.domain,
        region: brands.region,
        categories: brands.categories,
        abn: brands.abn,
        youtubeChannelUrl: brands.youtubeChannelUrl,
        suburb: brands.suburb,
        state: brands.state,
        postcode: brands.postcode,
      })
      .from(brands)
      .where(eq(brands.id, data.brand.id)),
    // The workspace row's names (brand_id IS NULL; the newest wins if duplicated), Agency and up.
    loadTierNames(db, organizationId, plan),
  ]);
  const withActions = tier !== "basic";
  // S03 part 6 (LLD 8.3.3, P09.method): who wrote the basis audit's questions, while agency_questions is on; stored
  // with the snapshot, so the line never changes after the report is sent.
  const questionMix = (await isEnabled("agency_questions", organizationId))
    ? await loadAuditQuestionMix(db, { organizationId, auditId: data.basis.auditId })
    : null;
  const [whatToDoNext, beyondAi] = await Promise.all([
    withActions
      ? loadWhatToDoNext(db, {
          organizationId,
          brandId: data.brand.id,
          basisAuditId: data.basis.auditId,
          basisAuditNumber: data.basis.auditNumber,
          findings: reportFindings(data),
          curated: reportCurationAllowed(plan),
          now,
          excludeReportId: input.reportId,
        })
      : Promise.resolve(null),
    tier === "enhanced" && brand
      ? getBeyondAiAnswers(db, {
          brand: { ...brand, categories: brand.categories ?? [] },
          asOf: now,
          basisAuditId: data.basis.auditId,
        }).then((answers) =>
          input.refresh ? applyRefreshOutcomes(answers, input.refresh, now) : answers,
        )
      : Promise.resolve(null),
  ]);
  return {
    tier,
    tierLabel: names[tier],
    coverTierName: planNamesTiers(plan) ? names[tier] : null,
    sections: pagesForTier(tier),
    whatToDoNext,
    beyondAi,
    agencyName: data.agency.name,
    questionMix: {
      everyday: data.questions.everyday,
      branded: data.questions.branded,
      bySource: { original: data.questions.everyday },
      ...(questionMix ? { detail: questionMixDetail(questionMix) } : {}),
    },
  };
}

/** The snapshot keeps only what the PDF prints (amendment 41): the mix, not the split (the audit page's). */
function questionMixDetail({ split: _split, ...mix }: QuestionMix): Omit<QuestionMix, "split"> {
  return mix;
}

/**
 * At generation (generate-narrative-report): while report_v2 is on, the report's v2 contents for its tier and the
 * snapshot to store on the row; off, null -- the report is today's, with no snapshot, and renders as today.
 *
 * S01 part 8 (LLD 8.1.7): the tier is decided here, on the server, from the workspace's live plan. `tier` is the one
 * asked for -- the generate route's (already checked against the plan there), or the delivery schedule's -- and none
 * means the brand's saved default, else the plan's highest (chooseReportTier). A tier above the plan (the plan changed
 * since, or a schedule saved on a higher plan) is capped at the plan, with an operator log line; a plan with no
 * reports at all gets today's report (Basic), as a schedule did before tiers.
 */
export async function reportV2ForGeneration(
  db: DbClient,
  input: {
    data: ReportData;
    tier?: ReportTier | null;
    now: Date;
    source?: "manual" | "schedule";
    refresh?: RefreshOutcome[];
  },
): Promise<{
  tier: ReportTier;
  plan: string;
  data: ReportDataV2;
  snapshot: ReportSnapshot;
} | null> {
  const decided = await decideReportTier(db, input);
  if (!decided) return null;
  return buildDecidedReportV2(db, { ...input, decided });
}

/**
 * S01 parts 8-9: the tier a report is (null while report_v2 is off), decided before anything is built -- so an Enhanced
 * report can be written first, its checks refreshed, and its contents built after (generate-narrative-report).
 */
export async function decideReportTier(
  db: DbClient,
  input: { data: ReportData; tier?: ReportTier | null; source?: "manual" | "schedule" },
): Promise<{ tier: ReportTier; plan: string } | null> {
  const organizationId = input.data.organizationId;
  if (!(await isEnabled("report_v2", organizationId))) return null;
  const choice = await chooseReportTier(db, {
    organizationId,
    brandId: input.data.brand.id,
    requested: input.tier ?? null,
  });
  const tier = choice.tier ?? "basic";
  if (choice.overLimit || choice.tier === null) {
    console.info(
      JSON.stringify({
        event: "report_tier_capped",
        organizationId,
        brandId: input.data.brand.id,
        plan: choice.plan,
        requested: input.tier ?? null,
        tier,
        source: input.source ?? "manual",
      }),
    );
  }
  return { tier, plan: choice.plan };
}

/** The report's v2 contents and snapshot for a tier already decided (decideReportTier). */
export async function buildDecidedReportV2(
  db: DbClient,
  input: {
    data: ReportData;
    decided: { tier: ReportTier; plan: string };
    now: Date;
    refresh?: RefreshOutcome[];
    /** S01B part 4: the report's own row, when it's already written (see buildReportV2). */
    reportId?: string;
  },
): Promise<{ tier: ReportTier; plan: string; data: ReportDataV2; snapshot: ReportSnapshot }> {
  const { tier, plan } = input.decided;
  const v2 = await buildReportV2(db, {
    data: input.data,
    tier,
    now: input.now,
    plan,
    refresh: input.refresh,
    reportId: input.reportId,
  });
  const data: ReportDataV2 = { ...input.data, v2 };
  return { tier, plan, data, snapshot: buildReportSnapshot(data) };
}
