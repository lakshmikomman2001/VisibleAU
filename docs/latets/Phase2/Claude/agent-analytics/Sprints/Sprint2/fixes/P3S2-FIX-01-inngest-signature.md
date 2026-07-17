# P3-S2 · FIX 01 — ingest-ai-referrals.ts wrong createFunction signature (CRITICAL: whole Inngest route 500s)

> **Type:** CODE FIX. **CRITICAL** — S2's new Inngest function uses the wrong `createFunction` signature,
> throws at **module evaluation**, and because `app/api/webhooks/inngest/route.ts` imports it, **the entire
> Inngest route 500s.** Every background job in the app (all 44 functions — audits, reports, verification,
> everything) is currently unregisterable. The terminal shows `PUT /api/webhooks/inngest 500` on every
> request.
>
> **Why the tests didn't catch it:** S2 reported "39 tests pass" and "serve() 43→44", but this function
> **cannot be instantiated** — it throws when the module loads. The tests must have mocked Inngest (never
> constructing the real function against the installed SDK) or never imported the serve route. This is the
> project's core thesis in its sharpest form: **green tests, and the feature doesn't even load.** Only
> starting the server + reading the terminal surfaced it. The fix is verified the same way.
>
> **Root cause (exact):** S2 used the **old three-argument** `createFunction(config, trigger, handler)`
> form. The installed Inngest SDK requires the **two-argument** form with triggers **inside** the first
> config object: `createFunction({ id, ..., triggers: [{ event: "..." }] }, handler)`. The SDK reads arg 2
> expecting the handler, finds the trigger object, and throws *"expected a handler function as the second
> argument. Triggers belong in the first argument."*
>
> **Ground truth (all 3 S1 functions use this exact form — copy it):**
> - `parse-crawler-log.ts` → `triggers: [{ event: "crawler-log/uploaded" }]`
> - `verify-crawler-hits.ts` → `triggers: [{ event: "crawler-hits/ingested" }]`
> - `refresh-bot-ip-ranges.ts` → `triggers: [{ cron: "0 3 * * *" }]`
> ⚠️ Note: `triggers` (plural key), an **array** value, inside the **first** config object; handler is the
> **second** argument. NOT `trigger:` singular, NOT a separate second argument.

---

## THE FIX — `inngest/functions/ingest-ai-referrals.ts`

Replace the `createFunction` call. **Only the signature shape changes** — the handler body is already
correct (it matches the working functions' `{ event, step }` + `step.run` pattern).

**BEFORE (broken — 3-arg, trigger as separate 2nd argument):**
```ts
export const ingestAiReferralsFn = inngest.createFunction(
  {
    id: "ingest-ai-referrals",
    name: "Ingest AI Referral Hits",
    concurrency: { limit: 2 },
  },
  { event: "referrals/ingest" },          // ← WRONG: trigger as separate 2nd arg
  async ({ event, step }) => {            // ← handler pushed to 3rd arg
    ...
  },
);
```

**AFTER (correct — 2-arg, triggers array inside config; matches all 3 working functions):**
```ts
export const ingestAiReferralsFn = inngest.createFunction(
  {
    id: "ingest-ai-referrals",
    name: "Ingest AI Referral Hits",
    concurrency: { limit: 2 },
    triggers: [{ event: "referrals/ingest" }],   // ← trigger folded INTO config as a triggers array
  },
  async ({ event, step }) => {                    // ← handler is now the 2nd (last) argument
    const { organizationId, brandId, records } = event.data as {
      organizationId: string;
      brandId: string;
      records: ReferralRecord[];
    };

    const result = await step.run("ingest-referral-records", async () => {
      return ingestReferrals(organizationId, brandId, records);
    });

    return {
      status: "complete",
      inserted: result.inserted,
      skipped: result.skipped,
    };
  },
);
```
⚠️ **That is the entire change:** delete the standalone `{ event: "referrals/ingest" }` second argument,
add `triggers: [{ event: "referrals/ingest" }]` to the first config object, and the handler becomes the
second argument. Imports and handler body stay exactly as they are.

---

## SWEEP — is this the ONLY malformed function? (don't fix one and miss another)

S2 added functions/edits; if the author used the wrong signature once, they may have used it elsewhere.
Grep the whole functions dir for the **old-form tell** — a `createFunction` whose config object does NOT
contain `triggers` (meaning the trigger is a separate argument):

```
grep -rn "createFunction" inngest/functions/ | wc -l          # how many functions total
grep -rLn "triggers:" inngest/functions/*.ts                   # files with createFunction but NO "triggers:" key
```
⚠️ **Any file that calls `createFunction` but has no `triggers:` key in its first arg is suspect** — it's
either using the old 3-arg form (broken) or is malformed differently. Open each hit and confirm it uses
the correct 2-arg `triggers: [...]` form. **Report any other offenders** — fix them the same way. (The 3
S1 functions and the pre-existing 43 should all already have `triggers:`; the likely sole offender is the
S2 `ingest-ai-referrals.ts`, but verify.)

---

## PROVE IT (terminal-watched — the only real proof)

1. **Restart the dev server** (the module-eval error is cached; a restart is needed to re-evaluate).
2. ⚠️ **Watch the terminal on startup and on the first `/api/webhooks/inngest` hit:**
   - The `⨯ Error: "createFunction" expected a handler function...` must be **GONE**.
   - `PUT /api/webhooks/inngest` must return **200** (was 500).
3. **Confirm all functions register** — hit the Inngest route (the dev server PUTs it on startup) and
   confirm no registration error. If there's an Inngest dev dashboard, confirm the function count.
4. ⚠️ **serve() count:** the S2 report said 43→44. Confirm the manifest reflects 44 and that
   `ingest-ai-referrals` is registered. Check `scripts/qa/inngest-serve-manifest.txt` (or wherever the
   manifest lives) includes it, and that the set-difference guard passes.

⚠️ **Do NOT just re-run the unit tests and call it fixed** — the tests were green while this was broken.
The proof is the **route returning 200 in the terminal** and the function actually registering, not a
green test.

---

## REPORT-BACK (paste inline)

- **The fix:** applied to `ingest-ai-referrals.ts`? (confirm the 2-arg form with `triggers: [{ event: "referrals/ingest" }]`).
- **Sweep:** how many `createFunction` calls total; any OTHER files missing `triggers:` (offenders)? If
  found, fixed?
- ⚠️ **Terminal proof:** after restart, is the `createFunction` error GONE and does
  `PUT /api/webhooks/inngest` return **200** (not 500)? Paste the relevant terminal line.
- **serve() count:** manifest shows 44, `ingest-ai-referrals` registered, set-difference guard passes?

**⚠️ VERDICT at the top:**
> **Does the Inngest route load cleanly now — `/api/webhooks/inngest` returns 200, the createFunction
> error is gone, and all 44 functions (including ingest-ai-referrals) register — confirmed in the
> terminal, not just via green tests?** YES → the S2 Inngest breakage is fixed and the app's background
> jobs are functional again; resume the S2 rendered-screen walk. NO → paste the current terminal error.

**Constraints recap:** copy the exact 2-arg `triggers: [...]` form the 3 working S1 functions use; sweep
for other offenders; the proof is the route returning 200 in the TERMINAL (the tests were green while
broken — don't trust them here); confirm serve()=44 in the manifest.
