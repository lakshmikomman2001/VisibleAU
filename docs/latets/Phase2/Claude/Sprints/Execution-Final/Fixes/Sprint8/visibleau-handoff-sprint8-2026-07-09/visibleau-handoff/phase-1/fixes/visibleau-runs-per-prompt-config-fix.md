# VisibleAU Fix — Make runs-per-prompt env-configurable + set Free default = 5 + reconcile copy
**Claude Code prompt — paste into a Claude Code session on the VisibleAU repo.**

---

## Context + decision (already made by the operator — implement exactly this)

Investigation found `TIER_RUNS_PER_PROMPT` in `lib/llm/tier-engines.ts` with
`{ free: 1, starter: 3, growth: 5, agency: 5, agency_pro: 5, enterprise: 5 }`, read by
`runsForTier()`, consumed by the audit loop in `lib/audit/run-audit-inline.ts` and
`inngest/functions/run-audit.ts`. The Free-tier value `1` was INTENTIONAL (not a regression), but
the operator has decided:

1. **Make runs-per-prompt env-configurable** (override the constant via env), with the constant as a
   **typed fallback**, and a **hard clamp** so a bad value can't blow the LLM cost budget.
2. **Set the Free-tier DEFAULT to 5** (all tiers now consistent: free/starter→... see table below).
   Actually: set Free's default to **5** to match paid. Keep the others as-is unless the table says
   otherwise.
3. **Reconcile the conflicting copy/canon** so the three Free-tier numbers (Sprint 3 = 100 calls;
   prototype = 40; build = 20) collapse to ONE truth derived from config — not hardcoded literals.

**This is a COST-SENSITIVE change.** Runs-per-prompt multiplies real LLM spend linearly (Free at 5
runs ≈ 5× the calls of 1 run → ~100 calls/audit, ~US$1.50 per Sprint 3 budget). The clamp + a
budget sanity note are mandatory, not optional.

**Canonical numbers (Sprint 3 — the build authority; the prototype's 40/A$0.30–0.50 is STALE and is
being retired):**
- Free (now 5 runs): 2 engines × 10 prompts × 5 runs = **100 calls**, budget **~US$1.50 (~A$2.25)**.
- Paid: 4 engines × 10 prompts × 5 runs = **200 calls**, budget **<US$3 (~A$4.50)**.
- FX for display: `FX_AUD_USD` env (default 0.66).

---

## STEP 0 — Investigate (report, then proceed)

```bash
sed -n '1,60p' lib/llm/tier-engines.ts                       # TIER_RUNS_PER_PROMPT + runsForTier()
grep -rnE "runsForTier|TIER_RUNS_PER_PROMPT|runsPerPrompt" lib inngest app components
sed -n '1,40p' lib/audit/run-audit-inline.ts | grep -nE "runsForTier|runsPerPrompt" 
grep -nE "FX_AUD_USD|first audit cost|A\$0.3|A\$2.5|engines.*prompts.*runs|LLM calls" app components | head -30
grep -nE "promptsCount \?\? 5|runsPerPrompt \?\? 5|\?\? 5|\?\? 10" components app
```
Report: the current `TIER_RUNS_PER_PROMPT` map, every consumer of `runsForTier()`, the exact
confirm-screen + running-screen copy strings, and any `?? 5` / `?? 10` display fallbacks.

---

## STEP 1 — Make `runsForTier()` env-driven with a typed fallback + hard clamp

Edit `lib/llm/tier-engines.ts`. Keep the constant map as the **fallback/default**, but allow a
per-tier env override, validate it, and clamp it.

```typescript
// Per-tier DEFAULT runs-per-prompt (fallback when no valid env override is present).
// Free is now 5 to match paid (operator decision) — all tiers consistent.
export const TIER_RUNS_PER_PROMPT: Record<Tier, number> = {
  free: 5,
  starter: 5,
  growth: 5,
  agency: 5,
  agency_pro: 5,
  enterprise: 5,
};
// ^ If the operator later wants tier differentiation again, change these defaults or set env overrides.

// Hard safety bounds — runs multiplies real LLM spend, so clamp aggressively.
const RUNS_MIN = 1;
const RUNS_MAX = 5;   // ceiling: do NOT allow more than 5 (cost protection). Raise deliberately only.

// Env override convention: TIER_RUNS_FREE, TIER_RUNS_STARTER, TIER_RUNS_GROWTH,
// TIER_RUNS_AGENCY, TIER_RUNS_AGENCY_PRO, TIER_RUNS_ENTERPRISE  (integers).
function envRunsFor(tier: Tier): number | null {
  const key = `TIER_RUNS_${tier.toUpperCase()}`;          // e.g. TIER_RUNS_FREE
  const raw = process.env[key];
  if (raw == null || raw.trim() === '') return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    console.warn(`[runsForTier] ${key}="${raw}" is not an integer — ignoring, using default.`);
    return null;
  }
  return n;
}

export function runsForTier(tier: string | null | undefined): number {
  const key = (tier ?? 'free') as Tier;
  const fromEnv = envRunsFor(key);
  const chosen = fromEnv ?? TIER_RUNS_PER_PROMPT[key] ?? RUNS_MIN;
  const clamped = Math.min(RUNS_MAX, Math.max(RUNS_MIN, chosen));
  if (clamped !== chosen) {
    console.warn(`[runsForTier] ${key} runs=${chosen} clamped to ${clamped} (bounds ${RUNS_MIN}-${RUNS_MAX}).`);
  }
  return clamped;
}
```
Constraints: integer only; out-of-range → clamped (logged), never throws; unknown tier → 'free'
default. Do NOT raise `RUNS_MAX` above 5 in this change.

