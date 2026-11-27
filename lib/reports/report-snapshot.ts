import type { QuestionReach } from "@/db/schema/questions";
import { type QuestionMix, questionMixLine as sourcedMixLine } from "@/lib/questions/mix-line";
import { reachHeadlineLabel } from "@/lib/reach/labels";
import type { BeyondAiAnswers } from "./beyond-ai";
import type { WhatToDoNext } from "./report-contents";
import type { ReportData } from "./report-data";
import { reportFindings } from "./report-findings";
import { pagesForTier, type ReportSectionKey, type ReportTier } from "./report-tiers";

/**
 * S01 part 7 (LLD 8.1.3, appendix D): `generated_reports.contents_snapshot` -- exactly what the PDF contained. Written
 * when the report is generated (report_v2 on); rendering and "Try again" use it, so a report sent last month never
 * changes when the Action Center, the agency's choices, the checks or the plan change. Reports without one (everything
 * before S01, and every report while report_v2 is off) keep today's rebuild from live data.
 *
 * Appendix D's summary fields are kept for readers of the row (the portal, operators); `reportData` is the render input
 * itself, so a re-render prints the same figures, items, notes and check dates.
 */

/** What report v2 adds to a report's data: the tier, its page set and the new sections' contents. */
export interface ReportV2 {
  tier: ReportTier;
  /** The tier's name in the app (the agency's name on Agency and up, else the default). */
  tierLabel: string;
  /** The cover's tier line: Agency and up only (D-RT3), else null. */
  coverTierName: string | null;
  sections: ReportSectionKey[];
  /** Standard and Enhanced. */
  whatToDoNext: WhatToDoNext | null;
  /** Enhanced. */
  beyondAi: BeyondAiAnswers | null;
  /** The agency's name for "Recommended by" and "Note from" (null without one). */
  agencyName: string | null;
  /** The questions the basis audit asked (method page: appendix E's mix line). */
  questionMix: {
    everyday: number;
    branded: number;
    bySource: { original: number };
    /** S03 part 6 (LLD 8.3.3): who wrote each question, when agency_questions was on at generation. */
    detail?: Omit<QuestionMix, "split">;
  };
  /**
   * S04 part 7 (LLD 8.4.6, P09.reachRow): the basis audit's Visibility per reach, when it had more than one and
   * visibility_reach was on at generation; the Summary page's reach row. Absent otherwise.
   */
  reaches?: ReportReach[];
}

export interface ReportReach {
  reach: QuestionReach;
  label: string;
  mentioned: number;
  answers: number;
}

export type ReportDataV2 = ReportData & { v2?: ReportV2 };

export interface ReportSnapshot {
  schema: 1;
  basisAuditId: string;
  tier: ReportTier;
  tierName: string;
  generatedAt: string;
  headline: { mentioned: number; answers: number; reaches: string[]; label: string };
  /** S04 part 7: the reach row's figures (P09.reachRow), when the report has one. */
  reaches?: ReportReach[];
  questionMix: ReportV2["questionMix"];
  findings: Array<{ rule: string; title: string; evidence: string }>;
  actions: Array<{
    kind: "measured";
    actionItemId: string | null;
    title: string;
    evidence: string;
    priority: string;
    status: string;
    note: string | null;
  }>;
  agencyActions: Array<{ id: string; title: string; detail: string | null; priority: string }>;
  doneSinceLast: Array<{ title: string; doneAt: string }>;
  generalAdvice: Array<{ title: string; evidence: string }>;
  beyondAi: BeyondAiAnswers | null;
  sections: ReportSectionKey[];
  branding: { agencyName: string | null };
  /** The render input, as stored: what the PDF prints (LLD amendment 41; storedReportData). */
  reportData: StoredReportData;
}

/**
 * LLD amendment 41: a snapshot holds only what the PDF prints -- never an operator-only cost, a provider name the
 * report doesn't show, or an id beyond appendix D's. The render input carries the workspace's and the brand's ids
 * (dates and links are worked out from them) and the other audits' ids on the trend (chart keys only): they're left
 * out here and put back from the report's own row when it renders (snapshotReportData). The report's Google block
 * carries no provider name. Costs never reach the render input at all (tests/unit/costs/no-cost-for-customers.test.ts
 * scans lib/reports; tests/integration/report-tiers.integration.test.ts checks a stored snapshot).
 */
