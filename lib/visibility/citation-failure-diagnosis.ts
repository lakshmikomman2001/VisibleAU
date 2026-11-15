import { and, eq } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { brands, citations } from "@/db/schema";
import {
  type CitationOrigin,
  citedSourcesOf,
  isBrandDomain,
  resolveCitationOrigin,
  toRegistrableDomain,
} from "@/lib/audit/extract-citations";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import { possessive } from "@/lib/copy/possessive";
import { ENGINE_DISPLAY_NAMES, type Engine } from "@/lib/llm/interface";
import { latestCompleteAudit } from "@/lib/visibility/share-of-voice";
import type { CitationDiagnosis } from "./types";

interface DiagnoseInput {
  brandId: string;
  auditId?: string;
  promptId?: string;
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
  auditNumber: number,
): Promise<CitationDiagnosis | null> {
  const [brand] = await tx
    .select({ domain: brands.domain })
    .from(brands)
    .where(eq(brands.id, brandId));
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
  // 17 Nov, part 3: answers, as the audit page counts them -- "N sources" counted every link in every answer.
  let answersWithSource = 0;

  for (const cit of auditCitations) {
    let answerHasSource = false;
    const engine = cit.engine as Engine;
    // Decision 1 (6 Nov): the sources the answer cited, never a search result it didn't.
    const citedSources = citedSourcesOf<{ url: string; domain?: string; origin?: CitationOrigin }>(
      cit.citedSources,
    );

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
      answerHasSource = true;
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

      // Task #46 (6th follow-up): the one shared isBrandDomain() check
      // (lib/audit/extract-citations.ts) -- the same registrable-
      // domain-to-registrable-domain comparison classifySourceTypeWithBrand
      // and top_domains[].isBrand now use too. www./subdomain variants
      // match because both sides reduce to the same eTLD+1; a domain
      // that merely CONTAINS the brand's domain as a substring never
      // does (unlike the old classifier check this diagnosis was
      // written to replace).
      if (isBrandDomain(rawDomain, brand?.domain)) brandCitedCount++;
    }
    if (answerHasSource) answersWithSource++;
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
      const engineName = ENGINE_DISPLAY_NAMES[e.engine as Engine] ?? e.engine;
      return `  • ${engineName}: ${e.count} source${e.count === 1 ? "" : "s"} (${originLabel})`;
    })
    .join("\n");

  return {
    patternKey: "brand_domain_not_cited",
    severity: "high",
    // 17 Nov, part 3: in answers, and which audit -- "AI engines cited N sources" counted links.
    evidence:
      `In audit #${auditNumber}, ${answersWithSource} of ${auditCitations.length} everyday answers linked a source ` +
      `(${totalValidSources} link${totalValidSources === 1 ? "" : "s"} in all, across ${engines.length} ` +
      `engine${engines.length === 1 ? "" : "s"}), and none was your website.\n${perEngineLines}`,
    remediation: buildBrandDomainNotCitedRemediation(engines),
  };
}

const RETRIEVED_REMEDIATION =
  "Improve on-site schema markup, FAQ content, and structured data so engines that search live (like Perplexity) pick your site as a source.";
const RECALLED_REMEDIATION =
  "Get listed and mentioned on the sites these engines already cite from memory (see Citation Sources' top domains) — that's the realistic lever when an engine answers from training data instead of a live search.";

/**
 * Task #46 follow-up: one static remediation line used to apply to
 * every engine regardless of origin, but it only makes sense for
 * engines that retrieve live (on-site schema/structure won't move an
 * engine answering from memory in the short term). Origin-aware: each
 * sentence only appears when at least one engine in this diagnosis
 * actually has that origin.
 */
function buildBrandDomainNotCitedRemediation(engines: EngineCitationBreakdown[]): string {
  const hasRetrieved = engines.some((e) => e.retrievedCount > 0);
  const hasRecalled = engines.some((e) => e.recalledCount > 0);
  return [hasRetrieved ? RETRIEVED_REMEDIATION : null, hasRecalled ? RECALLED_REMEDIATION : null]
    .filter((line): line is string => line !== null)
    .join(" ");
}

