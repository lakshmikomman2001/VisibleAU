# Claude Code — DIAGNOSE (report-first, NO fixes): does `fix-audit-zero-engines` still reproduce?

A Phase 1 bug was reported (mid-June): an audit on an **Agency-tier** brand showed "0 engines × 10 prompts × 5
runs = 0 LLM calls" and stuck at 0% — the audit ran with an EMPTY engine list. The hypothesis then (never
confirmed) was a tier→engine resolution failure in `lib/llm/tier-engines.ts`: `TIER_ENGINES[tier]` returning
`undefined`/`[]`, likely a **casing mismatch** (DB stores `'agency'` lowercase vs map keyed `'Agency'`) or the
tier arriving `undefined` with a mis-keyed fallback yielding `[]`. It was marked open and never fixed.

**BUT there is now CONTRADICTING evidence from this session.** The bulk re-audit ran two Agency-tier brands and
BOTH resolved engines correctly:
- Bondi #132: `engine_count = 4`, `engines = {chatgpt,claude,gemini,perplexity}`
- Marrickville #133: `engine_count = 4`, `engines = {chatgpt,claude,gemini,perplexity}`

So on the path exercised this session (`runAuditInline`, used by re-audit/bulk/schedules), Agency tier→engine
resolution WORKS. This contradicts the "0 engines on Agency" report. **Three possibilities — DIAGNOSE which is
true. Do NOT fix anything until the verdict is known:**
1. **Already fixed** — something since mid-June (or the audit-row-creation rework) corrected it; the bug no longer
   reproduces and the "open" status is stale.
2. **Path-specific** — the bug is on a DIFFERENT audit entry path than `runAuditInline`. Most likely candidate:
   the original manual-audit path `POST /api/audits` → `run-audit.ts` resolves the tier differently (or didn't
   pre-create the engine list the way `runAuditInline` does), while `runAuditInline` resolves correctly.
3. **Brand/data-specific** — the original failing brand had state (tier stored differently, a null) that
   Bondi/Marrickville don't.

This is the third diagnose-first investigation this session (the audit/start and Marrickville ones both paid off
by confirming reality before acting). The prior diagnosis was a HYPOTHESIS contradicted by current data — writing
a "fix the casing" prompt now risks "fixing" code that already works or breaking a working path. Confirm first.

> **DIAGNOSE ONLY. Report the verdict + evidence. Change NO source.**

---

## STEP 1 — Inspect `tier-engines.ts`: is there actually a casing/fallback problem?
```bash
cat lib/llm/tier-engines.ts
grep -nE "TIER_ENGINES|enginesForTier|getEnginesForTier|'agency'|'Agency'|'free'|'Free'|'starter'|'growth'|tier\]|\?\?|fallback|default" lib/llm/tier-engines.ts
```
Report:
- What KEYS does `TIER_ENGINES` (or the resolver) use — lowercase (`'agency'`), title-case (`'Agency'`), or an
  enum? List them.
- Is access a bare `TIER_ENGINES[tier]` (would return `undefined` on a key miss) or a function with a fallback?
- If there's a fallback, does it yield the Free 2-engine default `['chatgpt','perplexity']`, or could it yield
  `[]`? (The prior hypothesis was the fallback itself being mis-keyed to empty.)

## STEP 2 — What casing does the tier column actually STORE?
```bash
psql "$DATABASE_URL" -c "SELECT DISTINCT tier FROM subscriptions;"
psql "$DATABASE_URL" -c "SELECT DISTINCT tier FROM organizations;"
```
Report the actual stored values (`'agency'` vs `'Agency'` vs `'AGENCY'`). Compare to STEP 1's keys — is there a
casing mismatch between what's stored and what the map expects? (If stored `'agency'` and map keyed `'Agency'`,
that's the hypothesized bug. If they match, the casing theory is dead.)

## STEP 3 — Trace BOTH audit entry paths' tier→engine resolution
The two paths may resolve engines differently. Compare:
```bash
# Path A — the original manual-audit path (where the bug was reported)
grep -nE "TIER_ENGINES|enginesForTier|tier|engines|engineCount|engine_count" app/api/audits/route.ts inngest/functions/run-audit*.ts | head -40
# Path B — runAuditInline (confirmed working this session via bulk/reaudit)
grep -nE "TIER_ENGINES|enginesForTier|tier|engines|engineCount|engine_count|runAuditInline" lib/audit/run-audit-inline.ts lib/audit/*.ts | head -40
```
Report for EACH path:
- Where does it read the tier from (`subscriptions.tier`? `organizations.tier`? a param?) and how does it resolve
  engines (bare `TIER_ENGINES[tier]` vs a resolver function with fallback)?
