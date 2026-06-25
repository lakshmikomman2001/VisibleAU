# VisibleAU Fix — Wizard Step 4 confirm-screen copy must DERIVE from config (not hardcoded)
**Claude Code prompt — paste into a Claude Code session on the VisibleAU repo.**
Scope: the brand wizard Step 4 ("Confirm & run first audit") in `app/(auth)/brands/wizard/page.tsx`.
Frontend copy only — no schema, no API, no audit logic, no `tier-engines.ts` changes.

---

## The bug (verified on a real audit)
Step 4's info callout shows a HARDCODED call count: **"Free: 2 engines × 10 prompts × 5 runs = 100
calls (~1–2 min)"** and a hardcoded cost line. But with `TIER_RUNS_FREE=3` set, a real Free-tier
first audit just ran **2 × 10 × 3 = 60 calls** (confirmed: audit header showed "60 LLM calls",
US$0.29). So the screen tells the user "100 calls" right before an audit that actually runs 60.

On a trust product, the pre-commit confirm screen must state what will ACTUALLY happen. The earlier
runs-per-prompt fix made the running screen + cost line derive from `runsForTier()`, but this Step 4
callout (and possibly the cost line on this screen) was missed — it still has literal numbers.

The fix: make the Step 4 callout + cost line DERIVE from the same config helpers the audit engine
uses, so the displayed numbers always match the real run for the current tier.

**Config single-sources (already exist in `lib/llm/tier-engines.ts` — reuse, do not duplicate):**
- `enginesForTier(tier)` → engine list (Free = 2, paid = 4)
- `runsForTier(tier)` → runs per prompt (env-configurable, clamped 1–5; Free currently 3 via `TIER_RUNS_FREE`)
- `PROMPTS_PER_AUDIT` → 10
- Cost: reuse the repo's existing cost helper if one exists (`lib/audit/compute-cost.ts` /
  `lib/pricing/*`) + `FX_AUD_USD` for AUD. If none exists, keep the cost line as a coarse range but
  make the CALL COUNT derived (the call count is the part that's provably wrong; cost is an estimate).

---

## STEP 0 — Investigate (report, then proceed)
```bash
grep -nE "5 runs|100 calls|200 calls|2 engines|4 engines|10 prompts|first audit cost|A\$0\.50|A\$2|inc\. GST|runsForTier|enginesForTier|PROMPTS_PER_AUDIT" app/\(auth\)/brands/wizard/page.tsx
grep -nE "enginesForTier|runsForTier|PROMPTS_PER_AUDIT|computeCost|estimateCost|FX_AUD" lib/llm/tier-engines.ts lib/audit lib/pricing 2>/dev/null
```
Report: the exact Step 4 callout string + cost line as currently written (quote them), whether the
wizard already imports `enginesForTier`/`runsForTier`/`PROMPTS_PER_AUDIT`, the current user's tier
source in this component, and whether a cost helper exists. Confirm this is the file that renders the
confirm screen the user saw.

---

## STEP 1 — Derive the call-count callout from config
Replace the hardcoded callout with values computed for BOTH tiers (the callout shows paid + free), so
whatever `TIER_RUNS_FREE` / `enginesForTier` are set to, the text matches. Use the helpers:

```tsx
import { enginesForTier, runsForTier, PROMPTS_PER_AUDIT } from '@/lib/llm/tier-engines';

// Compute for display (both tiers shown in the callout):
const freeEngines = enginesForTier('free').length;        // 2
const freeRuns    = runsForTier('free');                  // 3 (or whatever env says)
const freeCalls   = freeEngines * PROMPTS_PER_AUDIT * freeRuns;   // 60

const paidEngines = enginesForTier('growth').length;      // 4 (any paid tier; engines are same across paid)
const paidRuns    = runsForTier('growth');                // 5
const paidCalls   = paidEngines * PROMPTS_PER_AUDIT * paidRuns;   // 200

// Pluralise "run/runs":
const runWord = (n: number) => `${n} run${n === 1 ? '' : 's'}`;
```
Then render the callout from these, e.g.:
> "Your first audit will run on your tier's engines. Paid: {paidEngines} engines × {PROMPTS_PER_AUDIT}
> prompts × {runWord(paidRuns)} = {paidCalls} calls. Free: {freeEngines} engines × {PROMPTS_PER_AUDIT}
> prompts × {runWord(freeRuns)} = {freeCalls} calls."
(Keep the time-estimate phrasing, but it can stay a coarse "~1–2 min / ~3–5 min" — the CALL COUNT is
the part that must be exact.)

> If the wizard knows the CURRENT user's tier, you may instead show ONLY that tier's line as the
> primary ("Your audit: 2 engines × 10 prompts × 3 runs = 60 calls") and keep the other tier as a
> secondary upgrade hint. Either approach is fine — the requirement is the numbers are DERIVED, not
> literal.

---

## STEP 2 — Cost line consistency (lighter touch)
The "First audit cost" row currently shows a literal range (e.g. "Free: ~A$0.50–0.80 · Paid: ~A$2–4
(inc. GST)"). Two acceptable outcomes:
- **Preferred (if a cost helper exists):** derive the figure from the real per-call cost ×
  `freeCalls` / `paidCalls`, converted via `FX_AUD_USD`, so it tracks the call count.
- **Acceptable (if no helper):** leave the cost as a coarse range BUT ensure it's not internally
  contradicted by the callout (e.g. don't show "100 calls" in one place and a 60-call cost in
  another). At minimum, the call count in the callout must be derived per STEP 1.
Do NOT invent a precise cost if there's no real cost source — a coarse honest range beats a fake
precise number (no-fabricated-data rule).

---

## Constraints
- Frontend copy only. No changes to `tier-engines.ts`, the audit engine, schema, or API.
- Reuse `enginesForTier` / `runsForTier` / `PROMPTS_PER_AUDIT` — never re-hardcode "5", "100", "200",
  "60", "2", "4" as literals in the callout.
- The numbers shown MUST equal what the audit engine will run for the given tier/config.
- TypeScript strict, no `any`. Keep existing styling/tokens.

---

## Verification (run + report)
1. `pnpm typecheck` + `pnpm lint` clean.
2. No stale literals remain in the callout:
   ```bash
   grep -nE "5 runs = 100|2 engines × 10 prompts × 5|= 100 calls|= 200 calls" app/\(auth\)/brands/wizard/page.tsx   # → no matches
   grep -nE "runsForTier|enginesForTier|PROMPTS_PER_AUDIT" app/\(auth\)/brands/wizard/page.tsx                      # → present
   ```
3. Manual (dev, with `TIER_RUNS_FREE=3` set + server restarted), a Free org:
   - Walk the wizard to Step 4. The callout's **Free** line now reads
     **"2 engines × 10 prompts × 3 runs = 60 calls"** — matching what the audit actually runs.
   - Create the brand → the audit-result header shows **60 LLM calls** — the confirm screen and the
     actual run now AGREE.
4. Config round-trip: set `TIER_RUNS_FREE=5`, restart, reopen Step 4 → the Free line now reads
   "5 runs = 100 calls"; set back to 3 → "3 runs = 60 calls". This proves the copy is derived, not
   hardcoded. Report both.

Report: STEP 0 findings (the old literal strings), files changed, the grep result, and the round-trip
(60 at TIER_RUNS_FREE=3, 100 at =5) confirming the displayed number follows config.
