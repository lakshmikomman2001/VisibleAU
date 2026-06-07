# Claude Code task — fix "0 engines / 0 LLM calls" audit (tier→engine resolution)

## The bug

After clicking **Run audit** on an **Agency-tier** brand (Bondi Plumbing), the audit-progress page shows:

```
Querying 0 engines × 10 prompts × 5 runs = 0 LLM calls. Estimated 1–2 minutes.
Step: "Querying 0 engines × 10 prompts × 5 runs (0/0 LLM calls)"
Cost so far: US$0.00  of ~US$0.00 budget (0 calls)
Mentions found: 0   across 0 LLM calls
Progress: 0%  (stuck — never advances past "Loading brand context")
```

`prompts = 10` and `runs = 5` resolve correctly. Only the **engine list is empty (0)**, so the audit
job has nothing to iterate, makes 0 LLM calls, and the progress bar never moves. For an Agency-tier
org this must be **4 engines (chatgpt, claude, gemini, perplexity) × 10 prompts × 5 runs = 200 calls**.

## Root cause (confirmed against the Sprint 3 design)

`lib/llm/tier-engines.ts` is the single source of truth:

```ts
export const TIER_ENGINES: Record<Tier, readonly Engine[]> = {
  free:       ['chatgpt', 'perplexity'],
  starter:    ['chatgpt', 'claude', 'gemini', 'perplexity'],
  growth:     ['chatgpt', 'claude', 'gemini', 'perplexity'],
  agency:     ['chatgpt', 'claude', 'gemini', 'perplexity'],
  agency_pro: ['chatgpt', 'claude', 'gemini', 'perplexity'],
  enterprise: ['chatgpt', 'claude', 'gemini', 'perplexity'],
} as const;

export function enginesForTier(tier: Tier): readonly Engine[] {
  return TIER_ENGINES[tier] ?? TIER_ENGINES.free; // falls back to Free = 2 engines
}
```

Critically, the page shows **0 engines, not 2** — so this is NOT the `?? TIER_ENGINES.free` path
(that would give 2). The engine list is reaching the audit row as an **empty array**. The Sprint 3
spec (§6.6, "X2 fix") already predicted the failure mode: the audit-job load step must join
`organizations` so `org.tier` is available — *"Without the join, organization.tier is undefined →
enginesForTier(undefined) falls back to 'free'"*. Something in the built code produces an **empty**
list instead — the likely culprits, in order:

1. The audit row is created/started with `engines: []` (e.g. `TIER_ENGINES[tier] ?? []` somewhere,
   or `engines` defaulted to `[]` and never populated because the tier was `undefined`).
2. A **tier value / key mismatch**: the DB `tier` enum value doesn't match the `TIER_ENGINES` keys
   (e.g. stored as `'Agency'` / `'AGENCY'` while keys are lowercase `'agency'`, or a display label
   `'Agency tier'` is being used as the key). `TIER_ENGINES['Agency']` is `undefined`.
3. The tier is read from the **wrong place** — e.g. `brand.tier` (no such column) or a brand field,
   instead of the **organization's** tier via the three-table join the spec requires.

## Step 1 — Investigate before changing anything

Read and report findings for each:

1. `lib/llm/tier-engines.ts` — confirm the exact key casing/format of `TIER_ENGINES` and the `Tier`
   enum definition in `@/db/schema/enums`. What are the literal enum values?
2. The `tier` (or `plan`) column on `organizations` (schema + a sample value from the DB for this
   org). Is it lowercase `'agency'`, title-case `'Agency'`, or something else? Does it match the
   `TIER_ENGINES` keys EXACTLY?
3. `inngest/functions/run-audit.ts` (the audit job) — the `load-audit` / `load` step. Does it join
   `organizations` and pass `org.tier` through? Does it call `enginesForTier(tier)` and iterate the
   result? Capture the exact value of `tier` and `engines` at runtime (add a temporary
   `console.log({ tier, engines })` in the load step, trigger an audit, read the log, then remove it).
4. `POST /api/audits` and the audits schema — where do the `engines` (array) and `engine_count`
   columns get written? Is `engines` being set to `[]` at creation, or only populated by the job?
5. The audit-progress page (`app/(auth)/**/audits/[auditId]/page.tsx` or its progress component) —
   confirm it reads engine count from `audit.engines.length` / `audit.engine_count` / `audit.total_calls`
   (i.e. it is faithfully displaying the row, not computing 0 itself). The page is almost certainly
   correct; the empty data is upstream.

Report which of the three root causes (empty-default, key mismatch, wrong source field) is the real
one. Then fix it at the source.