---

## STEP 2 — Document the env knobs

In `.env.dev` (and `.env.example` / `.env.local` if the repo uses them), add a documented block.
Leave them BLANK so the typed defaults apply unless the operator opts in:
```
# Runs-per-prompt per tier (optional overrides). Integers 1–5; out-of-range is clamped.
# Multiplies real LLM cost linearly — Free at 5 runs ≈ 100 calls/audit (~US$1.50). Leave blank to use defaults.
TIER_RUNS_FREE=
TIER_RUNS_STARTER=
TIER_RUNS_GROWTH=
TIER_RUNS_AGENCY=
TIER_RUNS_AGENCY_PRO=
TIER_RUNS_ENTERPRISE=
```

---

## STEP 3 — Make the user-facing copy DERIVE from config (no hardcoded call counts)

The confirm + running screens currently hardcode "1 run / 20 calls" and a stale "~A$0.30–0.50"
cost. Replace hardcoded literals with values derived from `runsForTier()` + `enginesForTier()` +
prompt count, so the copy can never drift from what actually runs.

1. **Running screen** (`audit-running.tsx` ~line 206) currently:
   `"Querying 2 engines × 10 prompts × 1 run = 20 LLM calls."`
   → compute from the audit's real tier:
   ```
   const engines = enginesForTier(tier).length;
   const runs = runsForTier(tier);
   const prompts = audit.promptsCount ?? PROMPTS_PER_AUDIT;   // use the real prompt count, not a literal
   const calls = engines * prompts * runs;
   // → "Querying {engines} engines × {prompts} prompts × {runs} run(s) = {calls} LLM calls."
   ```
   Pluralise "run/runs". Update the time estimate band proportionally (Free 100 calls ≈ a few min).

