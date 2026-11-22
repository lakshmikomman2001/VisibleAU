import { and, desc, eq, gt, inArray, isNull, lte } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import {
  actionItems,
  agencyActions,
  generatedReports,
  reportActionChoices,
  reportBrandPreferences,
} from "@/db/schema";
import { getOwnerDirectoryStatements } from "@/lib/directories/owner-statements";
import { compareActionItems } from "@/lib/recommendations/action-order";
import {
  displayRecommendationTitle,
  resolveDisplayBasis,
} from "@/lib/recommendations/confidence-labels";
import { generalAdviceItems } from "@/lib/recommendations/general-advice";
import {
  type AdviceEvidenceRefs,
  evidenceBackedAdvice,
  loadPlatformCitations,
} from "@/lib/recommendations/general-advice-evidence";
import { FINDING_RECOMMENDATIONS } from "./finding-recommendations";
import {
  type ActionStatus,
  type AgencyActionRow,
  assembleWhatToDoNext,
  type MeasuredActionSource,
  type Priority,
  type WhatToDoNext,
} from "./report-contents";
import type { Finding, FindingRule } from "./report-findings";

/**
 * S01 part 5 (LLD 8.1.3): the "What to do next" groups for a brand's report, read with the audit page's own functions
 * (no second calculation): the basis audit's findings (reportFindings, the audit page's "from this audit"), its open
 * Action Center items with their display basis and order (resolveDisplayBasis, generalAdviceItems,
 * compareActionItems), part 4's evidence-backed general advice, plus the agency's choices and actions and what was
 * done since the brand's previous generated report.
 */

/** A finding's Action Center item, by recommendation key (rules b, c, d, e have none). */
const ITEM_KEY_OF_RULE: Partial<Record<FindingRule, string>> = {
  a: "directory-visibility",
  f: "reddit-absence",
  g: FINDING_RECOMMENDATIONS.g.key,
  h: FINDING_RECOMMENDATIONS.h.key,
  i: FINDING_RECOMMENDATIONS.i.key,
  j: FINDING_RECOMMENDATIONS.j.key,
};

const MEASURED_BASES = new Set(["measured_citations", "owner_confirmed", "checked_source"]);

function findingPriority(f: Finding): MeasuredActionSource["priority"] {
  return f.severity.tone === "high" ? "high" : f.severity.tone === "str" ? "strength" : "medium";
}

function asPriority(value: string): Priority {
  return value === "high" || value === "low" ? value : "medium";
}

function asStatus(value: string): ActionStatus {
  return value === "in_progress" || value === "done" ? value : "open";
}

