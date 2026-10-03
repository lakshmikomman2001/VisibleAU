// ⚠️ Citations here must be primary-sourced: every figure needs a URL that
// actually contains it when opened. No aggregator-only, secondhand, or
// unsourced figures -- task NN removed a fabricated "SE Ranking Dec 2025
// study" that didn't exist (confirmed: no such study, no "4.9 vs 4.4"
// figure, anywhere in the literature).
export const SCHEMA_REALITY_CHECK: Record<string, string> = {
  google:
    "Medium impact — schema helps traditional snippets which feed AI Overviews indirectly. Not a direct citation signal.",
  chatgpt:
    "No clear direct lift from schema alone — a large-scale Ahrefs study tracking 1,885 pages over 7 months found no statistically significant change in ChatGPT citations after adding schema (ahrefs.com/blog/schema-ai-citations). Evidence across studies is mixed.",
  claude:
    "No large-scale Claude-specific study on schema's direct citation impact; the closest available evidence (Ahrefs, 1,885 pages) found no significant effect on the engines it measured.",
  perplexity:
    "No large-scale Perplexity-specific study on schema's direct citation impact; the closest available evidence (Ahrefs, 1,885 pages) found no significant effect on the engines it measured.",
  gemini:
    "Medium impact — schema helps Google AI Overviews indirectly via traditional snippet selection.",
};