/**
 * 17 Nov, part 3 -- a competitor's website linked in the latest audit's everyday answers that didn't name the brand:
 * "In audit #50, Alpha Plumbing's website was linked in 3 of the 27 everyday answers that didn't name you." It said
 * "{domain} is cited N times in prompts where your brand is absent" from COUNT(comparison_prompt_results where
 * competitor_mentioned) -- head-to-head prompts that named the competitor, one per engine: no citation, and nothing
 * about the brand being absent.
 */
async function checkCompetitorLinkedInstead(
  tx: DbClient,
  brandId: string,
  latestAuditId: string,
  auditNumber: number,
): Promise<CitationDiagnosis[]> {
  const [brand] = await tx
    .select({ competitorWebsites: brands.competitorWebsites })
    .from(brands)
    .where(eq(brands.id, brandId));
  const websites = Object.entries(
    (brand?.competitorWebsites ?? {}) as Readonly<Record<string, string>>,
  ).filter(([, site]) => !!site);
  if (websites.length === 0) return [];

  const rows = await tx
    .select({
      brandMentioned: citations.brandMentioned,
      mentionVerification: citations.mentionVerification,
      citedSources: citations.citedSources,
    })
    .from(citations)
    .where(and(eq(citations.auditId, latestAuditId), ORGANIC_ONLY, eq(citations.runNumber, 1)));
  // Not named = no verified mention (EXCLUDE_UNVERIFIED: an unverified match isn't a mention).
  const notNamed = rows.filter((r) => !r.brandMentioned || r.mentionVerification === "unverified");
  if (notNamed.length === 0) return [];

  const found: Array<{ name: string; site: string; count: number }> = [];
  for (const [name, site] of websites) {
    const count = notNamed.filter((r) =>
      citedSourcesOf<{ url: string; domain?: string }>(r.citedSources).some((entry) =>
        isBrandDomain(entry.domain ?? entry.url, site),
      ),
    ).length;
    if (count > 0) found.push({ name, site, count });
  }
  return found
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map((c) => ({
      patternKey: "competitor_cited_instead",
      severity: "medium" as const,
      evidence: `In audit #${auditNumber}, ${possessive(c.name)} website was linked in ${c.count} of the ${notNamed.length} everyday answers that didn't name you.`,
      competitorCited: c.site,
      remediation: `Look at what ${possessive(c.name)} pages cover that AI links to, then make sure your site covers the same questions.`,
    }));
}

export async function diagnose(tx: DbClient, input: DiagnoseInput): Promise<CitationDiagnosis[]> {
  const { brandId } = input;
  const diagnoses: CitationDiagnosis[] = [];

  // 17 Nov, part 3: no "Missing Topic Coverage" -- topical_coverage_gaps isn't a measurement. Its rows come from every
  // vertical's library prompts, matched to the audit's answers by the unexpanded template (so "{region}" questions
  // never match and brand_has_content defaults to false: "No content found for topic ..."), and "Fixing this could
  // improve N prompts" counted library prompts across all verticals.

  // The latest complete audit, as every page picks it (lib/visibility/share-of-voice.ts).
  const latestAudit = await latestCompleteAudit(tx, brandId);
  if (latestAudit) {
    const brandDomainDiagnosis = await checkBrandDomainNotCited(
      tx,
      brandId,
      latestAudit.id,
      latestAudit.auditNumber,
    );
    if (brandDomainDiagnosis) diagnoses.push(brandDomainDiagnosis);
    diagnoses.push(
      ...(await checkCompetitorLinkedInstead(tx, brandId, latestAudit.id, latestAudit.auditNumber)),
    );
  }

  diagnoses.sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  return diagnoses;
}
