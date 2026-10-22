# Query simulation: the real fix

`simulate-query-fan-out` is paused (`QUERY_SIMULATION_ENABLED=false`, default) as of
23 Oct 2026 -- Sri's decision, "Pause query simulation, cap competitor comparisons,
give Claude more time per call, and check the cache age", item 1. This is the spec
for turning it back on correctly, not a record of what shipped.

## Why it's paused

- Its prompt query (`inngest/functions/simulate-query-fan-out.ts`, the
  `tx.select(...).from(verticalPackPrompts).limit(5)` call inside the
  `withRlsContext` block) has **no `.where()`** -- it picks 5 prompts from
  **any** vertical's pack, not the brand's own. An electrician's audit can
  get plumbing prompts.
- It makes up to ~260 LLM calls per audit (4 engines x 5 prompts x
  (1 sub-query-generation call + up to 12 brand-mention checks) --
  `lib/visibility/fan-out-simulator.ts`'s `DEFAULT_MAX_SUB_QUERIES = 12`).
- It holds the single post-audit concurrency slot (`lib/inngest/
  concurrency.ts`'s `POST_AUDIT_POOL`, limit 1, shared account-wide across
  all 17 post-audit functions) for as long as those up-to-260 calls take,
  ahead of `send-audit-complete-email` and `generate-recommendations` --
  functions an owner is actively waiting on.
- Its results feed the owner-facing Visibility page
  (`app/api/brands/[brandId]/fan-out/route.ts`, `components/domain/
  visibility/fan-out-tree.tsx`), so the wrong-vertical prompts were visible
  to owners, not just an internal metric.

## What the fix needs

1. **Scope prompts to the brand.** Build 2's `brand_prompts` (per level --
   presumably per-tier or per-plan-level, matching how `enginesForTier`/
   `runsForTier` key off tier elsewhere in this codebase) replaces the
   untargeted `verticalPackPrompts` pull. Until `brand_prompts` exists, the
   query must at minimum join/filter on the audit's own `vertical_pack_id`
   (the same pack `getAuditPrompts()` already resolves for the main audit
   run) -- never a cross-vertical `.limit(N)` with no `.where()`.

2. **Named caps**, replacing the current unconditional `.limit(5)` prompts x
   `DEFAULT_MAX_SUB_QUERIES = 12` sub-queries x all enabled engines:
   - example shape: 3 questions x enabled engines x at most 3 sub-queries
     each -- named constants (e.g. `QUERY_SIMULATION_PROMPTS`,
     `QUERY_SIMULATION_MAX_SUB_QUERIES`), not magic numbers, sized so a
     worst-case audit's call count is small enough to not dominate the
     single post-audit concurrency slot the way ~260 calls did.
   - re-derive the $/audit estimate from the new cap before shipping (same
     method as the Part J report: calls = prompts x engines x
     (1 + subQueries), x the real per-call $ this task's own production
     evidence implies, not the Phase 2 canon rate).

3. **Lowest priority in the post-audit pool.** Today it shares
   `POST_AUDIT_POOL` equally with every other post-audit function --
   nothing makes `send-audit-complete-email` or `generate-recommendations`
   go first. Check what the installed Inngest SDK version actually
   supports for sub-ordering within one shared concurrency key (a second,
   even-smaller nested pool? a priority setting that DOES work within a
   single function's own queue, applied here differently than the
   cross-function case Part J ruled it out for?) before assuming a
   mechanism exists -- confirm against the SDK's types the same way Part J
   did for `priority` vs `concurrency`, don't assume.

4. **Cost recorded.** Call `BudgetPolicyService.record(auditId, totalCostUsd,
   "simulate-query-fan-out")` exactly as the paused code already does
   (`lib/visibility/fan-out-engine-loop.ts`'s `totalCostUsd` return value,
   wired to `record()` in the Inngest function) -- this part of Part J's
   work is correct and should carry over unchanged into the real fix.

5. **Results shown only for the run's own prompts.** The fan-out route and
   `FanOutTree` must only ever display rows whose `original_prompt_id`
   belongs to prompts actually asked for THIS brand's THIS audit -- once
   prompts are properly brand-scoped (item 1 above), this should fall out
   naturally from the existing `auditId`-scoped query in
   `app/api/brands/[brandId]/fan-out/route.ts`, but verify with a test that
   asserts no row from a different vertical's prompt ever appears.

6. **Conditions for turning the flag back on:**
   - the prompt query is brand/vertical-scoped (item 1), with a test
     proving a brand in vertical A never sees vertical B's prompts;
   - the named caps (item 2) are in place and their $/audit estimate is
     documented in the commit/report that re-enables this;
   - the post-audit pool ordering question (item 3) is resolved one way or
     the other (even if the answer is "no sub-ordering exists, accepted as
     a trade-off") -- not silently skipped;
   - cost recording (item 4) still has a passing RED->GREEN test;
   - the "results only for this run's own prompts" test (item 5) passes;
   - `QUERY_SIMULATION_ENABLED=true` is then a one-line env change, no
     Inngest resync required (the function has stayed registered this
     whole time), and the owner-facing panel starts receiving fresh,
     correctly-scoped data instead of showing "Query simulation is being
     rebuilt and will return soon".

## Non-goals for this doc

Not a decision about whether query simulation is worth keeping as a
feature at all -- that's a product call, not an engineering one. This is
purely the spec for making it correct and bounded if/when it's turned back
on.
