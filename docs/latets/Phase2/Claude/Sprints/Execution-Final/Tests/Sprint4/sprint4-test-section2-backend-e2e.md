# Claude Code — Sprint 4 Automated Test Track · SECTION 2 of 5: BACKEND E2E

Mirror Sprint 3's Section 2 (263 tests, "acceptance MET" gate). Same runner/conventions/dir as S3's backend-E2E suite,
LLM_MODE=mock for the deterministic suite (a small real-LLM smoke is separate — see 2K). This section covers the Sprint
4 prompt §11 mandated files PLUS the session-bug E2E surface that only integration catches (real upload, 4-provider
routing, tier DB-join, fan-out 429, brandAppeared).

Env: Windows repo `C:\startup\VisibleAU\src\`. Dev DB `visibleau` (NEVER prod — assert this in setup). Inngest dev
server up. Match S3 Section 2 structure.

## STEP 0 — FIRST: settle the 13 pre-existing failures (unfinished from Section 1) + match S3 convention
The Section 1 close reported "85 green" for the NEW files but never classified the 13 pre-existing failures across 4
files that were flagged. Do NOT build Section 2 on an unexplained-red suite. Classify them now:
```bash
<repo test cmd> run 2>&1 | grep -iE "fail|✗|✘|×" | head -60      # the 13 failures + files
# For each of the 4 files, show the failing assertion:
sed -n '1,60p' <failing-file>   # repeat per file
# Match S3 Section 2 layout:
find . -path "*sprint3*" -name "*integration*" -o -path "*sprint3*" -name "*e2e*" 2>/dev/null | head
```
Classify EACH of the 4 files into ONE bucket + report:
- **STALE (fix-invalidated)** — asserts OLD behavior this session changed: `×100`/7000%-era rates, single-engine
  routing / `getLLMService()` no-arg, week-of-month period labels, `brandMentioned` (not `brandAppeared`), or the
  duplicated exec/mention-source text. → UPDATE the test to the corrected behavior (the test is wrong now, not the
  code). Report which + update them.
- **KNOWN-BANKED** — the documented stable Sprint 1 `audit_cost_snapshots` FK-cascade `confdeltype` failure. If a
  failure is exactly that, mark accepted (it's ONE test).
- **REAL REGRESSION** — genuinely broken, drifted from S3's 344-green. → report; likely a Section 2 finding to fix.
Report the 4 filenames, per-file count, bucket, and action taken. **Suite must be green (or every red explicitly
classified) before Section 2 counts as passing** — a committed suite with unexplained reds is the exact "ignore-the-red"
failure this track prevents.

## SECTION 2 test files — the Sprint 4 §11 mandated set (build/verify each)

### 2A — narrative-generator.test.ts  [§11 — the honesty engine]
- RULE 1: NO causal language when `quality_status='insufficient'` ("appears to… based on available samples", never
  "improved because").
- RULE 3: key win requires `score_delta > 0 AND sample_quality >= 'Likely'` — assert EXCLUDED below the bar.
- section omission: a section whose table EXISTS in S4 (fan_out_coverage) is OMITTED when no row for the period; the
  forward-slot sections (linkedin_performance etc.) render nothing because slots are unwired — assert the FRAMEWORK
  omits them (not "absent table returns empty").
- `selectModel(tier, engine, 'narrative_generation')` is CALLED (not a hardcoded model string).

### 2B — report-status.test.ts  [§11 — CM-01 at integration]
Derived badge from a real row: pdf_url null→generating; set+email_sent_at null→ready; email_sent_at set→published. No
status column read anywhere.

### 2C — generated-reports.append-only.test.ts  [§11 — U-13]
Regenerating INSERTs a NEW row (no UPSERT/ON CONFLICT); updated_at bumps on pdf_url then on email_sent_at. Two
generations for the same brand/period → two rows.

### 2D — delivery-scheduler.test.ts  [§11]
weekly requires day_of_week (zod refine REJECTS otherwise); monthly requires day_of_month; due-calc respects UTC
time_of_day.

### 2E — default-template.seed.test.ts  [§11]
is_default row exists per org; its 5 core sections (executive_summary, score_breakdown, mention_source_divide,
fan_out_coverage, topical_gap_summary) are include:true, the other 7 false.

### 2F — send-scheduled-reports.integration.test.ts  [§11]
Due schedule sends via the Resend SINGLETON with a pre-signed PDF; EM-01 guard makes the Phase 1 digest SKIP a brand
that has a weekly schedule (no double-send).

### 2G — alert-composer.test.ts  [§11 — NP-01]
Each alert gated on its OWN preference: `emailOnHallucination=off` suppresses ONLY the hallucination alert, not drift.
(Table-drive the alert types.)

### 2H — communication-rls.test.ts  [§11 — RLS]
Cross-org reads BLOCKED on all 3 tables (report_templates, generated_reports, report_delivery_schedules). Both USING
and WITH CHECK.

## SECTION 2 — session-bug E2E surface (NOT in §11, but only integration catches these)

### 2I — report-pipeline.integration.test.ts  [bugs 1, 6 + convergence]
The end-to-end the handoff's convergence test describes, in mock where possible:
- generate → narrative → render → **upload to the reports bucket** → pdf_url set (bug 1: assert upload path works;
  against an emulated/test bucket or a real one in a dev project — NOT prod). If a bucket can't be provisioned in CI,
  assert the adapter is CALLED with the right bucket/path + mark the live-upload piece as an integration-env todo (do
  NOT fake success).
- fan-out coverage reads **`brandAppeared`** (bug 6 — the property rename); assert coverage reflects appeared count,
  not a silent 0 from a wrong property.
- period_label written by the aggregator MATCHES what the report route queries (bug 2 at integration — the mismatch
  that produced empty reports).

### 2J — engine-routing.integration.test.ts  [bug 4 — the part unit CAN'T prove]
With mock providers registered per engine: an audit dispatches to FOUR distinct provider impls (not OpenAI ×4). Assert
each engine's call hits its own impl (mock spies per provider) — the unit factory test proved routing; THIS proves the
audit loop actually calls all four. (Real-provider version is 2K smoke.)

### 2K — tier-source.integration.test.ts  [bug 7 — DB join, the part behavioral verified]
Seed an org where subscriptions.tier=agency, organizations.tier=starter (DIVERGENT). Assert the gate/engine-count
resolves from subscriptions.tier (agency), NOT organizations.tier. Reverse (sub=starter/org=agency) → fails closed.
This is the DB-join proof a unit test can't give.

### 2L — fan-out-resilience.integration.test.ts  [bug 5a — the 429 graceful-skip that NEVER fired in manual]
Mock one engine (gemini) to throw a 429/AI_RetryError; assert simulate-query-fan-out SKIPS that engine and STILL writes
rows for the others (does NOT crash the whole step). This finally EXERCISES the try/catch that never fired in manual
runs — the coded-but-unverified path.

## STEP 2 — Acceptance gate (S3 pattern: "acceptance MET")
Define the Section 2 acceptance the way S3 did: all §11 files green + 2I–2L green (or their env-limited pieces
explicitly todo'd, not faked) + the 13 pre-existing classified/resolved + suite regression (no S1 85 broke). Report the
count and "acceptance MET / NOT MET".

## STEP 3 — Run + prove one integration guard catches its bug
```bash
<repo test cmd> run <section2 dir>
```
Re-introduce ONE bug at the integration layer and confirm the matching test fails, then revert:
- revert engine routing to getLLMService() no-arg → 2J fails (single impl for all).
- rename brandAppeared back to brandMentioned in the coverage read → 2I coverage assertion fails.
Report: Section 2 count all green; 13 pre-existing classified; the re-introduce check failed as expected for 2J.

## Constraints
- Match S3 Section 2 runner/dir/convention. LLM_MODE=mock for the deterministic suite; keep any real-LLM to a tiny
  separate smoke.
- Dev DB `visibleau`, NEVER prod — assert the DB name in setup (the START-PROD footgun).
- Do NOT fake the upload/tier/routing integration by asserting a mock returns what you told it — use real dev
  DB + per-provider spies; where an env truly can't run it (live bucket in CI), mark it todo, don't green-fake it.
- The Sprint 4 prompt §11 is the authoritative file list; the LLD WINS if the prompt and LLD disagree.
- Classify the 13 pre-existing reds — no unexplained failures carried forward.

## NOTE
Section 2 is where 5 of the 9 session bugs finally get their layer: real upload (1), 4-provider routing (4 fully), tier
DB-join (7), fan-out 429 graceful-skip (5a — the try/catch that never fired), brandAppeared coverage (6). Plus the §11
mandated honesty-engine / RLS / append-only / scheduler / seed / alert files. And STEP 0 finally settles the 13
pre-existing failures Section 1 left unexplained — stale (update), known-banked (accept the one), or real (fix). No
green-faking the integration bugs, no unexplained reds carried forward. Prove it with the 2J re-introduce check, hit
"acceptance MET", then Section 3 (Frontend Unit).
