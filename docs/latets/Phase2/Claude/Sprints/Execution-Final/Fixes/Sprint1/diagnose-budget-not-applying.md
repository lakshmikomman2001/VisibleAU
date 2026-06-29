# Claude Code — DIAGNOSE: budget fix not taking effect (retry still "Budget exceeded" after restart)

The budget fix was applied (baseCostPerCall 0.25→0.015, policy row inserted, 21 tests pass) and the server was
restarted — but a fresh **Retry audit** on Sydney Plumbing Solutions STILL fails with `Budget exceeded`. So the
fix is NOT taking effect at runtime. **Find the actual reason by instrumenting the real path — do not assume.**
Log the real numbers, identify the gap, then report before changing anything.

> The audit that fails: id `cdcbe200-e7cf-429a-94a2-d835eb4a12dd`, brand "Sydney Plumbing Solutions"
> (ABN 81121903919), org `31a7c684-35b1-4340-a24d-4f8898f252a5`, growth tier (4 engines).

---

## STEP 1 — Read the ACTUAL value the running estimate uses (not the test)
```bash
# Confirm baseCostPerCall really persisted as 0.015 in the file the app runs:
grep -rn "baseCostPerCall" lib/ --include=*.ts
# Is it a literal, or read from env / config / DB? If it's read from somewhere, trace WHERE:
grep -rn "baseCostPerCall\s*=\|baseCostPerCall:" lib/ --include=*.ts
grep -rniE "BASE_COST|COST_PER_CALL|baseCost" .env* lib/ --include=*.ts
```
**Report:** is `baseCostPerCall` a hardcoded 0.015 now, or sourced from an env var / config that might still hold 0.25?

## STEP 2 — Read the ACTUAL policy row the app queries (against the REAL DB the app uses)
The estimate is compared to `market_ai_budget_policies.max_estimated_cost_cents`. Confirm the row the app reads
has 550 — **using the same DATABASE_URL the running app uses** (not a different/dev DB):
```bash
# What connection string does the running app actually use? (confirm which DB)
grep -rn "DATABASE_URL\|DIRECT_URL" .env* | grep -v "^#"
```
```sql
-- Run against THAT database. Show ALL budget policy rows (not just the one we expect):
SELECT market_code, segment, use_case, max_estimated_cost_cents, hard_stop_on_budget
FROM market_ai_budget_policies
ORDER BY market_code, segment, use_case;
```
**Report:** does a row `AU_EN / smb / brand_audit` exist with `max_estimated_cost_cents = 550` in the DB the
APP reads? Or is it empty / 500 / missing / in a different DB? **This is the #1 suspect — the row may have
been inserted into a different DB than the app queries.**

## STEP 3 — Find which policy KEY the audit actually resolves to (the lookup, not the row)
The audit looks up a policy by some (market_code, segment, use_case). Confirm those values MATCH the row.
```bash
# Where does budget-policy.service.ts build the lookup key?
grep -rn "market_code\|marketCode\|segment\|use_case\|useCase\|brand_audit\|AU_EN" lib/**/budget-policy.service.ts lib/ --include=*.ts | head -20
```
**Report:** what (market_code, segment, use_case) does a GROWTH-tier BRAND audit actually resolve to at runtime?
If the audit asks for e.g. `AU_EN / agency / brand_audit` or a different market but the row is `AU_EN / smb /
brand_audit`, the lookup MISSES → falls back to the old default. (The brand is in an **Agency-tier ORG** —
"VisibleAU Dev, Agency · AU" — but seeded with a **growth subscription**. Check whether segment derives from
org tier (agency) vs subscription tier (growth) — they differ here, which could cause a key mismatch.)

## STEP 4 — Instrument the real estimate vs ceiling (the definitive proof)
Add temporary logging in the budget enforcement path (`budget-policy.service.ts` estimate()/enforce(), and
`run-audit-inline.ts:109` where it throws). Log, right before the throw:
```
[BUDGET DEBUG] estimate_cents=<X> ceiling_cents=<Y> policy_key=<market/segment/use_case> policy_found=<bool> baseCostPerCall=<Z>
```
Then **Retry the audit once** and capture that log line. This shows the EXACT numbers the runtime compares —
no guessing. (Real LLM calls only fire AFTER the budget check passes, so this retry costs nothing — it fails at
the gate before spending.)

**Interpret:**
- `baseCostPerCall=0.25` in the log → the fix didn't persist / runtime reads old value (Step 1 source issue).
- `policy_found=false` or `ceiling_cents=500` → the lookup misses the 550 row (Step 2/3 — wrong DB or wrong key).
- `estimate_cents≈462, ceiling_cents=550` but still throws → the comparison logic is inverted/bugged.
- `estimate_cents` huge (≈7692) → still using 0.25 somewhere despite the file showing 0.015.

## REPORT (before any fix)
1. Step 1: baseCostPerCall actual value + whether it's hardcoded or sourced.
2. Step 2: the policy rows in the DB the app reads + which DATABASE_URL that is.
3. Step 3: the policy key a growth/agency brand audit resolves to + whether it matches the row.
4. Step 4: the `[BUDGET DEBUG]` log line from a real retry.
Then state the ONE root cause the evidence points to. Propose the minimal fix, but do not apply it until the
evidence is clear. Remove the debug logging after.

> Strong hypotheses, in order: (a) the 550 row was inserted into a DIFFERENT DB than the app reads; (b) the
> policy KEY mismatches because segment derives from org tier (agency) not subscription tier (growth); (c)
> baseCostPerCall reads from a config/env that still holds 0.25. Step 4's log line will distinguish them.
