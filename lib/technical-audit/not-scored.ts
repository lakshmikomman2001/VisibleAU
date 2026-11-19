/**
 * 20 Nov (Sri's decision): what a check that isn't scored says in place of a score -- "Found · not scored", "Not found ·
 * not scored", "Couldn't check · not scored" -- from what the audit stored, on every page that shows it (the Technical
 * Audit, llms.txt and AI Discovery pages). llms.txt and AI Discovery are checked and shown from scoring version 4, never
 * counted (lib/technical-audit/scoring-version.ts).
 */

export const NOT_SCORED = "not scored";

/** llms.txt's row: the request's answer (findings.llmsTxt.fetchStatus). */
export function llmsTxtNotScoredText(fetchStatus: unknown, siteUnreached: boolean): string {
  if (siteUnreached) return `Not checked · ${NOT_SCORED}`;
  if (fetchStatus === "found") return `Found · ${NOT_SCORED}`;
  if (fetchStatus === "absent") return `Not found · ${NOT_SCORED}`;
  return `Couldn't check · ${NOT_SCORED}`;
}

/** The four AI-discovery files' answers, as stored (true found, false not found, null couldn't check). */
export interface AiDiscoveryPresence {
  aiTxtPresent?: boolean | null;
  aiSummaryPresent?: boolean | null;
  aiFaqPresent?: boolean | null;
  aiServicePresent?: boolean | null;
}

/** AI Discovery's row: how many of the four files were found. */
export function aiDiscoveryNotScoredText(
  findings: AiDiscoveryPresence | null | undefined,
  siteUnreached: boolean,
): string {
  if (siteUnreached) return `Not checked · ${NOT_SCORED}`;
  const files = [
    findings?.aiTxtPresent,
    findings?.aiSummaryPresent,
    findings?.aiFaqPresent,
    findings?.aiServicePresent,
  ];
  const found = files.filter((f) => f === true).length;
  if (found > 0) return `Found (${found} of ${files.length}) · ${NOT_SCORED}`;
  if (files.some((f) => typeof f !== "boolean")) return `Couldn't check · ${NOT_SCORED}`;
  return `Not found · ${NOT_SCORED}`;
}

/**
 * What llms.txt is, wherever it's explained: from the methodology's sources (llmstxt.org, Google's AI features page:
 * lib/methodology/verified-citations.ts). It said "Anthropic, Perplexity, and others are starting to honour it", which
 * no source says.
 */
export const LLMS_TXT_WHAT_IT_IS =
  "llms.txt is a proposed format (llmstxt.org, September 2024) for a plain-text summary of a site written for language models. No AI provider has said its engine reads it, and Google says its AI features need no special AI text files, so it doesn't count toward any score. We check for it and can draft one for you if you'd like to publish it anyway.";
