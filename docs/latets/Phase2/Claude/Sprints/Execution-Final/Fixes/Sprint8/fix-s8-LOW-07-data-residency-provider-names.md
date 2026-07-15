# FIX S8-LOW-07 — Data residency: provider/region display names (F13) + optional prototype-polish (Sri's call)

## Verdict first (so severity is honest)
The data-residency screen **PASSES the binding §6U.4 spec**: it renders the residency-table with the
four GV-2 columns (data_type → storage_region + provider + retention_period + encryption_status),
all **7** canonical rows (matching the DB), correct null-handling on the two `llm_processing_*`
rows, and the transparency disclosure. Against what Sprint 8 was built to, this screen is compliant.

This prompt fixes ONE real (LOW) display bug, and LISTS optional prototype-polish that §6U.4 did
NOT require — the polish is Sri's call, do NOT treat it as mandatory.

---

## PART 1 — F13 (REAL, LOW): provider/region display names are naive-capitalized

### Symptom
The DB stores providers lowercase (`supabase`, `openai`, `anthropic`) and regions as codes
(`ap-southeast-2`, `us`). The screen applies a naive capitalize/title-case for display, producing:
- **"Openai"** — should be **"OpenAI"** (proper product name).
- **"Anthropic"** — correct by luck (single-word title-case works).
- **"Supabase"** — likely correct, but CONFIRM it isn't transposed/typo'd in the render.
The region display ("Australia (Sydney)", "United States") is a nice humanization and is fine.

Naive `.charAt(0).toUpperCase() + slice(1)` (or a CSS `text-transform: capitalize`) can't produce
"OpenAI" — proper nouns need an explicit display-name map.

### Task
1. Find the transform:
```bash
cd c:/startup/VisibleAU/src
grep -Rn "toUpperCase\|capitalize\|text-transform\|charAt(0)\|titleCase\|toLocaleUpperCase" \
  components/domain/governance/residency-table.tsx "app/(auth)/settings/data-residency/page.tsx"
grep -n "provider\|storage_region\|storageRegion" components/domain/governance/residency-table.tsx
```
2. Replace the naive capitalization for the **provider** column with an explicit display-name map:
```typescript
const PROVIDER_DISPLAY: Record<string, string> = {
  supabase: "Supabase",
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  perplexity: "Perplexity",
  vercel: "Vercel",
};
const providerLabel = PROVIDER_DISPLAY[provider] ?? provider; // fall back to raw if unmapped
```
(The provider set comes from the LLD data_residency_log comment: supabase | openai | anthropic |
google | perplexity | vercel — LLD 8714. Map all six so future rows render correctly.)
3. Leave the region humanization as-is if it already reads correctly ("Australia (Sydney)" /
   "United States"); if it's ALSO naive, give it a small code→label map
   (`ap-southeast-2` → "Australia (Sydney)", `us` → "United States").
4. Do NOT change the DB values — this is display-only.

### Verify
```bash
grep -n "PROVIDER_DISPLAY\|OpenAI" components/domain/governance/residency-table.tsx
```
On screen: the LLM Processing rows read **"OpenAI"** and **"Anthropic"**; the Supabase rows read
**"Supabase"**. No "Openai".

---

## PART 2 — OPTIONAL prototype-polish (NON-BLOCKING — Sri decides; §6U.4 did not require these)

§6U.4 specifies only the table + a disclosure. The prototype `DataResidency` (FIX17 3081–3159) is
richer. These are deviations from the PROTOTYPE, but NOT from the binding prompt spec. Implement
ONLY if Sri wants prototype-parity; otherwise leave as-is (the screen is spec-compliant without
them). Listed smallest-to-largest:

- **P-a (trivial): header column label.** Prototype header = **"Storage location"**; screen shows
  **"Location"**. One-word label change if parity is wanted.
- **P-b (small): header compliance badge.** Prototype shows a green **"AU (GST inclusive)"** pill
  (3097–3099); screen shows **"Primary region: Australia (ap-southeast-2)"**. The screen's version
  is arguably clearer; change only for parity.
- **P-c (small): encryption cell styling.** Prototype renders encryption as a monospace success
  pill with a short code ("AES-256"); screen renders the full string as plain text. The full string
  ("AES-256 at rest, TLS 1.3 in transit") is MORE informative and matches the DB — recommend
  KEEPING the screen's version; noting the deviation only.
- **P-d (larger): the 3 status cards.** Prototype has a `grid-cols-3` summary row above the table
  (Primary storage / LLM processing / Data sovereignty — 3102–3121). The screen omits them. This
  is the biggest visual gap from the prototype, but §6U.4 does not call for it. If Sri wants the
  at-a-glance compliance summary, add the 3 cards (token-driven, matching the prototype's card
  shape). Otherwise skip — not a defect.

If Sri wants any of P-a..P-d, say which; I'll scope them precisely. Default = do none (spec-compliant).

## Constraints
- Part 1 is display-only; do NOT alter DB values or the DR-01 writer (HIGH-02, closed).
- Token-driven styling; no hex-alpha on CSS vars; keep RESPONSIVE (table scrolls `<sm`, columns
  stack to a definition list on narrowest — §6U.4).
- Do NOT add the status cards / badge / pills unless Sri opts into Part 2 — un-specced scope.

## Report back (paste inline)
1. Part 1: the transform before/after + confirmation "OpenAI"/"Anthropic"/"Supabase" render (no
   "Openai"). Confirm the on-screen "Supabase" spelling was correct or fixed.
2. Part 2: which (if any) polish items Sri opted into — else "none, spec-compliant".
