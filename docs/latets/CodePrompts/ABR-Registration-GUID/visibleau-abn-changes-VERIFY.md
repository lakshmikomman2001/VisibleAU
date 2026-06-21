# VisibleAU — VERIFY the ABN changes on real data (migration + refusal guard + e2e) — Claude Code
# Purpose: turn "reported done" into "verified on real data" for the FLAG 1 (brands.abn) + ABN bypass
#   changes. This is a CHECK — confirm with real commands/reads, do NOT re-implement. No paid API
#   calls needed (bypass is in skip mode). Report PASS/FAIL per check with the evidence.

═══════════════════════════════════════════════════════════════════════════════
CHECK 1 — Did the brands.abn migration actually apply to BOTH databases?
═══════════════════════════════════════════════════════════════════════════════

> A schema-file edit (`abn: text("abn")`) is NOT the same as the column existing in the DB. Confirm
> the migration was generated AND applied to both dev and prod databases.
> 1. Confirm a Drizzle migration for the `abn` column exists in the migrations folder (a generated
>    SQL file adding `abn` to `brands`). If only the schema TS was edited and no migration file was
>    generated, that's a FAIL — generate it (`drizzle-kit generate`) and report.
> 2. Verify the column EXISTS in both DBs (these are the two from the isolation report:
>    `visibleau` (dev) and `visibleau_prod` (prod)). Run, against each:
>    `psql visibleau     -c "\d brands"`   → expect an `abn` column (text, nullable)
>    `psql visibleau_prod -c "\d brands"`   → expect an `abn` column (text, nullable)
>    (or the equivalent `information_schema.columns` query: SELECT column_name,data_type,is_nullable
>     FROM information_schema.columns WHERE table_name='brands' AND column_name='abn';)
> 3. If the column is present in one DB but not the other, that's the classic gap — apply the
>    migration to the missing one and re-confirm.
> **Report:** migration file exists? (path) · `abn` column present in visibleau? (yes/no) · in
> visibleau_prod? (yes/no). All must be yes.

═══════════════════════════════════════════════════════════════════════════════
CHECK 2 — Is the mock-verified refusal guard airtight for a LOCAL prod run?
═══════════════════════════════════════════════════════════════════════════════

> The danger: a local prod-DB run may have `NODE_ENV=development` (not a deployed build) while
> `LLM_MODE=real`. The mock-verified bypass MUST refuse based on `LLM_MODE === 'real'`, not rely on
> `NODE_ENV==='production'` alone — otherwise a local real run could emit fabricated "verified" data.
> 1. Read the guard in `lib/brand-entity/abn-lookup.ts` and quote the exact condition that gates
>    `mock-verified`. Confirm it refuses (falls back to honest-skip + `console.error`) whenever
>    `LLM_MODE === 'real'` — independent of `NODE_ENV`.
> 2. If the guard only checks `NODE_ENV` (or ORs them in a way that lets `LLM_MODE=real` +
>    `NODE_ENV=development` through), that's a FAIL — fix it so `LLM_MODE==='real'` alone forces
>    refusal. (Keep the `NODE_ENV==='production'` refusal too; just don't depend on it solely.)
> 3. Confirm the existing unit test for the refusal actually exercises the `LLM_MODE='real'` +
>    `NODE_ENV` not-production combination. If it only sets `NODE_ENV='production'`, add/adjust a case
>    so the real-mode refusal is covered for the local-prod scenario.
> **Report:** quote the guard condition · does `LLM_MODE='real'` alone force refusal? (yes/no) · is
> that combination unit-tested? (yes/no).

═══════════════════════════════════════════════════════════════════════════════
CHECK 3 — End-to-end: create a brand WITH an ABN (proves column + API + form align)
═══════════════════════════════════════════════════════════════════════════════

> The three layers (schema, create API, create form) must line up — a column that exists but isn't
> wired through still fails on insert. Verify the whole path on real data (skip mode, no paid API):
> 1. Through the create flow (UI or the API directly), create a brand with an ABN set —
>    use the test brand: name "Asset Plumbing Solutions", domain assetplumbingsolutions.com.au,
>    ABN 58110395714 (11 digits, no spaces). Confirm it SAVES with no "unknown column" / validation
>    error, and that `brands.abn` is populated for that row (query it back).
> 2. Confirm the ABN validation works as specified: a bad ABN (e.g. "123") is rejected by the
>    11-digit rule; an empty ABN is allowed (optional field).
> 3. Run the technical audit for that brand (skip mode is fine — no ABR call). Confirm:
>    - the audit completes; `lookupAbn` receives `brand.abn` (NOT null) — i.e. the FLAG 1 wiring is
>      live (you can confirm via a log/trace that the value passed is the brand's ABN, even though
>      skip mode short-circuits before the fetch);
>    - the Brand & Entity page ABN row shows the ⏳ "Check temporarily unavailable — verification
>      pending" state (skip mode), NOT a crash and NOT a fake "verified".
> **Report:** brand saved with abn populated? (yes/no) · bad ABN rejected / empty allowed? (yes/no) ·
> audit passes brand.abn to lookupAbn (not null)? (yes/no) · ABN row shows the pending state? (yes/no).

═══════════════════════════════════════════════════════════════════════════════
CHECK 4 — Did abnStatus-in-findings change anything it shouldn't?
═══════════════════════════════════════════════════════════════════════════════

> The change also persisted `abnStatus` in findings. Confirm this is additive/display-only:
> - it does NOT alter the brand-entity /10 scoring, the composite, or the rollup;
> - it does NOT remove/rename existing `brand_entity_scores` fields (`abnVerified`, `abnNumber`,
>   `abnEntityName`, `abnStatus`).
> **Report:** scoring unchanged? (yes/no) · existing fields intact? (yes/no).

─────────────────────────────────────────────────────────────────────────────

## FINAL REPORT
> Give a single PASS/FAIL table for CHECK 1–4, each with the concrete evidence (the `\d brands`
> output snippet, the quoted guard condition, the saved brand's abn value, etc.). For any FAIL, state
> the fix applied. End with: are the ABN changes verified on real data, and is the system safe to run
> the broader real-LLM validation (Part B) with ABN in skip mode?

## Notes for Sri (not part of the paste)
- **CHECK 1 is the most likely gap** — schema edited but migration not applied to one/both DBs. If
  that's the only FAIL, it's a quick fix (apply the migration) and everything else stands.
- **CHECK 2 is the safety one** — the local-prod `NODE_ENV` edge case is the realistic way a fabricated
  "verified" could slip through; this confirms `LLM_MODE='real'` alone blocks it.
- After this passes, the rest of the real-LLM Part B validation can proceed with ABN honestly at 0/3
  "pending" until your GUID arrives — then run the RE-ENABLE prompt for the 0/3→3/3 before/after.