## Step 2 — Fix the tier→engine resolution (the real fix)

Apply whichever of these the investigation shows is needed; do all that apply:

**(a) If it's a key/casing mismatch** — normalise the tier before lookup and make `enginesForTier`
tolerant, WITHOUT changing the canonical lowercase keys:

```ts
export function enginesForTier(tier: string | null | undefined): readonly Engine[] {
  const key = String(tier ?? '').trim().toLowerCase().replace(/\s+/g, '_') as Tier;
  const engines = TIER_ENGINES[key];
  if (!engines) {
    // Loud, not silent: an unknown tier is a bug, not a Free user.
    console.error(`enginesForTier: unknown tier "${tier}" → defaulting to free`);
    return TIER_ENGINES.free;
  }
  return engines;
}
```

Prefer fixing the **stored value** if the DB has the wrong casing (a data/enum problem) — but the
normalisation above also protects against future drift. Keep the `Tier` enum and `TIER_ENGINES` keys
as canonical lowercase snake_case.

**(b) If the job isn't joining `organizations`** — fix the `load-audit` step to fetch the org and
pass `org.tier` through, per the Sprint 3 §6.6 pattern (three-table load: audit → brand → org), then
`const engines = enginesForTier(loaded.tier);` and iterate it.

**(c) Never let an empty engine list reach the row.** Wherever `engines` is written (creation or job
start), guard it:

```ts
const engines = enginesForTier(tier);
if (engines.length === 0) {
  // Impossible after the fix, but fail the audit loudly instead of running 0 calls silently.
  throw new Error(`Audit ${auditId}: resolved 0 engines for tier "${tier}"`);
}
```

Set `engines` (the array) at job start and `engine_count = engines.length` at finalize, exactly as
the schema comments specify. Do **not** hardcode a 4-engine constant (Sprint 3 N1 fix) — always
derive from `TIER_ENGINES` so Free stays at 2 and paid at 4.

## Step 3 — Fix the heading spacing (cosmetic)

On the audit-progress page, the subtitle renders `"10prompts"` (missing space). The step list lower
down is correct ("10 prompts"). Fix the heading template literal — it's almost certainly
`${promptCount}prompts` and should be `${promptCount} prompts` (one space). Verify the subtitle reads
"… × 10 prompts × 5 runs …".

## Step 4 — Confirm the progress bar recovers

The "Progress 0% / stuck" symptom is a **downstream effect** of the empty engine list (0 calls →
nothing to poll → `citationCount / totalCalls = x/0`). After Steps 2–3, re-run an audit and confirm:
the heading shows "4 engines … = 200 LLM calls", steps advance past "Loading brand context", the
progress percentage climbs, and the cost/mentions cards populate. If the bar still doesn't move once
calls are running, check the polling math guards against divide-by-zero (`total === 0 ? 0 : done/total`).

## Constraints (must hold)

- `lib/llm/tier-engines.ts` is the single source of truth — Free = `['chatgpt','perplexity']` (2),
  all paid tiers = 4 engines. Do NOT hardcode a 4-engine constant anywhere.
- Do not change the `POST /api/audits` response contract (`{ auditId, auditNumber }`).
- Keep `getCurrentUser()` + `setRlsContext(...)` intact wherever you edit; cross-org → 404.
- No new dependencies. Match existing code/import patterns.
- An unknown tier should log an error and default to the most-restrictive (Free), never to an empty
  list, and never silently for a known paid tier.

## Verification (run and report results)

1. `pnpm typecheck` and `pnpm lint` — clean.
2. `tests/unit/llm/tier-engines.test.ts` — passes (Free = 2 engines, paid = 4). Add a case asserting
   `enginesForTier('Agency')`, `enginesForTier('agency')`, and `enginesForTier(undefined)` all return
   a non-empty list, with the two Agency forms returning 4 engines.
3. Manual flow: Run audit on the Agency-tier brand → progress page shows
   "Querying ChatGPT, Claude, Gemini, Perplexity × 10 prompts × 5 runs = 200 LLM calls", progress
   advances past 0%, cost/mentions cards update, audit reaches `status='complete'`.
4. Inspect the created `audits` row: `engines` is the 4-element array and `engine_count = 4` (not 0/null).
5. Confirm a Free-tier org still resolves to exactly 2 engines (ChatGPT + Perplexity) = 100 calls.

When done, summarise: the actual root cause (key mismatch / missing org join / empty default), the
exact change(s) made, the runtime `{ tier, engines }` you observed before vs after, and the
verification output.
