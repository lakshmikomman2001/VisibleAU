import { and, eq } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { citations } from "@/db/schema";
import { citedSourcesOf } from "@/lib/audit/extract-citations";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import { classifySourceType } from "./citation-source-classifier";
import type { CitedSourceType } from "./types";

/**
 * Sri's decision (7 Nov) -- how many of an audit's everyday answers cited a page of each source type
 * (Reddit, a news site, a directory...). The same answers the directory counts read
 * (lib/directories/citation-counts.ts: ORGANIC_ONLY, run 1), and only the sources an answer cited
 * (citedSourcesOf). One answer counts once per type. A Gemini grounding link points at Google's redirect
 * host, so a source's site (`domain`, when it has one) is what's classified.
 */
export interface SourceTypeCitations {
  /** Everyday answers in the audit. */
  totalAnswers: number;
  /** Of those, how many cited at least one page of each type; a type no answer cited is absent. */
  answersCiting: Partial<Record<CitedSourceType, number>>;
}

function typeOf(entry: unknown): CitedSourceType | null {
  if (typeof entry === "string") return classifySourceType(entry);
  if (typeof entry !== "object" || entry === null) return null;
  const { domain, url } = entry as { domain?: unknown; url?: unknown };
  if (typeof domain === "string" && domain.length > 0)
    return classifySourceType(`https://${domain}/`);
  return typeof url === "string" ? classifySourceType(url) : null;
}

export function countSourceTypeCitations(
  rows: ReadonlyArray<{ citedSources: unknown }>,
): SourceTypeCitations {
  const answersCiting: Partial<Record<CitedSourceType, number>> = {};
  for (const row of rows) {
    const types = new Set(
      citedSourcesOf(row.citedSources)
        .map(typeOf)
        .filter((t): t is CitedSourceType => t !== null),
    );
    for (const type of types) answersCiting[type] = (answersCiting[type] ?? 0) + 1;
  }
  return { totalAnswers: rows.length, answersCiting };
}

export async function getSourceTypeCitationsForAudit(
  db: DbClient,
  auditId: string,
): Promise<SourceTypeCitations> {
  const rows = await db
    .select({ citedSources: citations.citedSources })
    .from(citations)
    .where(and(eq(citations.auditId, auditId), ORGANIC_ONLY, eq(citations.runNumber, 1)));
  return countSourceTypeCitations(rows);
}
