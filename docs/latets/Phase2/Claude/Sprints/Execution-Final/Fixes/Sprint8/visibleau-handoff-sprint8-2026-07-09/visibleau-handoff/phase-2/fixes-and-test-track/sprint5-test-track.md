# Claude Code — Sprint 5 (Trust Intelligence) test track — implement §11 named tests + §12 greps (same as S2/S3/S4)

Trust feature is manually verified on screen (all 8 screens clean; 8 bugs fixed incl. systemic badge contamination +
CSS-var contrast). Now implement the S5 automated tests the SAME way S2/S3/S4 did: the §11 named test files + the §12
verification greps. Most §11 tests ALREADY EXIST from this session's audit + cleanup — this prompt confirms them, fills
the gaps (mainly s4-wiring.integration.test.ts), adds the §12 grep script, and adds the ONE guard the manual pass earned
(card-badge). Every test real-behavioral with a re-break proof. NO source-greps, NO typeof-smoke.

Env: Windows repo `C:\startup\VisibleAU\src\`. Dev DB `visibleau`. LLM_MODE=mock. Never prod. Tests live in
tests/phase2/sprint5/ (§11). Canon §11 (required tests) + §12 (greps) + §13 (anti-patterns).

## FIRST — inventory (do NOT duplicate what exists)
```bash
ls tests/phase2/sprint5/ 2>/dev/null
find tests -iname "*trust*" -o -iname "*hallucination*" -o -iname "*entity*" -o -iname "*consensus*" -o -iname "*linkedin*" -o -iname "*youtube*" -o -iname "*citation-intel*" -o -iname "*s4-wiring*" | sort
```
Report which of the §11 list already exist (green) vs are MISSING.

## §11 TESTS REQUIRED — implement/confirm each (LLM_MODE=mock). Same flat list as S3's 11 / S4's 8:

1. **trust-explainability.test.ts** — scored S5 routes (/trust, /entity-score, …) pass data through
   ExplainabilityService.annotate(); responses include rationale (non-empty, >30 chars) + confidence_label +
   confidence_note + top_action alongside scores; service imported not redefined (reused from S3). (G3-01.) [EXISTS —
   confirm real + green.]
2. **hallucination-risk.test.ts** — LEAST(100,15c+5w+1i) over is_false_positive=false rows; **acknowledging does NOT
   lower risk, marking false-positive DOES** (§13); fixture 1 crit + 1 warn → 20. [EXISTS (8, re-break proven) — confirm.]
3. **hallucination-detector.test.ts** — claim_type classification from hallucinationFlags; severity mapping
   (wrong_price→critical, etc.). [EXISTS (14) — confirm.]
4. **entity-checker.test.ts** — reads abn_verified before re-checking ABN (no duplicate S7 call); market_code drives the
   registry. [REWRITTEN this session to behavioral — confirm it asserts abn_verified-read + market_code, real + re-break.]
5. **citation-intelligence.test.ts** — gap_severity boundaries (>20 critical / 10–20 warning / <10 opportunity / present
   covered); the TWO partial unique indexes prevent dup (with and without audit_id). [REWRITTEN numbers-not-strings —
   confirm it now covers the gap_severity BOUNDARIES + the two-index dup, real + re-break.]
6. **linkedin-auditor.test.ts / consensus-checker.test.ts / youtube-auditor.test.ts** — each score formula at its
   thresholds; consensus cron UPSERTs (no month-2 dup); youtube channel-absent → score 0. [EXIST (6/5/4) — confirm each
   asserts the formula at thresholds + the UPSERT + youtube-0, re-break.]
7. **s4-wiring.integration.test.ts** — **THE MAIN GAP (build this — it's the sprint's whole point).** Once an S5 row
   exists, the S4 narrative-generator renders the corresponding section (linkedin_performance / consensus_score /
   knowledge_panel_status / source_type_gaps / evidence_snapshots) AND the S4 alert-composer fires the
   hallucination/consensus alerts gated on their own preference. Cover, with re-break (unwire → fail):
   - seed each S5 table → assert its section renders in the generated narrative.
   - **knowledge_panel §240:** renders ONLY when present=false OR accurate=false; present+accurate → OMITTED (bug-5 fix).
   - **default-path (Bug A guard):** the S5 sections render from the DEFAULT template (no hand-inserted template) — fresh
     org → generate → S5 sections present. (Would have caught Bug A's rigged smoke.)
   - **dual consensus alerts at their OWN thresholds:** in-app action_items at <70 (LLD 7252) + email at <60 (LLD 8402):
     seed 67 → in-app fires, no email; 55 → both; 75 → neither. (P1b + the dual-threshold.)
   - hallucination alert fires on a real incident, gated on emailOnHallucination (not emailOnDrift).
8. **entity-alter.migration.test.ts** — the ALTER adds the nullable cols; entity_score + scored_at are NOT added;
   backfill populates organization_id; re-running is a no-op. [REWRITTEN → information_schema (real DB, not readFileSync)
   — confirm it queries the schema + asserts the D-01 negatives + backfill + idempotency.]
9. **trust-rls.test.ts** — cross-org reads blocked on all 6 new tables. [EXISTS as trust-rls.integration.test.ts (30,
   rls_test_role + setRlsContext, re-break both ways) — confirm.]

## PLUS one guard the manual pass earned (not in §11 — it predates the bug):
- **card-badge regression guard** (add to the relevant frontend/component test, or a small trust-card-badge.test.ts):
  for each score card (linkedin/youtube/consensus/entity) **seed/pass a score of 0 → assert the badge = "Low", NOT
  "High"**; high score → "High". Asserts the badge derives from the SCORE, not confidence_label. **Re-break: point the
  badge back at confidence_label → the 0-score test MUST fail (shows High).** This is the guard for the systemic
  contamination (bug 7 — 0/100 showed "High" across 4 cards) that all tests missed.

## §12 VERIFICATION GREPS — in a re-runnable script (like S4's scripts/qa/sprint4-invariants.sh)
Put the §12 greps in scripts/qa/sprint5-invariants.sh (re-runnable):
```bash
grep -Rc "ExplainabilityService\|annotate(" app/api/brands/[id]/trust/route.ts        # → ≥1
grep -Rc "ExplainabilityService\|annotate(" app/api/brands/[id]/entity-score/route.ts # → ≥1
grep -c "CREATE TABLE IF NOT EXISTS" db/migrations/*sprint5_trust.sql                 # → 6
grep -c "DROP POLICY IF EXISTS" db/migrations/*sprint5_trust.sql                      # → 6
grep -c "ADD COLUMN IF NOT EXISTS" db/migrations/*sprint5_entity_alter.sql            # → ≥18
grep -ciE "add column[^;]*entity_score|add column[^;]*scored_at" db/migrations/*sprint5_entity_alter.sql  # → 0
grep -iE "^\s*risk[_a-zA-Z]*\s*:" db/schema/hallucination-incidents.ts || echo "no risk col OK"   # → "no risk col OK"
# + the §13 anti-pattern guards: two partial unique indexes on citation_source_intelligence; consensus cron ON CONFLICT
#   (not plain INSERT); hallucination.citation_id + evidence.audit_id ON DELETE SET NULL.
# + the bug-8 class guard: repo-wide `--accent-primary-foreground` (the undefined typo) → 0 (all fixed to -fg).
grep -Rc "accent-primary-foreground" app/ components/                                  # → 0
```
Report the script runs green + re-runnable.

## STEP FINAL — run + report
```bash
<repo test cmd> run   # full suite
```
- The §11 list: which existed vs which you built (mainly s4-wiring). Total S5 test count in tests/phase2/sprint5/.
- Re-break proofs fire: s4-wiring (unwire section → fail), dual-threshold consensus (wrong threshold → fail),
  knowledge_panel §240 (present+accurate renders → fail), card-badge (badge reads confidence_label → 0-score shows High
  → fail), and the existing scorers (break formula → fail).
- §12 grep script green + re-runnable; the `-foreground` grep returns 0.
- Full suite green; report total (was 1962).

## Constraints
- Same structure as S2/S3/S4: the §11 named test files + §12 greps. NOT a re-invented framework.
- Real-behavioral only; every test FAILS when its target breaks (re-break proof). NO source-greps, NO typeof-smoke.
- s4-wiring.integration.test.ts is the main gap — the sprint's core deliverable; build it real (seed→render/alert,
  re-break), incl. the §240 condition + the default-path (Bug A) + dual-threshold (P1b) guards.
- The card-badge guard is mandatory — seed 0, assert Low not High, must fail if badge reads confidence_label.
- Assert §13 behaviors: acknowledging ≠ closing (risk unchanged); false-positive DOES lower risk; dual consensus
  thresholds distinct; no risk column; two partial unique indexes; consensus UPSERT.
- LLM_MODE=mock. Dev DB `visibleau`, never prod. LLD v8.70 / §11 / §12 / §13 win.

## NOTE
Same as S2/S3/S4: implement the §11 named test files + §12 greps — NOT a re-invented structure. Most §11 tests already
exist from this session (audit + cleanup) — confirm them real + re-break, don't duplicate. The MAIN gap is
s4-wiring.integration.test.ts (the sprint's whole point: seed an S5 row → the S4 section renders + the alerts fire at
their thresholds, incl. §240 knowledge_panel condition, the default-path Bug-A guard, and the dual consensus <70 in-app /
<60 email). Add the card-badge regression guard (seed 0 → badge Low not High, fails if it reads confidence_label — the
guard for the systemic bug 7). Put §12 greps in a re-runnable script + a `-foreground`/`-fg` typo grep. Every guard
re-break-proven.
