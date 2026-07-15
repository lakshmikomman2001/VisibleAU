# Claude Code — VERIFY (not re-fix): confirm the aggregator fix by RE-RUNNING it, and confirm 0/0 is actually correct

Two fixes were applied: (1) Number() coercion for the crash, (2) aggregator citation numerator now uses
`@> '[{"domain":...}]'::jsonb` (brand-domain containment) instead of `jsonb_array_length > 0`. Both look right. But the
`visibility_trends` row was set to `0.00/0.00` **manually** — that verifies nothing about the CODE, and may itself be
the wrong answer. Do NOT conclude until these two checks pass. Change no code; this is verification.

## Why the manual row is not proof
- Generating a report now reads the HAND-SET 0.00/0.00 → it'll look fine regardless of whether the aggregator works.
  That masks the fix. The aggregator is only verified by RE-RUNNING it and seeing IT write consistent values.
- 0/0 was chosen to make citation match mention. But which number was the bug? If MENTION detection is under-counting
  (brand is mentioned but brandMentioned=false), the true values are non-zero and you've corrected citation DOWN to a
  wrong baseline — "fixed" to the wrong answer. The subset rule says citation ≤ mention; it does NOT say the magnitude
  is 0.

## CHECK 1 — Is 0/0 even correct? Read the RAW source data
```bash
psql "$DATABASE_URL" -c "SELECT id, domain FROM brands WHERE id='0f531803-b529-4d09-9fd6-b6272b5baba8';"
# For the period's completed audits: total prompts, prompts with brandMentioned, prompts citing the BRAND domain, and prompts citing ANY source
psql "$DATABASE_URL" -c "
  SELECT
    COUNT(DISTINCT c.prompt_id) AS total_prompts,
    COUNT(DISTINCT c.prompt_id) FILTER (WHERE c.brand_mentioned = true) AS mentioned,
    COUNT(DISTINCT c.prompt_id) FILTER (WHERE c.cited_sources @> ('[{\"domain\":\"'|| (SELECT domain FROM brands WHERE id='0f531803-b529-4d09-9fd6-b6272b5baba8') ||'\"}]')::jsonb) AS cited_brand_domain,
    COUNT(DISTINCT c.prompt_id) FILTER (WHERE c.cited_sources IS NOT NULL AND c.cited_sources::text <> '[]') AS cited_any
  FROM citations c JOIN audits a ON c.audit_id=a.id
  WHERE a.brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8' AND a.status='complete';"
# Eyeball a few rows: is the brand name in the response text but brandMentioned=false? (mention-detector under-count check)
psql "$DATABASE_URL" -c "SELECT c.prompt_id, c.brand_mentioned, LEFT(c.response_text, 200) AS response_snippet, c.cited_sources FROM citations c JOIN audits a ON c.audit_id=a.id WHERE a.brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8' AND a.status='complete' ORDER BY c.id DESC LIMIT 8;"
```
Report:
- `mentioned` count: genuinely 0? If 0, spot-check the response_snippets — does "Bondi Plumbing" (or the brand name)
  actually appear in any response while brand_mentioned=false? If yes → **mention detector is under-counting; 0/0 is
  WRONG** (true mention > 0) → that's a Phase-1 detectBrandMention bug to report, and the manual 0 is masking it.
- `cited_brand_domain` vs `cited_any`: if `cited_any` ≈ 70% but `cited_brand_domain` = 0 → confirms the ORIGINAL bug
  (citation counted any source, brand domain never actually cited) → citation truly 0 → 0 is right FOR citation.
- Conclusion: is 0/0 the correct computed answer, or is at least one of them non-zero?

## CHECK 2 — Re-run the AGGREGATOR (not manual, not just regenerate the report) and confirm IT writes consistent values
The stored row must be produced by the FIXED code, not by hand.
```bash
# Note current updated_at:
psql "$DATABASE_URL" -c "SELECT period_label, mention_rate, citation_rate, mention_source_ratio, brand_archetype, updated_at FROM visibility_trends WHERE brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8' AND period_label='2026-W27';"
```
Then trigger a fresh audit for Bondi (or re-run aggregate-visibility-trend for W27) so the fixed `@>` query recomputes
the row. Watch the Inngest terminal for the aggregate-visibility-trend run. Re-query:
```bash
psql "$DATABASE_URL" -c "SELECT period_label, mention_rate, citation_rate, mention_source_ratio, brand_archetype, updated_at FROM visibility_trends WHERE brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8' AND period_label='2026-W27';"
```
Report:
- Did `updated_at` advance (the aggregator actually re-ran and overwrote the row)?
- Are the COMPUTED values consistent with CHECK 1's raw counts (citation_rate = cited_brand_domain/total×100,
  mention_rate = mentioned/total×100, and citation ≤ mention)?
- Is `brand_archetype` consistent (if mention truly 0 → 'invisible' + mention_source_ratio NULL, NOT 'niche_authority')?
  Note: if the manual 0/0 stays but archetype still says 'niche_authority', the archetype wasn't recomputed — the
  aggregator didn't actually re-run.

## CHECK 3 — Only now, the display end-to-end
After CHECK 2 confirms the aggregator writes correct values, generate a report and OPEN the PDF:
- New report id (≠ 6fde33c5), no `.toFixed` crash in the Inngest terminal.
- Narrative shows rates ≤ 100% matching the computed row (e.g. "0.0%/0.0%" only if CHECK 1 confirmed both are truly 0;
  otherwise the real values).
- Mention Source section differs from the exec summary (the earlier dedupe item — confirm or report still-duplicated).

## VERDICT
- **PASS:** CHECK 1 shows 0/0 (or whatever) is the CORRECT computed answer; CHECK 2 shows the aggregator RE-RAN and
  wrote those same consistent values itself (updated_at advanced, archetype consistent); CHECK 3 PDF renders sane. Then
  the citation-rate saga is closed.
- **NOT PASS — mention under-count:** CHECK 1 shows the brand name in responses while brand_mentioned=false → 0/0 is
  wrong, mention detection is the bug → report it; the manual 0 was hiding it.
- **NOT PASS — aggregator not actually re-run:** CHECK 2 updated_at didn't advance / archetype still wrong → the fixed
  code never executed on this row → trigger a real audit and confirm.
- Report which, with the CHECK 1 raw counts + CHECK 2 before/after row.

## NOTE
A manually-corrected DB row proves the code works exactly as much as editing the output proves the function works —
i.e. not at all. The aggregator fix is verified only by re-running it and matching the computed row to the raw citation
data. And 0/0 is a claim about reality (brand never mentioned, never cited) that CHECK 1 either confirms or refutes —
if the brand appears in any response with brand_mentioned=false, the real bug is mention detection and 0/0 is the wrong
answer wearing a consistent-looking mask. Re-aggregate; read the raw data; then read the PDF.
