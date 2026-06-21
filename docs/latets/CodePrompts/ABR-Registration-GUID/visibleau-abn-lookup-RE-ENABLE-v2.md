# VisibleAU — RE-ENABLE the real ABN Lookup (after the ABR GUID arrives) — Claude Code prompt
# v2 — rewritten against the ACTUAL implementation (verified on real data), not the generic plan.
# Use this when the government emails your ABN_LOOKUP_GUID.
#
# Confirmed state going in (already verified — do NOT redo these):
#   • brands.abn column EXISTS in both visibleau (dev) + visibleau_prod (prod), text/nullable
#     (applied via drizzle-kit push --force; this project has NO migrations folder — that's expected).
#   • lib/audit/run-technical-audit-inline.ts already passes brand.abn to lookupAbn() (FLAG 1 done).
#   • abn-lookup.ts bypass guard at line ~20:
#       if (process.env.NODE_ENV === "production" || process.env.LLM_MODE === "real")  → blocks mock.
#       ABN_LOOKUP_BYPASS=skip → honest 0/3, abnStatus "check_skipped", no fetch, warns.
#       unset → real ABR call (the path this prompt activates).
#   • findings persists abnStatus (display-only; brandEntityScore() reads abnVerified only).
#   • Test brand "Asset Plumbing Solutions" (assetplumbingsolutions.com.au) already created with
#     abn = 58110395714.
# So re-enabling is essentially: add the GUID, drop the flag, prove the real call now fires + verifies.
# str_replace/exact-literal only; this touches a scoring input — verify on real data, don't assume.

═══════════════════════════════════════════════════════════════════════════════
STEP 1 — Add the GUID, remove the bypass flag (env only — no code change expected)
═══════════════════════════════════════════════════════════════════════════════

> 1. In `.env.prod`: set `ABN_LOOKUP_GUID=<the-guid-from-the-ABR-email>` (do NOT print the value in
>    any output — confirm set/unset only).
> 2. In `.env.prod`: remove (or comment out) `ABN_LOOKUP_BYPASS=skip`.
> 3. Decide on `.env.dev`: it also has `ABN_LOOKUP_BYPASS=skip`. LEAVE dev in skip mode (dev should
>    stay mock/free — no real ABR calls in dev). Only prod gets the real check. Confirm dev keeps the
>    flag.
> 4. Read `lib/brand-entity/abn-lookup.ts` and confirm that with `ABN_LOOKUP_BYPASS` unset, control
>    reaches the real `fetch` to `abr.business.gov.au/.../JsonAbnLookup?guid=...&abn=...` (not the
>    skip branch, not the mock branch). The bypass was built to fall through to the real path on an
>    unset flag, so NO code edit should be needed — confirm that's true. If for some reason the real
>    path doesn't execute on an unset flag, fix only that.
> **Report:** ABN_LOOKUP_GUID set in prod? · ABN_LOOKUP_BYPASS removed from prod? · still skip in dev?
> · real fetch path reached when flag unset? (yes to all).

═══════════════════════════════════════════════════════════════════════════════
STEP 2 — Confirm the real ABR response mapping (read-only, against canon)
═══════════════════════════════════════════════════════════════════════════════

> Verify `abn-lookup.ts` maps the real ABR JSON correctly (it may have been stubbed/untested on the
> real path until now since the GUID was never present):
> - Success response `{ Abn, AbnStatus: 'Active'|'Cancelled', EntityName, BusinessName[],
>   AddressState, AddressPostcode }` → stored as `abnVerified` (true when an Active ABN is returned
>   and matches the business), `abnNumber`, `abnEntityName`, `abnStatus`.
> - Error cases intact: not-found → unverified; 429 → retry once after 2s then graceful fail;
>   network error → `{ abnVerified: false, abnStatus: null }`.
> - A verified Active ABN contributes the full **3** to the /10 (ABN(3)+Wikipedia(3)+TLD(2)+Dir(2)).
> Report any drift from this shape and fix ONLY if it diverges; otherwise leave the logic alone.

═══════════════════════════════════════════════════════════════════════════════
STEP 3 — Live proof on the existing test brand (the 0/3 → 3/3 before/after)
═══════════════════════════════════════════════════════════════════════════════

> In PROD mode (real DB + LLM_MODE=real), with GUID set and bypass off:
> 1. The test brand **Asset Plumbing Solutions** already has `abn = 58110395714`. Confirm that's still
>    set (query brands.abn); if not, set it.
> 2. Re-run the technical audit for that brand. Confirm the ABR API IS now called — a real network
>    request to abr.business.gov.au carrying the GUID — and the skip warn (`[ABN] Lookup BYPASSED…`)
>    NO longer appears.
> 3. On the Brand & Entity page, confirm the ABN Lookup row now shows a REAL result:
>    - expected for this active ABN: **verified ✓**, AbnStatus **Active**, entity name populated,
>      score **3/3**; the ⏳ "check temporarily unavailable — verification pending" state is GONE.
>    - the brand-entity total rises by ~3 vs the skip-mode run (e.g. the earlier 2/10 → ~5/10 if only
>      ABN changes), and the composite rises accordingly. This delta is the proof the wiring works.
> 4. Negative path still graceful: a brand with no abn set, or a bogus abn → 0/3 "unverified" (not a
>    crash, not "check_skipped" — that marker is only for skip mode).
>
> **Verify before reporting done:**
> - prod: GUID set, bypass off; dev: still skip.
> - Audit makes a real ABR call for the test brand; ABN row = verified ✓ Active 3/3.
> - brand-entity /10 + composite recompute upward with ABN now contributing 3 (report before/after).
> - No "check_skipped" pending state remains for a successfully-verified brand.
> - `npm run typecheck` passes. Update the abn-lookup unit tests: the skip-mode + mock-refusal tests
>   stay; ADD/confirm a real-success-path test (mock the ABR fetch to return an Active ABN → asserts
>   abnVerified true + 3/3) and a not-found test. Do NOT delete the skip test — skip mode still exists
>   for dev and as a fallback.
> Report: env changes made; whether any code change was needed; and the test brand's ABN score
> before (skip) vs after (real) — should read 0/3 → 3/3.

─────────────────────────────────────────────────────────────────────────────

## Notes for Sri (not part of the paste)
- **This is now env-only in the expected case** — add GUID, drop the prod flag. The bypass was built
  to fall through to the real path automatically, and FLAG 1 (brands.abn + wiring) is already done and
  verified, so there's no schema/pipeline work left. Step 1.4 just confirms the fall-through.
- **Keep dev in skip mode** — you don't want dev iteration making real (rate-limited) ABR calls; only
  prod needs the live check.
- **The before/after is your confidence check:** same brand, ABN 0/3 "pending" → 3/3 verified Active.
  If it doesn't flip, Step 3 pinpoints which of {GUID set, flag off, abn populated, real fetch reached}
  is missing.
- **Don't delete the bypass code** — leave it dormant (flag off). If the GUID is ever rotated/revoked
  or the ABR has an outage, you re-skip in one env change. The Step-3 test note keeps the skip test.
- After this, ABN is fully live and a Part B real-LLM run shows Brand & Entity on entirely real data
  (FLAG 1 + FLAG 2 both closed).
- Reminder on schema approach: this project uses `push --force`, so there's no migration trail — fine
  for now, but if you later need reproducible/rollback-able schema changes across envs, that's the
  thing to revisit (unrelated to ABN; just noting since it surfaced during verification).