export async function loadWhatToDoNext(
  db: DbClient,
  input: {
    organizationId: string;
    brandId: string;
    basisAuditId: string;
    basisAuditNumber: number;
    findings: readonly Finding[];
    /** Agency and up: the agency's choices, notes, actions and toggles apply (D1). */
    curated: boolean;
    now: Date;
  },
): Promise<WhatToDoNext> {
  const { brandId, basisAuditId } = input;
  const [items, ownerStatementsByBrand, [prefs], choices, agency, [previousReport]] =
    await Promise.all([
      db
        .select({
          id: actionItems.id,
          title: actionItems.title,
          action: actionItems.action,
          expectedImpactScore: actionItems.expectedImpactScore,
          confidenceBasis: actionItems.confidenceBasis,
          recommendationKey: actionItems.recommendationKey,
          evidenceRefs: actionItems.evidenceRefs,
          status: actionItems.status,
          createdAt: actionItems.createdAt,
        })
        .from(actionItems)
        .where(
          and(
            eq(actionItems.auditId, basisAuditId),
            eq(actionItems.brandId, brandId),
            inArray(actionItems.status, ["open", "in_progress"]),
          ),
        ),
      getOwnerDirectoryStatements(db, [brandId]),
      db.select().from(reportBrandPreferences).where(eq(reportBrandPreferences.brandId, brandId)),
      db.select().from(reportActionChoices).where(eq(reportActionChoices.brandId, brandId)),
      db
        .select()
        .from(agencyActions)
        .where(and(eq(agencyActions.brandId, brandId), isNull(agencyActions.archivedAt))),
      db
        .select({ createdAt: generatedReports.createdAt })
        .from(generatedReports)
        .where(
          and(eq(generatedReports.brandId, brandId), lte(generatedReports.createdAt, input.now)),
        )
        .orderBy(desc(generatedReports.createdAt))
        .limit(1),
    ]);
  const ownerStatements = ownerStatementsByBrand.get(brandId) ?? [];
  const withBasis = items
    .map((i) => ({
      ...i,
      evidenceRefs: i.evidenceRefs as AdviceEvidenceRefs,
      displayBasis: resolveDisplayBasis({ ...i, evidenceRefs: i.evidenceRefs }, ownerStatements),
    }))
    .sort(compareActionItems);
  const byKey = new Map(withBasis.map((i) => [i.recommendationKey, i]));
  const suffix = ` · audit #${input.basisAuditNumber}`;

  // 1. The findings first, each joined to its Action Center item when it has one.
  const used = new Set<string>();
  const fromFindings: MeasuredActionSource[] = input.findings.map((f) => {
    const itemKey = ITEM_KEY_OF_RULE[f.rule];
    const item = itemKey ? byKey.get(itemKey) : undefined;
    if (item) used.add(item.id);
    return {
      key: item ? item.id : `finding:${f.rule}`,
      actionItemId: item ? item.id : null,
      title: f.recommendation.title,
      evidence: `${f.recommendation.detail}${suffix}`,
      priority: findingPriority(f),
      status: item ? asStatus(item.status) : "open",
    };
  });
  // 2. Then the other measured items (a dated check, an owner's own statement), in the audit page's order.
  const otherMeasured: MeasuredActionSource[] = withBasis
    .filter((i) => !used.has(i.id) && MEASURED_BASES.has(i.displayBasis))
    .map((i) => ({
      key: i.id,
      actionItemId: i.id,
      title: displayRecommendationTitle(i),
      evidence: `${i.action}${suffix}`,
      priority: asPriority(i.expectedImpactScore),
      status: asStatus(i.status),
    }));

  const advice = evidenceBackedAdvice(
    generalAdviceItems(withBasis, input.findings),
    await loadPlatformCitations(db, basisAuditId),
  ).map((i) => ({ title: displayRecommendationTitle(i), evidence: i.evidence.line }));

  const since = previousReport?.createdAt;
  const done = since
    ? await db
        .select({ title: actionItems.title, doneAt: actionItems.doneAt })
        .from(actionItems)
        .where(
          and(
            eq(actionItems.brandId, brandId),
            eq(actionItems.status, "done"),
            gt(actionItems.doneAt, since),
            lte(actionItems.doneAt, input.now),
          ),
        )
        .orderBy(desc(actionItems.doneAt))
    : [];

  return assembleWhatToDoNext({
    measured: [...fromFindings, ...otherMeasured],
    choices: choices.map((c) => ({
      actionItemId: c.actionItemId,
      included: c.included,
      position: c.position,
      note: c.note,
    })),
    agencyActions: agency.map(
      (a): AgencyActionRow => ({
        id: a.id,
        title: a.title,
        detail: a.detail,
        priority: asPriority(a.priority),
        status: asStatus(a.status),
        position: a.position,
      }),
    ),
    doneSinceLast: done.flatMap((d) =>
      d.doneAt ? [{ title: d.title, doneAt: d.doneAt.toISOString().slice(0, 10) }] : [],
    ),
    generalAdvice: advice,
    includeGeneralAdvice: prefs?.includeGeneralAdvice ?? true,
    includeDoneSinceLast: prefs?.includeDoneSinceLast ?? true,
    curated: input.curated,
  });
}
