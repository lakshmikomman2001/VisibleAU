# VisibleAU — Test the Smart Prompt Pack with a FRESH real brand (Employment Hero) — Claude Code
# Validates the just-implemented Smart Brand-Specific Prompt Pack (fix-brand-smart-prompt-pack.md)
#   end-to-end with REAL LLM calls, in local PRODUCTION mode (visibleau_prod + LLM_MODE=real).
# Why this brand: Employment Hero is an HR/payroll SaaS — under the OLD generic "saas" vertical it
#   would get document-management / time-tracking / invoicing prompts (where it shouldn't rank),
#   reproducing the exact Canva-34.4 failure mode in a DIFFERENT category. With the fix it should get
#   HR-specific prompts and score what it truly is. It's a fresh brand (NOT Canva, which is already in
#   the DB pre-fix) so classification fires from scratch.
# Costs: ~$0.001 for the classification (one Haiku call) + ~US$3.50 for the audit. Run ONCE.
# Records results — flag defects, don't fix them in this run.

╔═══════════════════════════════════════════════════════════════════════════════╗
║ TEST BRAND (verified real AU business — use exactly this):                       ║
║   • Name:     Employment Hero                                                    ║
║   • Domain:   employmenthero.com                                                 ║
║   • Vertical (user hint): saas                                                   ║
║   • Region:   Australia (Sydney/NSW HQ)                                          ║
║   • What it does: HR, payroll, recruitment & benefits SaaS for SMEs — Australian-║
║     founded, 350,000+ businesses, top-10 ANZ software, strong real AI presence    ║
║     in the HR category. EXPECTED to score WELL on HR-specific prompts.            ║
║ WHY IT TESTS THE FIX: "saas" is too coarse — the old pack would send HR-software  ║
║   generic prompts that don't match. The fix should classify it (e.g. category     ║
║   'hr_software' / 'hr_payroll', buyerType 'smb') and build HR market queries.     ║
╚═══════════════════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════════════════════
STEP 0 — Pre-flight (prod mode + the fix is present)
═══════════════════════════════════════════════════════════════════════════════

> 1. Switch to PROD mode (START-PROD.bat → .env.prod → .env.local). App reports PROD on visibleau_prod;
>    `LLM_MODE=real`; the 4 LLM provider keys present (set/unset only, no values). Inngest prod worker
>    up (or inline fallback).
> 2. Confirm the Smart Prompt Pack fix is live: brands table has the 5 new columns
>    (`classification`, `classification_status`, `classification_at`, `prompt_pack`,
>    `prompt_pack_version`) — `psql visibleau_prod -c "\d brands" | grep -E "classification|prompt_pack"`
>    — and the `classifyExistingBrands` Inngest function is registered in serve().
> 3. ABN is in skip mode (`ABN_LOOKUP_BYPASS=skip`) — expected; ABN will read 0/3 "pending", not a
>    defect (unrelated to this test).
> 4. Budget ceiling (<US$3.50/audit) + tier quota in place.
> **Report GO/NO-GO.** If the 5 columns or the Inngest function are missing, STOP — the fix isn't
> deployed to prod.

═══════════════════════════════════════════════════════════════════════════════
STEP 1 — Create the fresh brand and watch classification fire (the new path)
═══════════════════════════════════════════════════════════════════════════════

