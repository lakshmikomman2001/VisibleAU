# VisibleAU — Run the Smart Prompt Pack classification backfill (fix pre-fix brands) — Claude Code
# Diagnosis (confirmed): Marrickville Dental Studio scores 13.8 because it's a PRE-FIX brand —
#   classification_status='pending', classification=null, prompt_pack=null (created 2026-06-19, before
#   the Smart Prompt Pack). So its audit fell back to the generic allied_health vertical pack (asked a
#   dental studio about chiropractors/podiatrists) → 0s → 13.8. NOT a real score; NOT a scoring bug.
# Systemic finding: classification only fires on brand CREATION (Inngest brand/created). EVERY pre-fix
#   brand (Marrickville, Canva, any created before the feature) is stuck unclassified and will produce
#   artifact scores until backfilled.
# THE FIX IS ALREADY DESIGNED IN CANON: the Smart Prompt Pack build doc specifies an Inngest backfill
#   function `classify-existing-brands.ts` (event 'brand/classify-all', idempotent, rate-limited 2s/
#   brand). This prompt VERIFIES it's built+registered, fixes if not, then TRIGGERS it.
# Pins: smart-prompt-pack handoff (L232 "backfill job classify-existing-brands is a new serve() fn") +
#   fix-brand-smart-prompt-pack Step 5.3 (the exact function) + F-06 (serve() count +2).
# str_replace/exact-literal only.

═══════════════════════════════════════════════════════════════════════════════
STEP 1 — Verify the backfill function exists & is registered (find why it never ran)
═══════════════════════════════════════════════════════════════════════════════
> The diagnostic shows pre-fix brands stay `pending`, meaning the backfill isn't doing its job. Find out
> why — one of: not built, not registered in serve(), or simply never triggered (it's a MANUAL one-time
> job, so it may exist but have never been invoked). Check:
> 1. Does `inngest/functions/classify-existing-brands.ts` EXIST, matching canon Step 5.3?
>    - Function id 'classify-existing-brands', event trigger **'brand/classify-all'**
>    - Fetches unclassified brands (canon uses `isNull(brands.classification)`)
>    - Loops with `step.run('classify-${id}', () => classifyAndStoreBrand(id))` + `step.sleep(..., '2s')`
> 2. Is it **registered in serve()** in `app/api/inngest/route.ts` (alongside classifyOnBrandCreate)?
> 3. Does `classifyAndStoreBrand` (lib/brands/classify-and-store.ts) exist and is it **idempotent**
>    (skips brands already classified)? Canon says it must be.
> 4. Confirm the creation trigger works (classifyOnBrandCreate on 'brand/created') — that's why NEW
>    brands like Bondi got classified but pre-fix ones didn't.
> **Report:** which of (built? / registered? / idempotent?) hold, and the most likely reason the backfill
> never ran (not built vs not registered vs never-triggered). Do NOT fix yet — report first.

