# VisibleAU — Sprint 7 UI Fix: Schema auditor — engine name casing
# Page: /brands/[brandId]/technical/schema  ("Reality Check — Impact by Engine" section)
# Source: Sprint 7 Gate-2 re-validation (D2).
# Paste everything below the line into a fresh Claude Code session on the VisibleAU repo.

---

> One small label fix on the **Schema auditor page** ("Reality Check — Impact by Engine" section).
> Presentation only.
>
> ### FIX 1 — [LOW] "Chatgpt" → "ChatGPT"
> **Where:** the "Reality Check — Impact by Engine" rows on the schema page.
> **Problem:** the OpenAI engine is labelled **"Chatgpt"** — it should be **"ChatGPT"**. This looks
> like a generic title-caser (capitalise first letter only) applied to a `chatgpt` key. The other
> engines (Google, Claude, Perplexity, Gemini) are correct.
> **Fix:** render the display name as **"ChatGPT"**. Prefer a small display-name map over title-casing
> the raw key, e.g.:
> ```ts
> const ENGINE_LABELS: Record<string, string> = {
>   google: 'Google',
>   chatgpt: 'ChatGPT',
>   claude: 'Claude',
>   perplexity: 'Perplexity',
>   gemini: 'Gemini',
> };
> ```
> so the casing is correct regardless of the underlying key.
>
> **Also check:** if the same title-case helper renders engine/provider names anywhere else (e.g. the
> LLM-provider list, any "by engine" breakdowns on other pages), confirm none of them mangle a brand
> name — "ChatGPT", "OpenAI", "DuckDuckGo", "YouBot", "PerplexityBot" etc. should keep their correct
> capitalisation. Apply the same display-name map wherever engine/provider names are shown.
>
> ---
> **Verification:**
> - The schema page's Reality Check shows "ChatGPT" (not "Chatgpt").
> - Any other engine/provider name lists keep correct brand capitalisation.
> - No console errors; TS strict.
>
> Report the files changed and confirm.

---

## Notes for Sri (not part of the paste)
- Tiny one, but it's a brand name in user-facing UI — and the display-name map prevents the same
  title-caser from mangling other product names elsewhere.
- The real outstanding item on this page isn't a fix — it's **verifying the populated state** (per-
  schema cards + hallucination detection) on a brand that actually has schema markup. Bondi has none,
  so that path is still unconfirmed.
- Remaining sub-pages: D3 SSR, D4 Answer capsules, D6 Brand & Entity, D7 citability.
