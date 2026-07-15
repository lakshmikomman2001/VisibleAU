# VisibleAU — Set Free-tier runs-per-prompt to 3 (env var only)
**Claude Code prompt — paste into a Claude Code session on the VisibleAU repo.**
**This is a CONFIG change, not a code change. Do NOT modify `lib/llm/tier-engines.ts` or any audit
logic — the env-override mechanism already exists. Only set env vars + verify.**

---

## Decision (implement exactly this)
Free-tier audits should run **3 runs per prompt** (not the code default of 5), because Free is an
acquisition tier with no revenue — 3 gives a defensible confidence interval at ~40% less LLM cost
than 5. Paid tiers stay at 5 (untouched). The env-configurable `runsForTier()` (clamped 1–5) already
supports this via `TIER_RUNS_FREE`.

Result after this change: Free audit = 2 engines × 10 prompts × **3 runs** = **60 calls** (~US$0.90),
down from 100 calls (~US$1.50) at the default of 5.

---

## STEP 0 — Confirm the mechanism is in place (read-only)
```bash
grep -nE "TIER_RUNS_FREE|envRunsFor|runsForTier|RUNS_MIN|RUNS_MAX" lib/llm/tier-engines.ts
grep -nE "TIER_RUNS_FREE" .env.dev .env.example .env.local 2>/dev/null
```
Confirm: `runsForTier()` reads `TIER_RUNS_FREE` and clamps to 1–5, and `.env.dev` has a (currently
blank/commented) `TIER_RUNS_FREE` stub. If the mechanism is NOT present, STOP and report — do not
add it here (that was a separate fix). Proceed only if it's present.

## STEP 1 — Set the dev env var
In `.env.dev`, set (uncomment if it's a commented stub):
```
TIER_RUNS_FREE=3
```
Leave `TIER_RUNS_STARTER`, `TIER_RUNS_GROWTH`, `TIER_RUNS_AGENCY`, `TIER_RUNS_AGENCY_PRO`,
`TIER_RUNS_ENTERPRISE` blank/unset — they keep the code default of 5. Do not touch them.

If `.env.example` exists, update its `TIER_RUNS_FREE=` line to a comment documenting the prod intent,
e.g.:
```
# TIER_RUNS_FREE=3   # Free tier runs 3/prompt in production (acquisition cost control). Paid tiers default 5.
```

## STEP 2 — Production reminder (do NOT attempt to set prod yourself)
Print a clear reminder for the operator (you cannot access prod env): **"Set `TIER_RUNS_FREE=3` in
the production environment (e.g. Vercel → Settings → Environment Variables) and redeploy — the
`.env.dev` change only affects local dev. Real LLM cost only applies in prod (`LLM_MODE=real`)."**
Do not edit any prod config or secrets.

## STEP 3 — (Optional, only if a matching test is missing) add ONE assertion
Check the existing test:
```bash
grep -nE "TIER_RUNS_FREE|toBe\(3\)|=== 3|, 3\)" tests/unit/llm/runs-for-tier.test.ts
```
If there is NO case asserting a mid-range value resolves correctly, add exactly one:
`process.env.TIER_RUNS_FREE='3'` → `runsForTier('free')` returns **3** (not clamped). Do not refactor
the file. If such a case already exists, skip — change nothing.

---

## Constraints
- No changes to `tier-engines.ts`, audit loops, cost helpers, or UI copy (copy already derives from
  `runsForTier()`).
- Only `.env.dev` (+ `.env.example` comment, + at most one test assertion).
- Do not set or read production env / secrets.

## Verification (run + report)
1. `pnpm typecheck` clean; the runs-for-tier test passes (incl. the `=3` case).
2. Restart the dev server so `.env.dev` is reloaded.
3. Mock-mode manual run (a Free-tier org): start a NEW first audit via the wizard.
   - Running screen should read **"2 engines × 10 prompts × 3 runs = 60 LLM calls."**
   - After completion:
     ```sql
     SELECT runs_per_prompt, total_calls, engine_count, prompts_count
     FROM audits ORDER BY created_at DESC LIMIT 1;
     -- expect runs_per_prompt=3, total_calls=60
     ```
   - Citation/response row count for that audit = **60**.
4. Sanity: temporarily set `TIER_RUNS_FREE=7`, restart, and confirm `runsForTier('free')` clamps to
   **5** (proves the ceiling still protects cost); then set it back to **3**. Report both.

Report: STEP 0 confirmation, the env change, whether a test assertion was added or already present,
and the manual-run result (60 calls) + the clamp sanity check. Remind the operator about setting prod.
