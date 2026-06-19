# VisibleAU — Smart Brand-Specific Prompt Pack: FIX-PROMPT REVIEW FINDINGS
# Reviewer: independent reviewer chat | Date: June 2026
# Reviewing: fix-brand-smart-prompt-pack.md v1.0 (Phase 1 feature fix; runs AFTER Sprint 7)
# Guide: visibleau-smart-prompt-pack-handoff.md (Section F checklist; Section D = locked design)
# Method: reviewed the prompt's own code directly (I don't have the Phase 1 repo, so file-
#   existence/interface claims are noted for Claude Code's Phase-1 investigation to confirm).
#   Two suspected logic bugs were reproduced in Node to confirm before reporting (F-01, F-02).
# Scope honored: correctness / completeness / safety only — the Section D approach is NOT
#   re-architected; every fix below is a targeted, minimal code correction.

---

## 1. VERDICT — **PASS-WITH-FIXES**

The structure and design are sound: 7 clear phases, an investigate-first step, an additive/
idempotent migration, a correct 3-tier runner fallback, a mock guard, good per-category
template coverage, and a real rollback plan. The market-vs-brand query split (60/40) is right,
and `build-prompt-pack` is correctly pure logic.

But there are **four MODERATE code bugs** that should be fixed before Claude Code runs this
(two confirmed by tracing), plus **one LOW** schema mismatch and **one cross-artifact** item
for Sri. None require redesigning the Section D approach.

| ID | Sev | One-line |
|----|-----|----------|
| F-01 | MODERATE | Stored prompt-pack ignores the brand's region → all `{region}` tokens become "Australia" |
| F-02 | MODERATE | Parent-category fallback mis-derives multi-word parents (allied_health_* → 'general', skipping allied_health_general) |
| F-03 | MODERATE (HIGH if serverless) | Non-blocking classification via un-awaited promise won't reliably complete; use the Inngest event |
| F-04 | MODERATE | `getLLMService()` called generically — doesn't actually select Haiku; cost/model assumption + interface unverified |
| F-05 | LOW | SQL migration (`classification_status` nullable) vs Drizzle (`.notNull()`) disagree |
| F-06 | MODERATE (cross-artifact, Sri) | `serve()` +1 makes the Phase-2 "eventual 25" become 26 — update the Phase-2 prompts |

---

## 2. FINDINGS

### F-01 — [MODERATE] Stored prompt-pack drops the brand's region (the primary cached path goes generic)
- **Where:** `lib/brands/classify-and-store.ts` (Step 3.2).
- **The bug:** the brand row is fetched as `{ id, name, domain, vertical, classificationStatus }`
  — **`region` is not selected** — and then `buildPromptPack(classification, brand.name,
  brand.domain)` is called with **no region argument**, so `buildPromptPack`'s `region='Australia'`
  default applies. The **stored** `prompt_pack` (the tier-1 path that serves most audits) therefore
  renders every `{region}` token as "Australia".
- **Confirmed by trace:** for a Bondi plumber (`trades_plumbing`), the classify-and-store call
  produced `"plumber Australia"`, whereas the audit-runner's tier-2 on-the-fly call (which *does*
  pass `brand.region ?? 'Australia'`, Step 5.2) produced `"plumber Bondi"`. So the two paths
  disagree, and the cached one is wrong.
- **Impact:** every `{region}`-token category — `trades_*`, `allied_health_*`, `real_estate_agency`,
  `hospitality_restaurant`, `legal_services` — gets "Best plumbers in Australia?" instead of
  "Best plumbers in Bondi?". That's ~6 of the ~20 categories, including **two of the three core
  verticals** (trades, allied health) and exactly the local-service brands that most need region.
- **Fix (minimal):** in `classify-and-store.ts`, add `region: brands.region` to the select, and
  pass it: `buildPromptPack(classification, brand.name, brand.domain, brand.region ?? 'Australia')`.
  (`brands.region` exists per handoff Section E.)

