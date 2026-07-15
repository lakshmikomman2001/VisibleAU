# Claude Code — Sprint 4 Automated Test Track · SECTION 5 of 5: QA (final gate)

Sprint 3's Section 5 hit a known gap: no `p2sprintN` QA batch scripts exist — it fell back to the §12 verification greps
+ real-data end-to-end. Same here. Section 5 = three things: (A) the §12 invariant greps as an automated QA gate, (B)
the §13 anti-pattern regression audit, (C) the real-data convergence checklist (mostly DONE live this session — QA =
confirm + record, not re-do). This is the closing gate for the whole Sprint 4 test track.

Env: Windows repo `C:\startup\VisibleAU\src\`. Dev DB `visibleau`, never prod.

## STEP 0 — Confirm the batch-script gap + baseline
```bash
ls scripts/qa/ scripts/*qa* 2>/dev/null; find . -name "*p2sprint*" -o -name "*qa-batch*" 2>/dev/null | grep -v node_modules | head
```
If no p2sprint4 QA batch script exists (expected), record it as the known gap and proceed with A/B/C. Confirm the full
suite baseline is green first: vitest 121 files / 1849 (or current) + Playwright 18, all green.

## PART A — §12 VERIFICATION GREPS as an automated QA gate
Run EVERY §12 grep and report the actual count vs expected. These are the machine-checkable Sprint 4 invariants — a QA
gate that fails loudly if any regressed. (Optionally wrap them in a `scripts/qa/sprint4-invariants.sh` that exits
non-zero on any mismatch, so it's re-runnable.)
```bash
# Schema / migration
grep -c "CREATE TABLE IF NOT EXISTS" db/migrations/*sprint4*.sql            # → 3
grep -c "DROP POLICY IF EXISTS"      db/migrations/*sprint4*.sql            # → 3
# CM-01: NO status column; U-13: APPEND-ONLY (no conflict)
grep -ic "status" db/schema/generated-reports.ts                           # → 0 (no status col)
grep -ic "on conflict\|onConflict" db/schema/generated-reports.ts          # → 0
# TS-01: ReportSection typed + 12 types incl evidence_snapshots
grep -c "ReportSection" lib/communication/types.ts                         # → ≥1
grep -c "evidence_snapshots" lib/communication/types.ts                    # → ≥1
# Narrative honesty + model routing (no hardcoded model)
grep -Rc "selectModel(" lib/communication/narrative-generator.ts           # → ≥1
grep -RnE "'claude-3|'gpt-4|'gemini-" lib/communication/                   # → 0
# Event chain + webhook emit
grep -Rc "'trend/aggregated'" inngest/functions/generate-narrative-report.ts  # → ≥1
grep -Rc "'report/generated'"  inngest/functions/generate-narrative-report.ts  # → ≥1
# Resend singleton reused (NOT new-ed)
grep -Rc "from '@/lib/email/client'" inngest/functions/send-scheduled-reports.ts lib/communication/alert-composer.ts  # → ≥2
grep -RnE "new Resend\(" lib/communication/ inngest/functions/send-scheduled-reports.ts  # → 0
# PDF theme imported not duplicated
grep -Rc "from '@/lib/pdf/theme'\|lib/pdf/theme" lib/communication/pdf-builder.ts  # → ≥1
# EM-01 dedup guard in Phase 1 digest
grep -Rc "report_delivery_schedules" inngest/functions/send-weekly-digest.ts  # → ≥1
# Schedule mutual-exclusivity refine
grep -Rc "day_of_week required for weekly\|day_of_month required for monthly" "app/api/organizations/[id]/delivery-schedules/"  # → ≥1
# Both functions registered in serve() (note: session added render-report-pdf + send-scheduled — verify actual count)
grep -cE "generateNarrativeReport|sendScheduledReports|renderReportPdf" app/api/webhooks/inngest/route.ts  # → ≥2 (report actual)
# UI: no hex-alpha on var(); responsive present
grep -REc "var\(--[a-z-]+\)[0-9a-fA-F]{2}" components/domain/communication/  # → 0
grep -RcE "md:grid-cols|sm:" "app/(auth)/brands/[brandId]/reports/"          # → ≥1
# Tier source-of-truth + no Clerk
grep -RnE "organizations\.tier|org\.tier" lib/communication/ | grep -iv subscriptions  # → 0
grep -Rc "Clerk\|@clerk" lib/communication/ db/ app/api/brands/             # → 0
```
Report a PASS/FAIL table: each grep, expected, actual, ✓/✗. ANY ✗ is a QA finding — investigate (is it a real
regression, or did the code legitimately diverge and the grep needs updating? classify like the 13-failures pass). Note:
a few greps may need path/count tweaks to match the repo (e.g. serve() count is higher now that render-report-pdf +
send-scheduled were added this session) — report the ACTUAL and reconcile, don't force the expected.

## PART B — §13 ANTI-PATTERN regression audit
For each Sprint 4 anti-pattern, confirm the code did NOT fall into it (many are already covered by Section 1-2 tests —
QA is the consolidated confirmation):
| # | Anti-pattern | Check | Covered by |
|---|---|---|---|
| 1 | status column on generated_reports | grep status col = 0 (Part A) | 2C append-only |
| 2 | generated_reports UPSERT | grep onConflict = 0 (Part A) | 2C |
| 3 | causal language when thin | RULE 1 test | 2A |
| 4 | hardcoded report model | selectModel present, no model literals (Part A) | 1G/2A |
| 5 | new Resend / dup theme | grep new Resend = 0, theme import ≥1 (Part A) | 2F |
| 6 | all alerts gated on emailOnDrift | NP-01 per-preference | 2G |
| 7 | missing EM-01 dedup guard | digest references schedules (Part A) | 2F |
| 8 | weekly/monthly field bleed | Zod refine both sides | 2D + 4F |
| 9 | storing AEST times | time_of_day UTC | 2D |
| 10 | querying S5/S6 tables in S4 | grep linkedin_presence_audits/brand_consensus/content_structure in S4 code = 0 | scope |
```bash
# Anti-pattern 10 — the scope boundary: S4 must NOT reference S5/S6 tables (they don't exist yet)
grep -RnE "linkedin_presence_audits|brand_consensus_checks|content_structure_audits|youtube_presence_audits" lib/communication/ inngest/functions/generate-narrative-report.ts  # → 0 (forward slots unwired)
```
Report each anti-pattern: AVOIDED ✓ / VIOLATED ✗ with evidence. #10 especially — confirm the forward-slot sections are
UNWIRED (framework omits them), not querying nonexistent S5/S6 tables.

## PART C — REAL-DATA CONVERGENCE CHECKLIST (confirm + record — mostly done live this session)
This is the "works on the real rendered screen" gate — most items were validated live this session on Metropolitan
Plumbing (real 4-engine data). QA = confirm each is still true + record, NOT re-run from scratch. For each, mark
DONE-THIS-SESSION / RE-CONFIRM / GAP:
1. Report generates end-to-end in PROD mode (real LLM) — PDF lands in Supabase bucket. [done: Metropolitan]
2. PDF renders real narrative PROSE + sections, not raw JSON (10a) and not a 2KB empty shell. [done]
3. Rates render sane (≤100%, no 7000%) on real data; citation ≤ mention holds. [done: 10.0%/10.0%]
4. Fan-out sub-queries clean (no preamble/numbering/markdown); coverage reads brandAppeared. [done: 10b + brandAppeared]
5. Engine routing hits 4 distinct providers (not OpenAI ×4). [done]
6. Tier gating from subscriptions.tier (divergence both directions). [done: behavioral]
7. Auto-refresh: badge flips Generating→Ready without reload, polling stops. [done: 4B + live]
8. Mention-source section is DISTINCT quadrant analysis, not a dup of the exec summary. [done]
9. Reports = Growth+ gate; delivery schedules = Agency+. [done: 4C/4F]
Report the checklist with each item's status. If any is a GAP (not actually confirmed), flag it — don't assume.

## PART D — TRACK SUMMARY (the close-out of all 5 sections)
Produce the final Sprint 4 test-track scorecard:
| Section | Layer | Tests | Status |
|---|---|---|---|
| 1 | Backend Unit | 85 | ✓ regression proofs fired |
| 2 | Backend E2E | 206 | ✓ 4 seams real-behavioral |
| 3 | Frontend Unit | 27 | ✓ bug-9 condition guarded |
| 4 | Frontend E2E | 18 | ✓ bug-9 end-to-end + nav finding |
| 5 | QA | §12 greps + §13 audit + convergence | (this) |
- Full suite: vitest (121/1849) + Playwright (18) — all green.
- Open findings carried forward: the nav-orphaned org-scoped pages (report-templates + delivery-schedules — no nav
  path); scoped-DELETE hardening for truncateAll(); the TIER_ENGINES starter-vs-agency count question; NULL
  mention_source_ratio render path (coded, low-traffic).
- Deferred-by-spec (NOT gaps — §14): LinkedIn/consensus/knowledge-panel/entity-home report sections + hallucination/
  consensus alerts are DORMANT until Sprint 5 creates their tables. QA must NOT flag these as failures.

## Constraints
- Dev DB `visibleau`, never prod.
- §12 greps: report ACTUAL counts; where the repo legitimately diverged (serve() count higher due to session-added
  functions), reconcile and explain — don't force-pass or force-fail.
- §13 #10 (scope): the S5/S6 forward slots MUST be unwired — a reference to a nonexistent S5/S6 table is a real bug.
- PART C: confirm/record; do NOT re-run real-LLM audits unless an item is genuinely unconfirmed (real spend).
- Do NOT flag the §14 deferred sections as QA failures — they are dormant-by-design.
- Any §12/§13 ✗: classify (real regression vs grep-needs-update) like the 13-failures pass; a wrong grep is not a code
  bug, a real violation is.

## NOTE
Section 5 is the consolidated QA gate: §12 invariant greps (machine-checkable — status/upsert/model/Resend/theme/EM-01/
tier/Clerk), §13 anti-pattern audit (did we regress into a known trap — esp. #10, S5/S6 scope), and the real-data
convergence checklist (mostly proven live this session on Metropolitan — QA confirms + records). No p2sprint4 batch
script exists (known gap, same as S3). The output is the 5-section scorecard + the honest open-findings list (nav-
orphaned pages, truncateAll hardening, TIER_ENGINES count, NULL-ratio render) + the deferred-by-spec S5 sections that
must NOT be counted as failures. That closes the Sprint 4 automated test track.