═══════════════════════════════════════════════════════════════════════════════
STEP 2 — Build/fix the backfill function ONLY if Step 1 found it missing/broken
═══════════════════════════════════════════════════════════════════════════════
> - If it EXISTS and is registered and idempotent → skip to Step 3 (it just was never triggered — which
>   is expected; it's a manual one-time job).
> - If MISSING → create `inngest/functions/classify-existing-brands.ts` exactly per canon Step 5.3
>   (id 'classify-existing-brands', event 'brand/classify-all', isNull(brands.classification) query,
>   per-brand step.run + 2s step.sleep, idempotent via classifyAndStoreBrand).
> - If NOT registered → add `classifyExistingBrands` to the serve() array in app/api/inngest/route.ts.
>   (Per F-06: this is the +1 to serve() count — if any Phase 2 LLD/sprint locks a serve() count, note
>   the change; don't silently drift it.)
> - If `classifyAndStoreBrand` isn't idempotent → make it skip brands already `complete` (so re-running
>   the backfill is safe and doesn't re-pay for already-classified brands).
> Keep everything additive; do NOT modify the working creation trigger or any scoring logic.

═══════════════════════════════════════════════════════════════════════════════
STEP 3 — Trigger the backfill (classify all pending brands)
═══════════════════════════════════════════════════════════════════════════════
> Trigger the one-time backfill by sending the **'brand/classify-all'** event (via the Inngest dashboard,
> or a one-off `inngest.send({ name: 'brand/classify-all' })` — whichever canon/your setup supports).
> IMPORTANT — cost/mode note:
> - `classifyAndStoreBrand` uses Haiku (~$0.001/brand) and respects LLM_MODE. In **mock mode** it
>   returns the mock fixture (free, but the classification won't be *real* — fine for testing the flow).
>   For a REAL classification (real category/prompt_pack), run with **LLM_MODE=real** (cost is tiny —
>   ~$0.001 × number of pending brands; for a handful of brands this is fractions of a cent).
> - Decide which: if you just want to confirm the backfill MECHANISM works → mock is fine. If you want
>   Marrickville (and others) to get REAL dental/appropriate prompt packs → run with LLM_MODE=real.
>   State which mode you ran in.
> Let it process (2s/brand, so a few seconds for a few brands).
> **Report:** how many brands the backfill found (should include Marrickville + any other pending ones,
> e.g. Canva), and that they processed.

═══════════════════════════════════════════════════════════════════════════════
STEP 4 — Verify the backfill worked
═══════════════════════════════════════════════════════════════════════════════
> Re-query the previously-pending brands:
> ```sql
> SELECT name, classification_status, prompt_pack_version,
>        classification->>'category' AS category
> FROM brands WHERE classification_status != 'complete' OR classification IS NULL;
> ```
> - Marrickville (and other pre-fix brands) should now be `classification_status='complete'` with a
>   populated `classification` + `prompt_pack`. If run with LLM_MODE=real, Marrickville's category should
>   be dental/healthcare-appropriate (NOT allied_health generic) and its prompt_pack should contain
>   dental queries ("best dentist Marrickville", etc.) — confirm by inspecting one.
> - Confirm idempotency: re-sending 'brand/classify-all' should skip already-complete brands (no
>   re-classification, no extra cost).
> - `npm run typecheck` passes; the creation trigger + scoring unchanged.
> **Report:** the brands now classified, Marrickville's new category + a sample of its prompt_pack, and
> confirmation re-running is a no-op for completed brands.
>
> NOTE: this fixes the PROMPTS (Marrickville will now get dental prompts on its NEXT audit). It does NOT
> re-score Marrickville — the 13.8 audit stays in history until a NEW audit runs. To see Marrickville's
> REAL score, run a fresh audit for it (LLM_MODE=real, ~$0.84) AFTER this backfill — now it'll use the
> dental smart pack. That re-audit is optional (only if you want the real number); the backfill itself
> is the systemic fix.

─────────────────────────────────────────────────────────────────────────────

## Notes for Sri (not part of the paste)
- **The backfill was already designed** — canon's Smart Prompt Pack build doc specifies
  `classify-existing-brands.ts` (Step 5.3) precisely. So this isn't new work; it's verifying the spec'd
  component is built + registered, then actually TRIGGERING it (it's a manual one-time job, so the most
  likely reason Marrickville is still pending is simply that nobody ever fired the 'brand/classify-all'
  event).
- **This is the systemic fix** — it reclassifies Marrickville AND Canva AND any other pre-fix brand in
  one run, not one at a time. Important before onboarding any agency with existing brands.
- **Two-step to a real Marrickville score:** (1) this backfill fixes the PROMPTS; (2) an optional
  re-audit (real mode, ~$0.84) then produces Marrickville's real score using the dental pack. The
  backfill alone doesn't re-score history — it fixes what the NEXT audit will use.
- **Cost is trivial:** classification is ~$0.001/brand. Even in real mode, backfilling a handful of
  brands is fractions of a cent. The re-audit ($0.84) is the only meaningful cost, and it's optional.
- **Idempotency matters** — Step 4 confirms re-running is a no-op, so you can safely trigger the backfill
  again (e.g. after onboarding more pre-fix brands) without double-paying.
- After this: 13.8 is fully resolved (cause = stale prompts from missing classification; fix = backfill).
  Marrickville will score properly on its next real audit. Top Movers' 0.0 may also change once any
  brand gets a new differing score.
