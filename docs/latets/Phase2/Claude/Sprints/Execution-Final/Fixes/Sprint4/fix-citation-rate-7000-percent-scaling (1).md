# Claude Code — FIX: citation rate — remove the render ×100 (confirmed) AND fix the impossible 70/0 data (aggregator)

Q1 settled the display layer: stored `citation_rate = 70.00` (percentage), renderer does `* 100` → 7000%. That's a
renderer bug at `narrative-generator.ts:155` (+ 226-227), never touched this session. **Fix it — BUG B below.**

But do NOT stop there. `mention_rate = 0.00` with `citation_rate = 70.00` is **structurally impossible**, not a "data
quality side note". This is BUG A and it's the more important one. After removing the ×100 you'd print
"Mention 0%, citation 70%" — still wrong, just less obviously. Fix both.

## Why 70/0 is impossible (from the aggregator's OWN formulas + LLD 6108-6120 — verified)
Both rates divide by the SAME denominator (`totalPrompts` = DISTINCT promptId for the period):
- `mention_rate` numerator = DISTINCT promptId WHERE `citations.brandMentioned = true`
- `citation_rate` numerator = DISTINCT promptId WHERE `citations.citedSources` JSONB **contains the brand domain**
A prompt whose citedSources contains the brand's domain is a prompt where the brand appears as a source → it should ALSO
have `brandMentioned = true`. So **citedPrompts ⊆ mentionedPrompts → citation_rate ≤ mention_rate, ALWAYS.**
Stored 70/0 means citedPrompts = 0.7·total while mentionedPrompts = 0 — a subset larger than its superset. That only
happens if the two counters use **inconsistent sources/logic**. Real bug.

Env: local PROD DB, real LLMs. Brand `0f531803-b529-4d09-9fd6-b6272b5baba8`, period `2026-W27`.

---

## BUG B (DISPLAY) — remove the render ×100 [confirmed, do first]
`lib/communication/narrative-generator.ts`:
- **Line ~155** (narrative text): `${(mentionRate * 100).toFixed(0)}% ... ${(citationRate * 100).toFixed(0)}%`
- **Lines ~226-227** (`mentionSourceSummary` passed to the PDF): same `* 100`
Fix — values are ALREADY 0-100, so format without multiplying:
```ts
// WRONG: `Mention rate: ${(mentionRate * 100).toFixed(0)}%, citation rate: ${(citationRate * 100).toFixed(0)}%`
// RIGHT: `Mention rate: ${mentionRate.toFixed(1)}%, citation rate: ${citationRate.toFixed(1)}%`
```
- Remove EVERY `* 100` on mentionRate/citationRate in narrative-generator.ts (line 155 AND 226-227), and check
  `pdf-builder.tsx` doesn't multiply again.
- Leave `mention_source_ratio` alone (genuinely 0-1); honour NULL-on-zero-mention → render 'N/A' (LLD 6123-6127).
```bash
grep -rn "mentionRate\|citationRate\|mention_rate\|citation_rate" lib/communication/narrative-generator.ts lib/communication/pdf-builder.tsx | grep "\* *100"   # must be 0 after fix
```

## BUG A (DATA) — the two numerators are inconsistent [the real bug]

### STEP A1 — Read both numerators in the aggregator
```bash
sed -n '80,135p' lib/visibility/visibility-trend-aggregator.ts
grep -n "citedPrompts\|mentionedPrompts\|brandMentioned\|citedSources\|brandDomain\|brand.*domain\|\.host\|includes\|contains\|COUNT\|filter\|totalPrompts" lib/visibility/visibility-trend-aggregator.ts
```
Report the EXACT logic for:
- `mentionedPrompts` — does it count `brandMentioned === true`?
- `citedPrompts` — does it filter `citedSources` to the **brand's own domain**, or does it count prompts with ANY cited
  source / any citation row?
