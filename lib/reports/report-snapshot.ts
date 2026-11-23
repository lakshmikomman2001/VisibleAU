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
  questionMix: { everyday: number; branded: number; bySource: { original: number } };
}

export type ReportDataV2 = ReportData & { v2?: ReportV2 };

export interface ReportSnapshot {
  schema: 1;
  basisAuditId: string;
  tier: ReportTier;
  tierName: string;
  generatedAt: string;
  headline: { mentioned: number; answers: number; reaches: string[]; label: string };
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
  reportData: ReportDataV2;
}

/** The mix line (appendix E; zero parts omitted). Before S03 every everyday question is AI-suggested. */
export function questionMixLine(mix: ReportV2["questionMix"]): string {
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
  return {
    schema: 1,
    basisAuditId: data.basis.auditId,
    tier,
    tierName: v2?.tierLabel ?? "Basic",
    generatedAt: data.generatedAt,
    headline: {
      mentioned: data.mentionedCount,
      answers: data.sampleCount,
      reaches: ["local"],
      label: data.brand.locality ? `Local · ${data.brand.locality}` : "Local",
    },
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
    reportData: data,
  };
}

/** The render input stored in a snapshot, or null when the row has none (or one this code can't read). */
export function snapshotReportData(snapshot: unknown): ReportDataV2 | null {
  if (typeof snapshot !== "object" || snapshot === null) return null;
  const s = snapshot as { schema?: unknown; reportData?: unknown };
  if (s.schema !== 1 || typeof s.reportData !== "object" || s.reportData === null) return null;
  return s.reportData as ReportDataV2;
}