### F-02 — [MODERATE] Parent-category fallback mis-derives multi-word parents
- **Where:** `lib/prompts/templates.ts`, `getTemplatesForCategory()` (Step 4.1).
- **The bug:** the parent key is computed as `category.split('_')[0] + '_general'`. That works for
  single-word parents (`trades_plumbing` → `trades_general` ✓) but breaks for multi-word parents:
  `allied_health_dental`/`allied_health_podiatry` → `split('_')[0]` = `allied` → `'allied_general'`,
  which **doesn't exist**, so it falls through to `'general'` — **skipping `allied_health_general`,
  which does exist.**
- **Confirmed by trace:** `allied_health_podiatry` and `allied_health_optometry` (plausible Haiku
  outputs not in the library) both resolved `via general` instead of `allied_health_general`. The
  whole point of the parent tier is to catch sub-types Haiku invents — and for allied health (a
  core vertical) it silently loses the region-aware health templates.
- **Fix (minimal, verified):** derive the parent as everything before the **last** underscore:
  `const parentKey = category.includes('_') ? category.split('_').slice(0, -1).join('_') + '_general' : null;`
  Trace check: `allied_health_podiatry` → `allied_health_general` ✓, `trades_carpentry` →
  `trades_general` ✓, `saas_design_tools` → `saas_design_general` (absent → falls to `general`,
  which is correct since there's no saas parent).

### F-03 — [MODERATE; HIGH if deployed on serverless] Un-awaited classification won't reliably complete
- **Where:** brand-create API (Step 5.1): `classifyAndStoreBrand(newBrand.id).catch(err => …)` —
  fired without `await`.
- **The issue:** "fire-and-forget" via a dangling promise is unreliable in the runtimes this app
  likely uses. On **serverless (Vercel)** the function context is frozen/torn down once the HTTP
  response returns, so the 2–5 s Haiku call is cut off mid-flight — classification **silently never
  completes** for new brands, and they sit on `classification_status='processing'` (or 'pending')
  forever, always falling back to vertical prompts until a manual backfill. Even on a long-running
  Node server it's fragile: no retry, no durability, lost on a deploy/restart mid-call.
- **Not a re-architecture:** Section D's intent — *non-blocking creation + a status column* — is
  correct and preserved. The problem is the *mechanism*. You already run **Inngest** (you're adding
  an Inngest function for the backfill in this very fix), which is the durable, retryable layer
  built for exactly this. **Fix:** after insert, `await inngest.send({ name: 'brand/created',
  data: { brandId: newBrand.id } })` (a tiny, fast enqueue — safe to await), and add a small
  Inngest function that calls `classifyAndStoreBrand(brandId)` on that event. Same fire-and-forget
  UX, but it actually completes and retries. (If you're certain you're on a persistent Node server
  and accept no-retry, the dangling promise can stay — but flag the serverless caveat in the prompt.)

### F-04 — [MODERATE] `getLLMService()` doesn't actually select Haiku; interface is assumed
- **Where:** `lib/brands/classify-brand.ts` (Step 3.1): `const llm = getLLMService();` then
  `await llm.complete({ prompt, maxTokens, temperature })`.
- **Two problems:**
  1. **Model selection.** The whole cost case rests on this being a **Haiku** call (~$0.001).
     But `getLLMService()` is called with **no arguments**, so it returns whatever the default
     service/model is — quite possibly the audit model (Sonnet/GPT-class), which would be 10–50×
     the cost and not the intended model. The header comment says "uses Claude Haiku via the
     central model selector," but the code never tells the selector to use Haiku. The fix must
     route this through model-selector's own mechanism for choosing the cheap model (e.g. a
     `getLLMService({ useCase: 'classification' })` / tier hint that maps to Haiku) — consistent
     with VisibleAU's "never hardcode a model string" rule (so **not** `'claude-haiku-4-5'` inline).
  2. **Interface (handoff F5 pre-flags this).** `llm.complete({ prompt, maxTokens, temperature })
     → string` is an **assumption**. Phase 1's real `model-selector.ts` may expose a different
     method name or return shape (e.g. `{ text, usage }`), which would break `JSON.parse(raw.trim())`.
- **Fix:** during Phase 1 investigation, read `model-selector.ts` and (a) select Haiku via its
  parameter, (b) adapt the call signature + the parse to the real return type. The prompt should
  make both explicit rather than hardcoding the assumed shape.

