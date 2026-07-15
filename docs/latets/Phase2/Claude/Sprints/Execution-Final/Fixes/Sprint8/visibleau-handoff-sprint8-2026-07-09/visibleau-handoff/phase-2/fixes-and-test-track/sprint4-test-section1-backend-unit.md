# Claude Code — Sprint 4 Automated Test Track · SECTION 1 of 5: BACKEND UNIT

Mirror the Sprint 3 track structure (S3 Section 1 = 80 backend-unit tests, green). Same runner, same conventions, same
test dir layout as Sprint 3's backend-unit suite. This section covers Sprint 4's pure/near-pure backend functions —
INCLUDING regression guards for this session's 9 bugs at the unit layer, PLUS the rest of Sprint 4's testable backend
surface (not only bug-regressions — match Sprint 3's breadth).

Env: Windows repo `C:\startup\VisibleAU\src\`. Dev DB `visibleau` (NOT prod). Use the repo's existing test runner
(match Sprint 3 — Vitest/Jest, whichever the 80 S3 unit tests use). Co-locate/mirror the S3 backend-unit dir.

## STEP 0 — Match the Sprint 3 convention + read REAL signatures (do not assume)
```bash
# How was S3 Section 1 structured? Match it.
find . -path "*sprint3*" -name "*.test.ts" -not -path "*/node_modules/*" | head; ls tests/ test/ __tests__/ 2>/dev/null
cat vitest.config.* jest.config.* 2>/dev/null | head
# Real signatures of every function under test (adapt all asserts to these):
grep -rn "export .*formatPeriodLabel\|export .*deriveReportStatus\|export .*cleanSubQueries\|export .*selectModel\|export .*getLLMService" lib/
grep -rn "buildMentionSourceSummary\|buildExecutiveSummary\|QUADRANT\|mentionSourceSummary\|formatRate\|formatRatio" lib/communication/
grep -rn "ReportSection\|filter(s => s.include\|all-core-sections\|resolveTemplate" lib/communication/ inngest/functions/generate-narrative-report.ts
```
Report each exported signature. If a target is INLINE (not exported) — e.g. rate formatting or quadrant text embedded
in narrative-generator — extract a minimal pure helper (behavior-preserving; caller uses it) so it's unit-testable.
List any extraction done.

## The Section 1 test files (adapt names to S3 convention + real signatures)

### 1A — period-label.test.ts  [REGRESSION bug 2 + coverage]
`formatPeriodLabel(date, 'weekly'|'monthly')`:
- '2026-07-04' → ISO week label, NOT 'W01' (old Math.ceil(getDate()/7) bug). **Verify the actual date-fns output for
  2026-07-04 and lock the expectation** (likely '2026-W27'; confirm tz doesn't shift it).
- single-digit ISO weeks zero-pad ('2026-W0N').
- monthly → 'yyyy-MM'.
- deterministic: same date → same label (aggregator and report route agree — the mismatch that caused empty reports).

### 1B — rate-format.test.ts  [REGRESSION bug 3 — 7000% + Drizzle-string crash]
`formatRate` (extract if inline):
- `formatRate(70)` → '70.0%' (NOT '7000%') — no ×100 on an already-0-100 value.
- `formatRate('70.00' as any)` → '70.0%' and does NOT throw (Drizzle NUMERIC returns STRING; old as-number cast +
  .toFixed crashed).
- `formatRate('0.00' as any)` → '0.0%' (not NaN).
- valid rate never renders >100%.
`formatRatio` / mention_source_ratio (U-12):
- `formatRatio(null)` → 'N/A' string (mention_rate=0 → ratio NULL) — no crash, not '0.00'.
- `formatRatio(1)` → '1.00'.

### 1C — clean-sub-queries.test.ts  [REGRESSION bug 5b — STRONGEST unit case]
`cleanSubQueries(rawLLMText, count)` — feed the ACTUAL garbage shapes from the real-LLM run:
- drops preamble ('Certainly! Here are 12 search sub-queries:') — result[0] is a real query.
- strips leading numbering '1. ' / '2) '.
- drops markdown headers '### Reputation & Reviews' and rules '---'.
- strips '**bold**' and wrapping quotes.
- drops trailing-colon section labels ('Reputation & Reviews:').
- caps at `count`; NEVER pads with junk to reach count (fewer clean > padded garbage).
- returns [] on '' / failed input (matches the try/catch graceful default).
Match the real regexes from STEP 0; add any other artifact shapes present in the code.

### 1D — derive-report-status.test.ts  [Sprint 4 CORE — CM-01, not a regression but central]
`deriveReportStatus(row)` (pdf_url + email_sent_at → status; NO status column):
- pdf_url null → 'generating'.
- pdf_url set + email_sent_at null → 'ready'.
- pdf_url set + email_sent_at set → 'published'.
- (guard) never returns a 4th value; the three-branch CASE is total.

### 1E — report-sections.test.ts  [Sprint 4 CORE — template/section framework]
`ReportSection[]` filtering + fallback:
- `sections.filter(s => s.include)` returns only include:true, preserving `order`.
- the default template's 5 core sections (executive_summary, score_breakdown, mention_source_divide, fan_out_coverage,
  topical_gap_summary) are include:true; the other 7 include:false.
- template resolution: when no is_default template resolves, falls back to all-core-sections (§5.4 / LLD 8225) — assert
  the fallback yields the 5 core sections, not empty.

### 1F — quadrant-summary.test.ts  [REGRESSION bug 8 — section duplication]
`buildMentionSourceSummary` vs `buildExecutiveSummary`:
- niche_authority → contains 'niche authority quadrant' + 'expand prompt coverage'.
- mention-source summary is NOT byte-identical to the exec summary (the duplication bug).
- each archetype → its correct action (recognised_authority / known_but_untrusted / niche_authority / invisible per LLD
  6129-6134) — table-driven test over the 4.
- unknown archetype → invisible-quadrant fallback, no throw.
- ratio NULL → 'N/A' in the summary (ties to 1B).

### 1G — llm-service-factory.test.ts  [REGRESSION bug 4 — PARTIAL, state the limit]
`getLLMService(engine)`:
- returns a DIFFERENT impl per engine — anthropic/google/perplexity impls are NOT the same instance/type as openai (old
  bug: one OpenAI impl for all).
- if impls expose a provider id, assert the mapping (anthropic→'anthropic', etc.).
- unknown engine → throws (fail loud, not silently OpenAI).
- **FILE COMMENT (required):** "This proves the FACTORY routes per engine. It does NOT prove each impl calls its
  provider's API — that's Section 2 (Backend E2E). A unit test cannot catch a mis-wired SDK inside an impl."
Also `selectModel(tier, engine, 'narrative_generation')` → the CHEAPEST model for the tier/engine (spot-check 2-3
tier/engine pairs against selectModel's table).

## STEP 6 — Extract pure helpers ONLY where needed (behavior-preserving)
If rate/ratio formatting or quadrant text is inline in narrative-generator, extract `formatRate`/`formatRatio`/
`buildMentionSourceSummary` as pure exports; the narrative code calls them. Tiny, mechanical, no behavior change.

## STEP 7 — Run + PROVE the guards actually catch the bugs (the anti-"green-but-broken" step)
```bash
<repo test cmd> run   # all Section 1 green
```
Then re-introduce ONE old bug and confirm the matching test FAILS, then revert:
- change formatRate to multiply by 100 → 1B fails.
- change formatPeriodLabel back to Math.ceil(getDate()/7) → 1A fails.
- make cleanSubQueries a plain split('\n') → 1C fails.
Report: Section 1 count + all green; and that the re-introduce-bug check FAILED as expected for 1A, 1B, 1C (proving the
regression guards are real, not vacuous).

## Constraints
- Match Sprint 3's runner + dir convention exactly (don't add a second framework).
- Assert against REAL signatures (STEP 0) — adapt every sketch above; no invented names.
- Dev DB `visibleau`, never prod. These are pure-function unit tests — no DB/network calls; if a function needs a row,
  pass a plain object fixture, don't hit the DB (that's Section 2).
- Extractions behavior-preserving; caller uses the extracted helper.
- Do NOT unit-test bucket upload / tier DB-join / poll-race here — those are Sections 2 & 4. (Not in scope for Section 1.)

## NOTE
Section 1 = Sprint 4's backend PURE-function layer: period-label (ISO week), rate/ratio format (Drizzle-string + no
×100 + NULL guard), cleanSubQueries, deriveReportStatus (CM-01), section filtering + fallback, quadrant summary
(distinct), llm factory routing (partial). Six of the nine session bugs have their regression guard here; the CORE
Sprint-4 functions (status derive, section framework) round it to Sprint-3 breadth. The STEP 7 re-introduce-bug proof is
the point — a passing test only counts if it fails on the bug it guards. Sections 2 (Backend E2E: upload, engine calls,
tier join, fan-out 429, coverage), 3 (Frontend Unit), 4 (Frontend E2E: poll behavior), 5 (QA) come after, one at a time.