2. **Wizard Step 4 confirm** (`wizard/page.tsx` ~line 594) cost line currently:
   `"Free tier: ~A$0.30–0.50 · Paid: ~A$2.50–3"` — STALE. Replace with the Sprint 3 budget figures.
   Prefer deriving from a single cost helper if one exists (`lib/audit/compute-cost.ts` /
   `lib/pricing/*`); if not, use these reconciled constants and add a `// Sprint 3 canonical` comment:
   - Free: **~US$1.50 (~A$2.25)**  · Paid: **<US$3 (~A$4.50)**
   Convert USD→AUD via `FX_AUD_USD` (default 0.66) rather than hardcoding the AUD literal, so the two
   stay consistent. Show whichever currency the rest of the pricing UI shows (the GST/AUD pattern).
   Also surface the **call-count breakdown** on Step 4 (it's currently absent) using the same derived
   `{engines} × {prompts} × {runs} = {calls}` expression, so the confirm screen tells the truth.

3. **Results header** (`audit-results-rich.tsx` ~line 50) — the `?? 5` / `?? 10` fallbacks:
   `{engines} engines · {promptsCount ?? 10} prompts × {runsPerPrompt ?? 5} runs`
   Harden: the audit row ALWAYS stores `runs_per_prompt` and `prompts_count`, so prefer the stored
   values and make the fallback match the **actual** computed default (don't display "5" when the row
   says otherwise). Safest: render only from the stored DB columns; if truly null, fall back to
   `runsForTier(tier)` / `PROMPTS_PER_AUDIT`, not a bare literal `5`/`10`.

> Wherever "PROMPTS_PER_AUDIT" appears above: use the repo's real prompt-count source (the
> investigation showed `getAuditPrompts(b, 10)` — i.e. 10). If there's a named constant, use it; if
> it's a magic `10`, introduce `const PROMPTS_PER_AUDIT = 10;` in the audit lib and reference it, so
> prompt count is also single-sourced. Do NOT change the value (stay 10 — Sprint 3 canonical, not the
> prototype's 20).

---

## STEP 4 — Reconcile canon (so 100/40/20 stops recurring)

Create a short canon note file `docs/canon/runs-per-prompt-RECONCILED.md` (create the dir if needed)
recording the single truth, so the reviewer chat can fold it back into Sprint 3 + the prototype:
```markdown
# CANON RECONCILIATION — runs-per-prompt & Free-tier audit shape (decided <today>)

Single source of truth: `lib/llm/tier-engines.ts` → `runsForTier()` (env-overridable, clamped 1–5).
Prompt count single source: `PROMPTS_PER_AUDIT = 10` (Sprint 3 canonical; NOT the prototype's 20).

Free-tier audit (default): 2 engines × 10 prompts × 5 runs = 100 calls, ~US$1.50 (~A$2.25).
Paid-tier audit:           4 engines × 10 prompts × 5 runs = 200 calls, <US$3 (~A$4.50).

Conflicts retired:
- Sprint 3 prompt: said 100 calls — CORRECT, now authoritative.
- Prototype (lines ~2133/2136/2139, 4175): "40 calls / 2×20×1 / ~A$0.30–0.50" — STALE. Prototype
  must be updated to 100 calls / 2×10×5 / ~US$1.50, and the "1 run" wizard comment removed.
- Earlier build: "20 calls / 2×10×1" — superseded by this fix.

TODO for reviewer chat: update sri-visibleau-sprint-3-prompt.md (confirm 100 explicit everywhere) and
visibleau-prototype.jsx Step 4 copy to match; remove the W4 "20 prompts × 1 run = 40 calls" comment.
```
This file is documentation only — it does not change app behaviour, but it gives the operator a
single artifact to reconcile the source docs from.

---

## Constraints
- **Cost safety:** clamp 1–5; never throw on bad env; never let runs exceed 5 in this change. Keep
  the existing per-audit budget warning (Sprint 3: warn if `totalCostUsd` > $3 paid / > $1.50 Free)
  intact — if it references a hardcoded run count, update it to use `runsForTier()`.
- **Single source of truth:** all user-facing call counts + costs DERIVE from `runsForTier()` +
  `enginesForTier()` + `PROMPTS_PER_AUDIT`. No new hardcoded "20"/"40"/"100"/"1 run" literals.
- **Don't touch the audit loops' logic** beyond what already reads `runsForTier()` — they're correct;
  they'll pick up 5 automatically once the default changes.
- **No schema change.** `audits.runs_per_prompt` / `prompts_count` already store the real values.
- TypeScript strict, no `any`. Mock-mode safe.

---

## Verification (run + report)
1. `pnpm typecheck` + `pnpm lint` clean.
2. Unit test `runsForTier()`:
   - no env → free returns **5**; all tiers return 5 (current defaults).
   - `TIER_RUNS_FREE=3` → free returns 3.
   - `TIER_RUNS_FREE=99` → clamped to **5** (with a warn).
   - `TIER_RUNS_FREE=0` / `TIER_RUNS_FREE=abc` → clamped/ignored to **1**/default (with a warn).
   Add as `lib/llm/__tests__/runs-for-tier.test.ts`. Report pass.
3. Copy derivation — grep shows no stale literals remain:
   ```bash
   grep -rnE "1 run = 20|20 LLM calls|A\$0\.30|A\$0\.50|2 engines × 20 prompts" app components   # → no matches
   ```
4. Manual (dev, mock mode, a Free-tier org):
   - Run a NEW first audit via the wizard. The running screen now says
     **"2 engines × 10 prompts × 5 runs = 100 LLM calls."**
   - After completion, the audit row shows `runs_per_prompt=5`, `total_calls=100`; the results header
     reads "2 engines · 10 prompts × 5 runs"; the citation/response row count = 100.
   - Step 4 confirm cost shows the Sprint 3 figure (~US$1.50 / ~A$2.25), NOT ~A$0.30–0.50, and shows
     the 100-call breakdown.
   - Set `TIER_RUNS_FREE=1`, restart, run another audit → 20 calls again (proves the env knob works);
     set it back to blank → 100. Report both.
5. Confirm the canon-reconciliation doc exists at `docs/canon/runs-per-prompt-RECONCILED.md`.

Report: STEP 0 findings, files changed, the unit-test results, and the two manual runs (100 calls
default; 20 calls with `TIER_RUNS_FREE=1`) — proving the value is genuinely config-driven and the
copy now matches what runs.