### F-05 — [LOW] SQL migration and Drizzle schema disagree on `classification_status` nullability
- **Where:** Step 2.1 SQL: `classification_status TEXT CHECK (…) DEFAULT 'pending'` (**nullable**)
  vs Step 2.2 Drizzle: `text('classification_status', { enum: … }).default('pending').notNull()`
  (**NOT NULL**).
- **Why it matters (LOW):** functionally it works because the `DEFAULT 'pending'` backfills
  existing rows and supplies new ones, so a NULL never appears in practice — but Drizzle's type
  says non-null while the DB column permits NULL, which is real schema drift (introspection/`push`
  will flag it, and a manual `INSERT … (classification_status) VALUES (NULL)` would be DB-legal
  but type-illegal).
- **Fix:** make the SQL match Drizzle — `classification_status TEXT … NOT NULL DEFAULT 'pending'`.
  Adding `NOT NULL` alongside the `DEFAULT` is safe on the existing table (Postgres backfills via
  the default). (The handoff F2 leans toward "nullable with defaults"; that's fine for the other
  four columns, but a *status* column is legitimately non-null — just align the two definitions.)

### F-06 — [MODERATE, cross-artifact — action on Sri, not Claude Code] `serve()` +1 changes the Phase-2 "25"
- **Where:** Step 5.3 adds `classifyExistingBrands` to the `serve()` array in
  `app/api/inngest/route.ts`.