- Do the two paths use the SAME resolution code, or different? If different, that's the likely "path-specific"
  explanation — Path A (POST /api/audits) may have the bug while Path B (runAuditInline) doesn't.

## STEP 4 — Survey recent audits for any zero-engine rows (does it reproduce in the wild?)
```bash
psql "$DATABASE_URL" -c "SELECT id, brand_id, status, triggered_by, engine_count, engines, created_at FROM audits ORDER BY created_at DESC LIMIT 20;"
psql "$DATABASE_URL" -c "SELECT triggered_by, COUNT(*) FILTER (WHERE engine_count = 0 OR engines = '{}' OR engines IS NULL) AS zero_engine, COUNT(*) AS total FROM audits GROUP BY triggered_by;"
```
Report: are there ANY recent audits with `engine_count = 0` / empty `engines`? If so, what `triggered_by` /
brand / tier? This shows whether the bug reproduces currently and on which path (`triggered_by` distinguishes
manual vs reaudit vs bulk vs schedule). If ZERO zero-engine rows exist across all paths → strong signal the bug is
already fixed.

## STEP 5 (if STEP 4 shows zero-engine rows OR Path A differs from Path B) — reproduce on Path A
ONLY if evidence suggests the manual path still mis-resolves: trigger a fresh manual audit via `POST /api/audits`
on an Agency-tier brand (Bondi) and check the created row's `engine_count`/`engines`.
```bash
# after triggering a manual audit on Bondi:
psql "$DATABASE_URL" -c "SELECT id, triggered_by, engine_count, engines, status FROM audits WHERE brand_id='8f59b2a2-6aa0-4318-9848-b33ed520ca36' AND triggered_by='manual' ORDER BY created_at DESC LIMIT 1;"
```
Report: does a MANUAL audit on an Agency brand get 4 engines (like bulk did) or 0 (the bug)?

## VERDICT (report one clearly, with evidence)
- **(A) ALREADY FIXED** — `tier-engines.ts` keys match the stored tier casing, both paths resolve correctly, NO
  zero-engine rows in recent audits, and (if tested) a manual audit gets 4 engines. → The open bug is stale; mark
  resolved, no fix needed. Report what likely fixed it.
- **(B) PATH-SPECIFIC, STILL BROKEN** — Path A (`POST /api/audits`/`run-audit.ts`) mis-resolves (casing miss /
  bare index / wrong tier source) while Path B (`runAuditInline`) works. Zero-engine rows appear with
  `triggered_by='manual'` (or whichever path). → Real bug, scoped to a path. Report the exact defect (casing,
  fallback-to-empty, wrong tier column) + the corrected approach for Sri's review (do NOT apply).
- **(C) STILL BROKEN, GENERAL** — both paths mis-resolve, or a casing mismatch exists app-wide and bulk only
  worked by coincidence. → Report the root cause + fix direction for Sri (do NOT apply).
- **(D) DATA-SPECIFIC** — resolution is fine; the original failure needed brand state that current brands don't
  have. Report what state would trigger it.

## REPORT
- STEP 1: `TIER_ENGINES` keys + casing + whether the fallback can yield `[]`.
- STEP 2: actual stored tier values (subscriptions + organizations) vs the map keys — casing match or mismatch?
- STEP 3: how EACH audit path resolves engines (same code or different; tier source each).
- STEP 4: any zero-engine audit rows currently, and on which `triggered_by` path; the zero-engine-by-path counts.
- STEP 5 (if run): manual-audit-on-Agency engine_count result.
- **The verdict (A/B/C/D)** with the evidence that decides it.
- Confirm: no source changed (diagnosis only).

## NOTE
The prior session's fix hypothesis (`fix-audit-zero-engines.md`) targeted `tier-engines.ts` casing + the Free
fallback + the Sprint 3 §6.6 three-table load. If the verdict is (B) or (C), that hypothesis may be the right fix
— but re-validate it against the ACTUAL current code (the casing may already be correct, given bulk got 4
engines). Do NOT apply the old hypothesis blindly; this task confirms whether and where the bug is real first.