> 1. Through the real UI (Agency-tier org), create the brand: name **Employment Hero**, domain
>    **employmenthero.com**, vertical **saas**, region **Australia**. Confirm brand creation is INSTANT
>    (the classification must NOT block the response — it's fire-and-forget).
> 2. Immediately after creation, confirm `classification_status` starts at `pending`/`processing`, then
>    watch it reach `complete` (the Haiku classification call, ~2–5s). Query:
>    `SELECT name, classification_status, classification, prompt_pack
>     FROM brands WHERE name = 'Employment Hero';`
> 3. **Inspect the classification output** (the key new artifact). Confirm `classification` JSONB is
>    populated with sensible values for an HR brand:
>    - `category` ≈ an HR/payroll-specific category (e.g. 'hr_software', 'hr_payroll') — NOT a generic
>      'saas'. THIS is the core of the fix.
>    - `buyerType` ≈ 'smb' (Employment Hero targets SMEs).
>    - `intentSignals` — HR-flavoured search intents.
>    - `competitors` — plausible HR competitors (e.g. Deel, Rippling, MYOB, Xero Payroll, KeyPay).
>    - `auRelevance` — high (it's Australian).
>    - `confidence` — report the value (note if < 0.6, since that triggers category-level fallback).
> 4. **Inspect the generated `prompt_pack`** — confirm it contains HR-specific MARKET queries, e.g.
>    "best HR software for Australian small businesses", "best payroll software for Australian SMEs",
>    competitor comparisons (Employment Hero vs X), NOT the generic SaaS bucket (document management /
>    time tracking / invoicing / CRM). Paste the 10 prompts so we can eyeball relevance.
> **Report:** classification_status reached complete? · the classification JSONB (category/buyerType/
> competitors/confidence) · the 10 generated prompts. If status is `failed` or the pack is generic,
> that's the thing to flag — capture the error/fallback reason.

═══════════════════════════════════════════════════════════════════════════════
STEP 2 — Run the audit with real LLMs (the before/after proof)
═══════════════════════════════════════════════════════════════════════════════

> Click "Run Audit" ONCE. Confirm it uses the BRAND-SPECIFIC prompt_pack (tier 1 of the fallback
> chain), not the vertical fallback — i.e. the prompts sent match the HR pack from Step 1, not the
> generic SaaS pack. Watch the multidim audit (~200 real calls across the 4 engines) + the technical
> crawl complete. Note spend.
> **Report:** which prompt path was used (stored pack / built-from-classification / vertical fallback —
> should be the stored pack); the prompts actually sent; both audits completed; approximate spend.

═══════════════════════════════════════════════════════════════════════════════
STEP 3 — Verify the score reflects reality (the whole point of the feature)
═══════════════════════════════════════════════════════════════════════════════

> 1. **The headline check:** Employment Hero's composite visibility score should be HIGH (a strong HR
>    brand asked HR questions should appear often). Report the composite /100 and the mention rate.
>    - Expected: a believable, high-ish score (well above the 34.4 Canva got on mismatched prompts).
>      The exact number isn't fixed, but a strong AU HR brand on HR-specific prompts should show a much
>      higher mention rate than 10%. If it comes back low (e.g. <40) DESPITE HR-specific prompts, flag
>      it — that would suggest a real issue (prompt quality, mention detection, or scoring).
> 2. **Sanity-check the mentions:** confirm Employment Hero actually appears in the engine responses
>    for the HR queries (real citations), not incidental mentions. Spot-check 2–3 responseSnippets.
> 3. **Per-engine + dimensions:** confirm the multidim breakdown populated across all 4 engines, the
>    5 dimensions computed, composite + Wilson CI present.
> 4. **Other features still work** (quick pass, since this is a real audit anyway): Action Center
>    recommendations generated; technical audit dimensions present; ABN 0/3 "pending" (skip mode,
>    expected); AU TLD — note employmenthero.com is a .com not .com.au, so AU TLD will score 0/2
>    (correct — it's a real signal, not a bug).
> **Report:** composite score + mention rate; do the mentions look genuine?; per-engine + dimensions
> populated?; any feature that failed.

═══════════════════════════════════════════════════════════════════════════════
STEP 4 — Summary
═══════════════════════════════════════════════════════════════════════════════

> One report:
> - GO/NO-GO; brand (Employment Hero); total spend (classification + audit).
> - **The classification artifact** (category/buyerType/competitors/confidence) + the 10 generated
>   prompts — and a one-line judgement: are these HR-appropriate (fix working) or generic (fix not
>   engaging)?
> - The composite score + mention rate, with a judgement: does the score look believable for a strong
>   AU HR brand (fix working) vs artificially low (problem)?
> - A defects list ordered by severity (separate NEW defects from KNOWN-expected: ABN 0/3 skip, .com
>   TLD 0/2, any parked Signals items).
> - Explicit statement: does the Smart Prompt Pack feature work end-to-end on a fresh real brand —
>   classification fires, produces brand-appropriate prompts, and the resulting score reflects reality?

─────────────────────────────────────────────────────────────────────────────

## Notes for Sri (not part of the paste)
- **Why Employment Hero, not another design tool:** it reproduces the Canva failure in a DIFFERENT
  category (HR vs design), which is a stronger test — it shows the fix generalises beyond the one case
  it was designed around. And it's a fresh brand, so classification runs from scratch (Canva can't —
  it's already in the DB pre-fix).
- **The two artifacts that prove the fix** are (1) the `classification` JSONB showing an HR-specific
  category (not generic 'saas'), and (2) the 10 generated prompts being HR market queries. If those
  two look right, the feature works; the high score is the downstream confirmation.
- **Known-expected (not defects):** ABN 0/3 (skip mode), AU TLD 0/2 (employmenthero.com is .com not
  .com.au — a real signal). Don't let these muddy the read.
- **Costs ~US$3.50** for the audit + a fraction of a cent for classification. Run once.
- If the classification comes back generic or low-confidence, that's the genuine finding to bring back
  — paste the classification JSONB + prompts and I'll help diagnose whether it's the Haiku prompt, the
  template library coverage, or the category mapping.
