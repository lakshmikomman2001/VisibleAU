# VisibleAU — Temporary ABN Lookup bypass (while awaiting the ABR GUID) — Claude Code prompt
# Goal: keep ABN verification CODE intact but let real-LLM testing proceed before the government GUID
#   arrives. The bypass must be FLAG-GATED, loudly visible, and trivially reversible — NOT a code
#   deletion or a silent edit. When the GUID arrives, flipping the flag re-enables the real check with
#   zero code changes.
# Pins to: lib/brand-entity/abn-lookup.ts + the brand_entity score path. TS strict; str_replace/
#   exact-literal only. This touches a SCORING input, so read the safety rules carefully.

╔═══════════════════════════════════════════════════════════════════════════════╗
║ SAFETY FRAME (this is an auditing/trust product — read before coding)           ║
║ • The ABN check is a LEGITIMACY signal. A bypass that fabricates "verified" is   ║
║   dangerous if it ever leaks to a real report — it would mark an unverified      ║
║   business as verified. So:                                                      ║
║   – DEFAULT behaviour = HONEST SKIP (ABN scores 0/3, UI says "check unavailable",║
║     NOT "verified"). No fake data in the scoring path.                           ║
║   – An optional MOCK-VERIFIED mode exists for UI screenshots ONLY, is gated      ║
║     behind a SEPARATE explicit flag, refuses to run in prod, and logs loudly.    ║
║ • Bypass state must be OBVIOUS in logs and the UI so no one mistakes it for real. ║
║ • Re-enabling = flip one env flag. No code revert needed.                        ║
╚═══════════════════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════════════════════
STEP 1 — Add the bypass flag (honest-skip default)
═══════════════════════════════════════════════════════════════════════════════

> In `lib/brand-entity/abn-lookup.ts`, at the top of the lookup function (before the real ABR fetch),
> add a flag check:
> - Read `ABN_LOOKUP_BYPASS` from env (default OFF / unset = normal real behaviour).
> - When `ABN_LOOKUP_BYPASS === 'skip'` (the honest-skip mode):
>   - Do NOT call the ABR API.
>   - Return the existing graceful-failure shape: `{ abnVerified: false, abnStatus: null,
>     abnNumber: <the input abn or null> }` — i.e. ABN scores 0/3 exactly as a real "unverified"
>     result would, so the composite/rollup math is unchanged and valid.
>   - Add a distinct status marker the UI can read to explain WHY (see Step 3) — e.g. include
>     `abnStatus: 'check_skipped'` (or a separate `abnCheckSkipped: true` field if cleaner) so the UI
>     can say "check unavailable" instead of "no ABN verified". Pick whichever fits the existing return
>     type with the least churn; do not break the type.
>   - `console.warn('[ABN] Lookup BYPASSED (skip mode) — ABN_LOOKUP_BYPASS=skip; real check disabled
>     pending GUID')` so every run that uses the bypass says so in the logs.
> - When `ABN_LOOKUP_BYPASS` is unset/empty → behave EXACTLY as today (real ABR call). This is the
>   path that resumes automatically once you remove the flag after the GUID lands.
>
> Do NOT change the scoring formula, the other three sources (Wikipedia/TLD/Directory), or any other
> dimension. The /10 still = ABN(3)+Wikipedia(3)+TLD(2)+Directory(2); in skip mode ABN simply
> contributes 0, which is honest (we genuinely haven't verified it).

═══════════════════════════════════════════════════════════════════════════════
STEP 2 — (OPTIONAL) Mock-verified mode for UI checks — SEPARATE flag, prod-guarded
═══════════════════════════════════════════════════════════════════════════════

> Only if Sri wants to see the "verified" UI state before the GUID arrives. This injects FAKE data, so
> it is tightly fenced:
> - Trigger ONLY when `ABN_LOOKUP_BYPASS === 'mock-verified'` AND `NODE_ENV !== 'production'` AND
>   `LLM_MODE !== 'real'`. If `ABN_LOOKUP_BYPASS === 'mock-verified'` is set while in prod/real mode,
>   do NOT mock — instead `console.error` a loud refusal and fall back to honest-skip. (A trust
>   product must never emit a fabricated "verified" in a real report.)
> - When it does fire, return a clearly-synthetic verified result: `{ abnVerified: true,
>   abnStatus: 'Active', abnNumber: <input>, entityName: 'MOCK — ABN check bypassed' }` (or wire the
>   mock entity name through whatever field the UI shows) so the fake is self-labelling on screen.
> - `console.warn('[ABN] MOCK-VERIFIED bypass active — FAKE data, dev/mock only. NOT for real
>   reports.')`.
> If Sri doesn't need the verified-state UI, SKIP this step entirely — honest-skip (Step 1) is enough
> to validate everything else.

═══════════════════════════════════════════════════════════════════════════════
STEP 3 — UI: show the bypass reason honestly
═══════════════════════════════════════════════════════════════════════════════

> On the Brand & Entity page's ABN Lookup row (grep the component — `signals` list / the ABN row in
> the brand-entity sub-page), when the result carries the skip marker from Step 1
> (`abnStatus === 'check_skipped'` / `abnCheckSkipped`):
> - Show the row as a NEUTRAL/pending state (not a red "fail" and not a green "verified"): title "ABN
>   Lookup Verification", sub-text "Check temporarily unavailable — verification pending" (instead of
>   "No ABN verified"), score still 0/3.
> - Keep the normal real states (verified ✓ / unverified ✗) untouched for when the flag is off.
> This way, during testing, a 0/3 ABN reads as "we couldn't check yet", not "this brand failed
> verification" — so you don't misread the validation results.