**Prime suspect (mirrors LLD line 66-69, where a URL wasn't validated against the brand domain):** `citedPrompts`
counts prompts that have citedSources at all, NOT prompts citing the BRAND domain → citation inflates to 70% while
mention stays 0%. If so, that's the bug.

### STEP A2 — Check the source data to see which counter is wrong
```bash
# How many prompts in the period, how many have brandMentioned, how many cite the brand domain:
psql "$DATABASE_URL" -c "
  SELECT
    COUNT(DISTINCT c.prompt_id) AS total_prompts,
    COUNT(DISTINCT c.prompt_id) FILTER (WHERE c.brand_mentioned = true) AS mentioned_prompts,
    COUNT(DISTINCT c.prompt_id) FILTER (WHERE c.cited_sources IS NOT NULL AND c.cited_sources::text <> '[]') AS any_cited_prompts
  FROM citations c
  JOIN audits a ON c.audit_id = a.id
  WHERE a.brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8' AND a.status='complete'
    AND a.created_at >= '2026-06-29' AND a.created_at < '2026-07-06';"   -- W27 window; adjust to the real period boundaries
# And the brand's domain, to test the domain-contains logic:
psql "$DATABASE_URL" -c "SELECT id, domain FROM brands WHERE id='0f531803-b529-4d09-9fd6-b6272b5baba8';"
# Sample a few citedSources to see if the brand domain actually appears:
psql "$DATABASE_URL" -c "SELECT c.prompt_id, c.brand_mentioned, c.cited_sources FROM citations c JOIN audits a ON c.audit_id=a.id WHERE a.brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8' AND a.status='complete' ORDER BY c.id DESC LIMIT 8;"
```
Report:
- Is `mentioned_prompts` genuinely 0? (If yes, `brandMentioned` was never set true → maybe the MENTION detector is the
  bug, not citation.) 
- Does `any_cited_prompts` ≈ 70% of total while the brand domain does NOT actually appear in those citedSources? (→
  citation counter isn't filtering to the brand domain — the citation bug.)
- Do the sampled `cited_sources` contain the brand's domain or third-party domains? This tells you which counter lies.

### STEP A3 — Fix whichever numerator is wrong (per A1/A2 evidence)
- **If citedPrompts counts any-source (not brand-domain):** filter it to prompts whose `citedSources` contains the
  brand's domain (`new URL(src).host === brand.domain` or known subdomain — same check LLD line 69 prescribes). Then
  citation_rate ≤ mention_rate holds.
- **If brandMentioned is under-set (mention detector missing real mentions):** that's a Phase 1 `detectBrandMention()`
  gap — report it; it may be out of Sprint 4 scope, but the inconsistency must be resolved (don't ship 0 mentions when
  the brand is clearly cited).
- Do NOT "fix" by clamping display — fix the count so the two rates are consistent (subset relationship holds).

### STEP A4 — Re-aggregate, then regenerate (renderer fix alone won't touch stored rates)
The stored row is from 2026-07-03 17:28 and won't change until aggregation re-runs.
```bash
# After fixing the aggregator: re-run aggregate-visibility-trend for W27 (or trigger a fresh audit), then:
psql "$DATABASE_URL" -c "SELECT period_label, mention_rate, citation_rate, mention_source_ratio, brand_archetype, updated_at FROM visibility_trends WHERE brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8' AND period_label='2026-W27';"
```
Acceptance for the row: `citation_rate ≤ mention_rate`; archetype consistent (if mention truly 0 → 'invisible' +
mention_source_ratio NULL, NOT 'niche_authority' with citation 70); `updated_at` newer than the fix.

## STEP 5 — VERIFY end-to-end (regenerate report, OPEN the PDF)
```bash
psql "$DATABASE_URL" -c "SELECT id, period_label, narrative_text, created_at FROM generated_reports WHERE brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8' ORDER BY created_at DESC LIMIT 1;"
```
- Narrative reads sane percentages ≤ 100% (BUG B fixed) AND citation ≤ mention (BUG A fixed).
- OPEN the PDF: no 7000%; numbers internally consistent; Mention Source section differs from exec summary.
Report raw row values + rendered line together.

## Constraints
- Stored unit is 0-100 (MS-01) — fix display by removing ×100, NOT by changing the aggregator's scale.
- BUG A is a COUNT/source fix (brand-domain filter or mention-detection), re-aggregate to overwrite the stale row.
- Inngest function edits need a dev-server RESTART (not just Fast Refresh) to take effect — restart before regenerating.
- Leave mention_source_ratio (0-1) + its NULL guard intact. No status column. Old rows are append-only artifacts.

## NOTE
Two bugs. B (display ×100 at line 155/226-227) is confirmed and quick. A (citation 70 with mention 0) is the one Claude
Code labelled a "side note" — it is not; it's impossible under the shared-denominator formulas (a cited-brand prompt is
a mentioned prompt), so the two counters disagree. Most likely the citation counter isn't filtering citedSources to the
BRAND domain (LLD line 66-69's exact hazard). STEP A2's SQL shows which counter lies. Fix both, re-aggregate, and read
BOTH the raw row (citation ≤ mention) and the PDF (≤100%) before calling it done — "0% / 70%" is still wrong even at the
right scale.
