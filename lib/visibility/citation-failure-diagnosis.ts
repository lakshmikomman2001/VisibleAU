import { and, desc, eq, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { audits, brands, citations, topicalCoverageGaps } from "@/db/schema";
import { type CitationOrigin, resolveCitationOrigin, toRegistrableDomain } from "@/lib/audit/extract-citations";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import type { Engine } from "@/lib/llm/interface";
import type { CitationDiagnosis } from "./types";

interface DiagnoseInput {
  brandId: string;
  auditId?: string;
  promptId?: string;
}

async function tableExists(tx: DbClient, tableName: string): Promise<boolean> {
  const result = await tx.execute(
    sql`SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${tableName}
    ) AS exists`,
  );
  const row = (result as unknown as Array<{ exists?: boolean }>)?.[0];
  return row?.exists === true;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

interface EngineCitationBreakdown {
  engine: string;
  count: number;
  retrievedCount: number;
  recalledCount: number;
}

/**
 * Task #46 (5th follow-up): replaces the old CPR-01
 * citation_source_intelligence branch, which was dead on arrival for
 * two independent reasons -- its `row.source_type === "brand_owned" &&
 * cnt === 0` check can never be true (a GROUP BY row's count is never
 * 0), AND brandPresentInSource/brand_owned there is a compound
 * "mentioned in text OR domain cited" signal anyway, not a pure
 * "domain cited" one (lib/trust/citation-intelligence.ts, the
 * `cit.brandMentioned || isBrandSourceType` tally call). This checks
 * the one thing the diagnosis actually claims: whether any citedSources
 * entry's REGISTRABLE domain equals the brand's own, over the LATEST
 * COMPLETED audit's organic, run_number=1 citations only (the same
 * scope buildCitationSourceIntelligence uses) -- not top_domains
 * (capped at 8, so a real citation could be invisible there) and not
 * a cross-audit, replay-inflated scan.
 *
 * Bounded to one brand's one latest audit, not a scan of all audits:
 * `audits` has no (brand_id, status, completed_at) index (confirmed
 * against the real local DB's pg_indexes -- only
 * audits_org_audit_number_idx and audits_org_completed_idx, both
 * organization_id-led), so this filters via a sequential scan of that
 * one brand's own (typically small) audit rows, not the whole table;
 * `citations.audit_id` similarly has no dedicated index (only
 * citations_pkey) -- the same gap buildCitationSourceIntelligence's
 * own citations query has already lived with since task #41. Neither
 * is new here, and both stay bounded to one audit's rows. See
 * docs/ops/post-launch-db-hardening.md section 46 (5th follow-up).
 */
async function checkBrandDomainNotCited(
  tx: DbClient,
  brandId: string,
  latestAuditId: string,
): Promise<CitationDiagnosis | null> {
  const [brand] = await tx.select({ domain: brands.domain }).from(brands).where(eq(brands.id, brandId));
  const brandRegistrableDomain = brand?.domain ? toRegistrableDomain(brand.domain) : null;
  // No domain on record -- never claim "not cited" when there's
  // nothing to check against.
  if (brandRegistrableDomain === null) return null;

  const auditCitations = await tx
    .select()
    .from(citations)
    .where(and(eq(citations.auditId, latestAuditId), ORGANIC_ONLY, eq(citations.runNumber, 1)));

  const engineBreakdown = new Map<string, EngineCitationBreakdown>();
  let totalValidSources = 0;
  let brandCitedCount = 0;

  for (const cit of auditCitations) {
    const engine = cit.engine as Engine;
    const citedSources = Array.isArray(cit.citedSources)
      ? (cit.citedSources as Array<{ url: string; domain?: string; origin?: CitationOrigin }>)
      : [];

    for (const entry of citedSources) {
      let rawDomain: string;
      try {
        rawDomain = entry?.domain ?? new URL(entry.url).hostname.replace(/^www\./, "");
      } catch {
        continue;
      }
      // Same validity rule as buildCitationSourceIntelligence (task
      // #46): an entry that doesn't resolve to a real ICANN
      // registrable domain doesn't count toward anything.
      const registrableDomain = toRegistrableDomain(rawDomain);
      if (registrableDomain === null) continue;

      totalValidSources++;
      const bucket = engineBreakdown.get(engine) ?? {
        engine,
        count: 0,
        retrievedCount: 0,
        recalledCount: 0,
      };
      bucket.count++;
      if (resolveCitationOrigin(entry, engine) === "retrieved") bucket.retrievedCount++;
      else bucket.recalledCount++;
      engineBreakdown.set(engine, bucket);

      // www./subdomain variants match because toRegistrableDomain
      // already reduces both sides to the same eTLD+1 (or, for
      // gov.au/edu.au, the comparison still holds since both sides go
      // through the identical reduction -- this diagnosis groups by
      // registrable domain only, never the gov.au/edu.au
      // full-hostname display variant top_domains uses).
      if (registrableDomain === brandRegistrableDomain) brandCitedCount++;
    }
  }

  // Engines cited nothing at all -- the Citation Sources "cited no
  // sources" line (NO_CITATIONS_SOURCE_TYPE) already covers this; this
  // diagnosis is specifically about being passed over in favour of
  // OTHER real sources, not about an engine citing nothing.
  if (totalValidSources === 0) return null;
  // The brand's own site was cited -- nothing to flag.
  if (brandCitedCount > 0) return null;

  const engines = [...engineBreakdown.values()];
  const perEngineLines = engines
    .map((e) => {
      const originLabel =
        e.retrievedCount > 0 && e.recalledCount > 0
          ? `${e.retrievedCount} Retrieved, ${e.recalledCount} Recalled`
          : e.retrievedCount > 0
            ? "Retrieved"
            : "Recalled";
      return `  • ${capitalize(e.engine)}: ${e.count} source${e.count === 1 ? "" : "s"} (${originLabel})`;
    })
    .join("\n");

  return {
    patternKey: "brand_domain_not_cited",
    severity: "high",
    evidence:
      `AI engines cited ${totalValidSources} source${totalValidSources === 1 ? "" : "s"} across ` +
      `${engines.length} engine${engines.length === 1 ? "" : "s"}, and none was your website.\n${perEngineLines}`,
    remediation:
      "Improve schema markup, FAQ pages, and structured data so AI engines prefer your domain as a primary source.",
  };
}

export async function diagnose(tx: DbClient, input: DiagnoseInput): Promise<CitationDiagnosis[]> {
  const { brandId } = input;
  const diagnoses: CitationDiagnosis[] = [];

  const gaps = await tx
    .select()
    .from(topicalCoverageGaps)
    .where(
      and(eq(topicalCoverageGaps.brandId, brandId), eq(topicalCoverageGaps.brandHasContent, false)),
    )
    .orderBy(sql`${topicalCoverageGaps.crossPromptImpact} DESC NULLS LAST`)
    .limit(10);

  for (const gap of gaps) {
    const topCompetitor = Array.isArray(gap.competitorCoverage)
      ? (gap.competitorCoverage as Array<{ domain: string; depth: number }>).sort(
          (a, b) => b.depth - a.depth,
        )[0]
      : undefined;

    diagnoses.push({
      patternKey: "missing_topic_coverage",
      severity:
        gap.crossPromptImpact && gap.crossPromptImpact >= 3
          ? "high"
          : gap.crossPromptImpact && gap.crossPromptImpact >= 2
            ? "medium"
            : "low",
      evidence: `No content found for topic "${gap.topicLabel}" in ${gap.vertical}. ${
        gap.crossPromptImpact ? `Fixing this could improve ${gap.crossPromptImpact} prompts.` : ""
      }`,
      competitorCited: topCompetitor?.domain,
      topicCluster: gap.topicCluster,
      remediation: `Create authoritative content covering "${gap.topicLabel}" to increase citation likelihood.`,
    });
  }

  // Task #46 (5th follow-up): one latest-completed-audit lookup,
  // shared by both of the audit-scoped diagnoses below (was two
  // separate round trips before this -- see the docstring above
  // checkBrandDomainNotCited for the index situation).
  const [latestAudit] = await tx
    .select({ id: audits.id })
    .from(audits)
    .where(and(eq(audits.brandId, brandId), eq(audits.status, "complete")))
    .orderBy(desc(audits.completedAt))
    .limit(1);

  if (latestAudit) {
    const brandDomainDiagnosis = await checkBrandDomainNotCited(tx, brandId, latestAudit.id);
    if (brandDomainDiagnosis) diagnoses.push(brandDomainDiagnosis);
  }

  // CPR-01: comparison_prompt_results (Sprint 7) — degrade gracefully when absent.
  //
  // Task #46 (5th follow-up): two bugs fixed here. (1) The column was
  // "competitor_cited", which has never existed on this table (the
  // real column is "competitor_mentioned") -- confirmed against both
  // every migration and the real local DB's information_schema; this
  // threw 42703 the moment any brand with comparison data hit this
  // page, breaking the WHOLE diagnose() call (no try/catch wraps this
  // block), not just this one diagnosis. (2) No audit_id filter at
  // all -- mixed every historical audit's rows together. Scoped to
  // the same latestAudit as the brand-domain check above; served by
  // the real comparison_audit_idx (audit_id) index. This table has no
  // run_number/replay concept to filter -- run-comparison-prompts.ts
  // inserts exactly one row per (competitorDomain, engine) per audit,
  // never a 5x-replay loop, so there's nothing to de-duplicate.
  const hasComparison = await tableExists(tx, "comparison_prompt_results");
  if (hasComparison && latestAudit) {
    const compRows = await tx.execute(
      sql`SELECT competitor_domain, COUNT(*) as cited_count
          FROM comparison_prompt_results
          WHERE brand_id = ${brandId} AND audit_id = ${latestAudit.id} AND competitor_mentioned = true
          GROUP BY competitor_domain
          ORDER BY cited_count DESC
          LIMIT 3`,
    );
    for (const row of compRows as unknown as Array<{
      competitor_domain: string;
      cited_count: string;
    }>) {
      diagnoses.push({
        patternKey: "competitor_cited_instead",
        severity: "medium",
        evidence: `${row.competitor_domain} is cited ${row.cited_count} times in prompts where your brand is absent.`,
        competitorCited: row.competitor_domain,
        remediation: `Analyze what content ${row.competitor_domain} has that earns citations, then create competing content.`,
      });
    }
  }

  diagnoses.sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  return diagnoses;
}