═══════════════════════════════════════════════════════════════════════════════
STEP 4 — Wire-up note + re-enable instructions
═══════════════════════════════════════════════════════════════════════════════

> 1. In `.env.prod` (and `.env.dev` if you want it there too), add:
>    `ABN_LOOKUP_BYPASS=skip`   # TEMPORARY — remove when ABN_LOOKUP_GUID is set
> 2. Leave `ABN_LOOKUP_GUID` absent for now (that's fine — the bypass means it's never read).
> 3. **To re-enable the real check when the GUID email arrives:** set `ABN_LOOKUP_GUID=<guid>` in
>    `.env.prod` AND remove (or unset) `ABN_LOOKUP_BYPASS`. No code change — the unset flag falls
>    straight back to the real ABR path. Re-run the brand audit; ABN should now verify for real.
> 4. Add a one-line code comment at the flag check: `// ABN_LOOKUP_BYPASS: temporary — real ABR check
>    resumes automatically when this is unset and ABN_LOOKUP_GUID is provided.`
>
> **Verify before reporting done:**
> - With `ABN_LOOKUP_BYPASS=skip`: a brand audit completes, makes NO ABR network call, ABN row shows
>   "check temporarily unavailable / pending" at 0/3, the /10 + composite + rollup compute correctly,
>   and the warn log fires. All OTHER brand-entity sources (Wikipedia/TLD/Directory) and every other
>   Sprint 1–7 feature run normally on real data.
> - With the flag unset (simulate having the GUID): the code path calls the real ABR (will fail
>   without a GUID, but confirm it ATTEMPTS the call — proving the real path is intact and will work
>   once the GUID is added).
> - If Step 2 was implemented: confirm `mock-verified` REFUSES in prod/real mode (loud error + falls
>   back to skip), and only mocks in dev.
> - `npm run typecheck` passes; the abn-lookup unit tests still pass (add a skip-mode test asserting
>   no fetch + the 0/3 honest result).
> Report the files changed and confirm the re-enable steps.

─────────────────────────────────────────────────────────────────────────────

## Notes for Sri (not part of the paste)
- **Recommended: use `skip` mode** (Step 1 + 3 only). It lets the full real-LLM validation run now —
  Wikipedia, TLD, directories, multidim audit, technical audit, Action Center, everything — with ABN
  honestly showing 0/3 "pending" until your GUID arrives. Nothing fake enters a report.
- **`mock-verified` (Step 2) is optional** and only for eyeballing the green "verified" UI state. It's
  fenced so it can't fire in prod/real — because a trust product fabricating "verified" in a real
  audit is the one thing we must not risk. Skip it unless you specifically want that screenshot.
- **Re-enabling is one env change** — add the GUID, drop the flag. The feature was never deleted, just
  short-circuited behind a flag.
- For your Brand & Entity validation against the real test brand (Asset Plumbing Solutions, ABN
  58 110 395 714): with `skip` on, expect ABN 0/3 "pending"; once the GUID lands and you unset the
  flag, that same brand should verify to 3/3 — a nice before/after confirmation the wiring works.
- This pairs with the FLAG 1 fix (the `brands.abn` column) — you'll still want that so there's an ABN
  to pass once the real check is on. Skip mode works regardless, but the real check needs both the
  GUID and the column.
