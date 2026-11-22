import { and, eq } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { citations } from "@/db/schema";
import { citedSourcesOf } from "@/lib/audit/extract-citations";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";

/**
 * S01 part 4 (LLD 8.8.5, T7): general advice is shown only when something backs it.
 * - "audit": advice about a platform (Medium, LinkedIn, Reddit, Wikipedia) when this audit's everyday answers cited
 *   that platform in at least AUDIT_EVIDENCE_MIN_ANSWERS of them: "LinkedIn was cited in 9 of 40 answers". Platform
 *   advice needs its own platform's citations; a research source doesn't stand in for them ("Publish a how-to
 *   article on Medium" is removed unless the audit cited medium.com).
 * - "research": any other advice backed by a verified research source (lib/methodology/verified-citations.ts,
 *   carried on the item as an evidence ref with sourceType "research").
 * - none: not shown.
 * Applied only while report_v2 is on; with it off, general advice is listed as today.
 */
export type EvidenceKind = "research" | "audit";

/** An Action Center item's stored evidence refs (action_items.evidence_refs), as far as this reads them. */
export type AdviceEvidenceRefs = ReadonlyArray<{ source?: string; sourceType?: string }> | null;

export const AUDIT_EVIDENCE_MIN_ANSWERS = 3;

/** The Action Center rules whose advice is about one platform, and how its citations are recognised. */
export const PLATFORM_ADVICE: Record<string, { platform: string; host: RegExp }> = {
  "medium-presence": { platform: "Medium", host: /(^|\.)medium\.com$/i },
  "linkedin-presence": { platform: "LinkedIn", host: /(^|\.)linkedin\.com$/i },
  "reddit-absence": { platform: "Reddit", host: /(^|\.)reddit\.com$/i },
  "wikipedia-article": { platform: "Wikipedia", host: /(^|\.)wikipedia\.org$/i },
};

/** Everyday answers citing each platform, counted once per answer. */
export interface PlatformCitations {
  everydayAnswers: number;
  answersCiting: Record<string, number>;
}

/** Counts, over the basis audit's successful run-1 everyday answers, how many cite each platform. */
export function countPlatformCitations(
  answers: ReadonlyArray<{ organic: boolean; citedSources: unknown }>,
): PlatformCitations {
  const answersCiting: Record<string, number> = {};
  let everydayAnswers = 0;
  for (const a of answers) {
    if (!a.organic) continue;
    everydayAnswers += 1;
    const hosts = new Set<string>();
    for (const e of citedSourcesOf<{ url?: unknown }>(a.citedSources)) {
      if (typeof e.url !== "string") continue;
      try {
        hosts.add(new URL(e.url).hostname.toLowerCase().replace(/^www\./, ""));
      } catch {
        // An unreadable URL names no platform.
      }
    }
    for (const { platform, host } of Object.values(PLATFORM_ADVICE)) {
      if ([...hosts].some((h) => host.test(h)))
        answersCiting[platform] = (answersCiting[platform] ?? 0) + 1;
    }
  }
  return { everydayAnswers, answersCiting };
}

export interface AdviceEvidence {
  kind: EvidenceKind;
  /** The line shown under the advice: "LinkedIn was cited in 9 of 40 answers", or the research source's name. */
  line: string;
}

/** What backs one general advice item, or null when nothing does (the item isn't shown). */
export function adviceEvidence(
  item: {
    recommendationKey: string;
    evidenceRefs?: ReadonlyArray<{ source?: string; sourceType?: string }> | null;
  },
  citations: PlatformCitations,
): AdviceEvidence | null {
  const platform = PLATFORM_ADVICE[item.recommendationKey];
  if (platform) {
    const n = citations.answersCiting[platform.platform] ?? 0;
    if (n < AUDIT_EVIDENCE_MIN_ANSWERS) return null;
    return {
      kind: "audit",
      line: `${platform.platform} was cited in ${n} of ${citations.everydayAnswers} answers`,
    };
  }
  const research = (item.evidenceRefs ?? []).find((r) => r.sourceType === "research" && r.source);
  return research ? { kind: "research", line: research.source ?? "" } : null;
}

/** The audit's successful run-1 everyday answers' platform citations (one indexed read). */
export async function loadPlatformCitations(
  db: DbClient,
  auditId: string,
): Promise<PlatformCitations> {
  const rows = await db
    .select({ citedSources: citations.citedSources })
    .from(citations)
    .where(and(eq(citations.auditId, auditId), eq(citations.runNumber, 1), ORGANIC_ONLY));
  return countPlatformCitations(rows.map((r) => ({ organic: true, citedSources: r.citedSources })));
}

/**
 * S01 part 4: the general advice to show under an audit while report_v2 is on -- only items something backs, each
 * with its evidence line. With report_v2 off the caller lists general advice as today.
 */
export function evidenceBackedAdvice<
  T extends {
    recommendationKey: string;
    evidenceRefs?: ReadonlyArray<{ source?: string; sourceType?: string }> | null;
  },
>(items: readonly T[], citations: PlatformCitations): Array<T & { evidence: AdviceEvidence }> {
  return items.flatMap((item) => {
    const evidence = adviceEvidence(item, citations);
    return evidence ? [{ ...item, evidence }] : [];
  });
}
