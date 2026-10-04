// ⚠️ Citations here must be primary-sourced: every figure needs a URL that
// actually contains it when opened. No aggregator-only, secondhand, or
// unsourced figures -- task NN removed a fabricated "SE Ranking Dec 2025
// study" that didn't exist (confirmed: no such study, no "4.9 vs 4.4"
// figure, anywhere in the literature).
export const SCHEMA_REALITY_CHECK: Record<string, string> = {
  google:
    "Low / mixed for AI citations — schema is still a solid traditional-SEO practice (rich snippets, eligibility for enhanced results), but the only large-scale experiment found no AI-citation uplift and a small, statistically significant -4.6% decline in Google AI Overview citations after adding schema (ahrefs.com/blog/schema-ai-citations). Treat it as traditional-SEO hygiene, not an AI-Overview lever.",
  chatgpt:
    "No clear direct lift from schema alone — a large-scale Ahrefs study tracking 1,885 pages between August 2025 and March 2026 found no statistically significant change in ChatGPT citations after adding schema (ahrefs.com/blog/schema-ai-citations). Evidence across studies is mixed.",
  claude:
    "No large-scale Claude-specific study on schema's direct citation impact; the closest available evidence (Ahrefs, 1,885 pages) found no significant effect on the engines it measured.",
  perplexity:
    "No large-scale Perplexity-specific study on schema's direct citation impact; the closest available evidence (Ahrefs, 1,885 pages) found no significant effect on the engines it measured.",
  gemini:
    "Low / mixed for AI citations — no Gemini-specific large-scale study; schema retains traditional-snippet value, but the closest evidence (Ahrefs, 1,885 pages) found no AI-citation uplift on the Google AI surfaces it measured (a slight decline on AI Overviews). A traditional-SEO best practice, not an AI-citation lever.",
};