export type StoredReportData = Omit<ReportDataV2, "organizationId" | "brand" | "trend"> & {
  brand: Omit<ReportDataV2["brand"], "id">;
  trend: Omit<ReportDataV2["trend"], "points"> & {
    points: Array<Omit<ReportDataV2["trend"]["points"][number], "auditId">>;
  };
};

export function storedReportData(data: ReportDataV2): StoredReportData {
  const { organizationId: _org, brand, trend, ...rest } = data;
  const { id: _brandId, ...storedBrand } = brand;
  const points = trend.points.map(({ auditId: _auditId, ...p }) => p);
  return { ...rest, brand: storedBrand, trend: { ...trend, points } };
}

/** The mix line (appendix E; zero parts omitted). Before S03 every everyday question is AI-suggested. */
export function questionMixLine(mix: ReportV2["questionMix"]): string {
  // S03 part 6 (LLD 8.3.3, P09.method): a report generated while agency_questions was on says who wrote them.
  if (mix.detail) return sourcedMixLine(mix.detail);
  const total = mix.everyday + mix.branded;
  const everyday =
    mix.everyday > 0 ? `${mix.everyday} everyday (${mix.bySource.original} AI-suggested)` : null;
  const branded = mix.branded > 0 ? `${mix.branded} that name the business` : null;
  return `${total} questions: ${[everyday, branded].filter(Boolean).join(" and ")}.`;
}

export function buildReportSnapshot(data: ReportDataV2): ReportSnapshot {
  const v2 = data.v2;
  const tier = v2?.tier ?? "basic";
  const next = v2?.whatToDoNext ?? null;
  const findings = reportFindings(data);
  const localLabel = data.brand.locality ? `Local · ${data.brand.locality}` : "Local";
  const reaches = v2?.reaches;
  return {
    schema: 1,
    basisAuditId: data.basis.auditId,
    tier,
    tierName: v2?.tierLabel ?? "Basic",
    generatedAt: data.generatedAt,
    headline: {
      mentioned: data.mentionedCount,
      answers: data.sampleCount,
      // S04 part 7: the reaches the headline covers ("across Local, NSW and Australia"); Local alone as before.
      reaches: reaches ? reaches.map((r) => r.reach) : ["local"],
      label: reaches ? reachHeadlineLabel(reaches, localLabel) : localLabel,
    },
    ...(reaches ? { reaches } : {}),
    questionMix: v2?.questionMix ?? {
      everyday: data.questions.everyday,
      branded: data.questions.branded,
      bySource: { original: data.questions.everyday },
    },
    findings: findings.map((f) => ({
      rule: f.rule,
      title: f.title,
      evidence: f.evidence.map((line) => line.map((part) => part.text).join("")).join(" · "),
    })),
    actions: (next?.measured ?? [])
      .filter((m) => m.included)
      .map((m) => ({
        kind: "measured" as const,
        actionItemId: m.actionItemId,
        title: m.title,
        evidence: m.evidence,
        priority: m.priority,
        status: m.status,
        note: m.note,
      })),
    agencyActions: (next?.agencyActions ?? []).map((a) => ({
      id: a.id,
      title: a.title,
      detail: a.detail,
      priority: a.priority,
    })),
    doneSinceLast: next?.includeDoneSinceLast ? next.doneSinceLast : [],
    generalAdvice: next?.includeGeneralAdvice ? next.generalAdvice : [],
    beyondAi: v2?.beyondAi ?? null,
    sections: v2?.sections ?? pagesForTier(tier),
    branding: { agencyName: data.agency.name },
    reportData: storedReportData(data),
  };
}

/**
 * The render input stored in a snapshot, with the ids the report's own row holds put back (amendment 41), or null when
 * the row has none (or one this code can't read). Trend points get a key from their audit number (the chart's keys).
 */
export function snapshotReportData(
  snapshot: unknown,
  row: { organizationId: string; brandId: string },
): ReportDataV2 | null {
  if (typeof snapshot !== "object" || snapshot === null) return null;
  const s = snapshot as { schema?: unknown; reportData?: unknown };
  if (s.schema !== 1 || typeof s.reportData !== "object" || s.reportData === null) return null;
  const stored = s.reportData as StoredReportData;
  return {
    ...stored,
    organizationId: row.organizationId,
    brand: { ...stored.brand, id: row.brandId },
    trend: {
      ...stored.trend,
      points: stored.trend.points.map((p) => ({ ...p, auditId: `audit-${p.auditNumber}` })),
    },
  } as ReportDataV2;
}