- **The consequence:** the Phase-2 sprint prompts I've been reviewing track a running
  `serve()` total "of the eventual **25**" (e.g. Sprint 4: "3 (S2) + 6 (S3) + 2 (S4) = 11 of the
  eventual 25"), and the Phase-2 handoff carries a `serve()=25/25` locked fact. Because Phase 2's
  count builds on the Phase-1 baseline, adding a function to Phase-1's `serve()` makes that
  eventual total **26**, not 25. The handoff (Section E / F5) already acknowledges this — but the
  Claude Code agent building Phase 1 won't touch the Phase-2 prompts, so the update is **manual**.
- **Fix (Sri):** when this lands, update the Phase-2 sprint prompts' `serve()` running-total notes
  and any Phase-2 `serve()` verification grep / locked fact from 25 → 26. (Flagging so the number
  stays consistent across the two efforts I'm reviewing.)

### LOW observations (not blocking; noted for completeness)
- **'Australia' region default is unnatural for local services** (tied to F-01): even after F-01,
  a local-service brand with **no** region stored yields "Best plumbers in Australia?". Consider
  requiring/falling back to a sensible region for `trades_*`/`allied_health_*`/`real_estate`/
  `hospitality` brands, or skipping the `{region}` lines when region is unknown.
- **`classify-and-store` idempotency guard isn't race-safe:** mark-`processing` → classify →
  `complete` isn't atomic; a brand created and concurrently picked up by the backfill could be
  classified twice (two Haiku calls, ~$0.001 wasted, last-write-wins). Harmless at Phase-1 scale;
  a conditional `UPDATE … WHERE classification_status <> 'complete'` would close it if desired.
- **Inngest backfill is step-per-brand:** one `step.run` + one `step.sleep('2s')` per brand is
  fine for Phase 1's handful of brands, but at very large counts it can hit Inngest per-run step
  limits. Batch if the brand count ever grows large. (Rate-limiting itself is correct.)
- **`lib/audit/runner.ts` naming:** the prompt and handoff both name the audit entry
  `lib/audit/runner.ts`; in the Phase-2 Sprint-1 review the LLD's canonical name appeared as
  `run-audit.ts`. The fix's Phase-1 investigate step will surface the real filename — just have
  Claude Code adapt the import path to whatever actually exists.

---

## 3. HANDOFF SECTION F CHECKLIST — RESULTS

- **F1 Completeness** — Largely complete. Phase 1 greps for the right patterns; Phase 2 migration
  is additive/idempotent; Phase 4 covers the categories Section F1 lists (design, accounting, CRM,
  HR, trades, allied health, legal, fintech, property, e-commerce, project management, helpdesk,
  marketing automation) ✓. Gaps: Phase 3's mock guard is present **but** model selection +
  interface need work (F-04); Phase 5 wires both the creation trigger and the runner fallback, but
  the trigger mechanism is fragile (F-03) and the runner's *cached* path is region-broken (F-01).
- **F2 Safety** — Migration `IF NOT EXISTS`/`IF EXISTS` ✓; rollback drops nullable columns ✓; mock
  fixture is structurally valid ✓; backfill is rate-limited ✓; runner fallback never returns empty
  (3 tiers, final tier = existing `getPromptsForVertical`) ✓. **But** the "truly non-blocking"
  requirement is met in the wrong way (F-03), and the Drizzle/SQL nullability disagree (F-05).
- **F3 Architecture consistency** — `build-prompt-pack` is pure logic (no LLM, synchronous) ✓;
  Inngest backfill follows `createFunction({id,name},{event},handler)` ✓; files in correct dirs ✓.
  **But** `classify-brand` doesn't actually select Haiku and assumes the LLM interface (F-04).
- **F4 Prompt template quality** — Templates are **market** queries, not brand queries ✓; trades/
  allied-health/real-estate/hospitality use `{region}` ✓; the 60/40 market/enriched split is correct
  and the enriched (brand/competitor) prompts are correctly separated into the 40% ✓; `general`
  fallback is sufficient (`smb` is the universal sub-fallback) ✓. **But** the parent-category
  fallback chain is broken for multi-word parents (F-02).
- **F5 Potential gaps** — region default handled in the runner but **not** in the storage path
  (F-01); `getLLMService` interface needs verification (F-04); no classification-status UI is
  intentional ✓; the `serve()` count change is real and needs the Phase-2 update (F-06).

---

## 4. CLEAN — verified good (not manufacturing problems)
- **Migration** is fully additive: 5 nullable columns, `ADD COLUMN IF NOT EXISTS`, a partial index
  scoped to `('pending','failed')`, and a rollback that drops them safely.
- **Mock discipline** is correct: `LLM_MODE==='mock'` short-circuits to a structurally valid
  `MOCK_CLASSIFICATION`, so the full downstream (buildPromptPack → store) is testable without a
  real call.
- **3-tier runner fallback** is sound and backward-compatible: stored pack → build-on-the-fly →
  existing vertical pack; existing brands keep working unchanged.
- **build-prompt-pack** is pure (template select + shuffle + dedup + pad), never returns empty,
  resolves `{category}`/`{brandName}` tokens, and keeps the 60/40 mix.
- **No major security issue:** the malformed-LLM path is guarded (`try/catch` around `JSON.parse`,
  required-field check, confidence clamp); classification is stored as JSONB via Drizzle (no
  injection); prompt-injection-via-brand-name is low-risk and bounded by output validation.
- **Template coverage** matches the F1 list and uses underscore_case consistent with
  `BrandClassification.category`.

---

## 5. NEXT STEP
Apply the four MODERATE code fixes before Claude Code runs this — they're small and localized:
- **F-01**: select + pass `brand.region` in `classify-and-store.ts`.
- **F-02**: parent key = `split('_').slice(0,-1).join('_') + '_general'` in `templates.ts`.
- **F-03**: fire a `brand/created` Inngest event + a small classify function (or, if staying on a
  persistent server, document the no-retry caveat).
- **F-04**: route classification through model-selector's Haiku/cheap-model selector and confirm
  the `complete()` signature during Phase 1 investigation.
- **F-05** (LOW): align the SQL to `NOT NULL DEFAULT 'pending'`.
- **F-06** (Sri, cross-artifact): bump the Phase-2 prompts' `serve()` "25" → 26.

With F-01–F-04 applied, the fix is ready: the design is right, the structure is thorough, and
these are targeted corrections — not a redesign. The clearest validation remains the handoff's
own Section G test: a Canva re-audit should move 34.4 → 80–95+ with design-specific, correctly
region-tokened prompts.

— End of SMART-PROMPT-PACK-FIX-FINDINGS.md
