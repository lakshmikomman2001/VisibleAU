# VisibleAU — Local SEO page: add the GMB card (the one in-scope Sprint 8 gap) — Claude Code prompt
# Scope verified against canon (sri-visibleau-sprint-8-prompt.md) + prototype (visibleau-prototype.jsx
#   LocalSeoDashboard L3216). This implements ONLY what Sprint 8 specifies and DELIBERATELY excludes
#   the items canon defers to Sprint 9 / marks prototype-only.
# Pins: GMB data shape canon L208-209; render-list canon L1432; component files canon L871-875;
#   prototype GMB card L3243-3253. TS strict; design tokens only; both themes; str_replace/exact-literal.

╔═══════════════════════════════════════════════════════════════════════════════╗
║ WHAT THIS DOES / DOESN'T DO (scope is verified — do not exceed it):              ║
║ • DO #2: add a dedicated GMB card (per-field detail) — canon L1432 lists "GMB     ║
║   card" as a separate render item from the GMB% KPI; backed by real S8 data.      ║
║ • DO #3 (trivial): add the page subtitle copy.                                    ║
║ • DO #4 (optional/organizational): split into the 4 component files canon names.  ║
║ • DO NOT #1: do NOT enrich the directory table with reviewCount/avgRating/LLM-    ║
║   weight/filters/Action-CTAs. Canon FG5 (L226-229): reviewCount & avgRating are   ║
║   NULL in Sprint 8 by design (Sprint 9 deep-parses). LLM weight / filters / CTAs  ║
║   are PROTOTYPE-ONLY aspirations, not in the sprint prompt. Building them would    ║
║   fabricate data that doesn't exist yet. Leave the directory list as-is.          ║
╚═══════════════════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════════════════════
STEP 0 — Confirm the GMB data that Sprint 8 actually produces (read-only)
═══════════════════════════════════════════════════════════════════════════════

> The card must render ONLY fields that exist in the Sprint 8 audit result. Confirm in the codebase
> what `gmb-check.ts` / `local_seo_results` actually persist for GMB. Per canon L208-209 the GMB result
> maps to: `{ name, address, phone, hours, photosCount, reviewCount, avgRating }` and
> `gmbCompleteness = (name+address+phone+hours+photos+reviews present ÷ 6 × 100)`.
> - Report which of these are populated in a real S8 result vs null. (reviewCount/avgRating MAY be
>   present from the Places API for GMB itself — that's fine; the FG5 null-in-S8 rule is about the
>   *directory* table, not GMB. Confirm which GMB fields are non-null.)
> - Confirm whether NAP match status (name/address/phone match between website and GMB) is available —
>   it's computed by `nap-consistency.ts` (the NapSource comparison), NOT by gmb-check. The card's
>   "Match/Mismatch" badges must be DERIVED from that comparison or from completeness, not invented.
> **Report** the exact GMB fields available and whether per-field match status can be derived. This
> determines what the card can honestly show.

═══════════════════════════════════════════════════════════════════════════════
STEP 1 — Add the GMB card (#2 — the real gap)
═══════════════════════════════════════════════════════════════════════════════

> On `/brands/[brandId]/local-seo`, add a "Google Business Profile" card in the row beneath the 4 KPI
> cards (the prototype pairs it two-up with the NAP card — match that layout). Match the prototype's
> design (proto L3243-3253): a titled Card with label↔badge rows.
>
> **Render ONLY honest data** — use what Step 0 confirmed exists. Two acceptable shapes depending on
> what's available:
> - **If per-field website↔GMB match status IS derivable** (from nap-consistency): show match rows like
>   the prototype — "Business name", "Phone number", "Address" → Match/Mismatch badge; "Hours" →
>   Match/Mismatch; "Photos" → "{photosCount} photos". Do NOT show "Service area" unless that datum
>   actually exists (the prototype shows it, but confirm it's in the result first — if not, omit it).
> - **If only raw GMB values + completeness exist** (no per-field match): show the GMB field VALUES with
>   present/absent badges — "Business name" → present/—, "Phone" → the value or —, "Address" → value
>   or —, "Hours" → present/—, "Photos" → "{photosCount}", and the completeness % — i.e. reflect the
>   6-field completeness breakdown that feeds the GMB% KPI.
> Pick the shape that matches the real data; do NOT fabricate Match/Mismatch badges if the comparison
> isn't computed. State which shape you used and why.
>
> - If GMB was not found for the brand (ZERO_RESULTS / gmb.present=false), show a clean "No Google
>   Business Profile found" state in the card, not a crash or empty badges.
> - Wire it from the existing `latestResult` already passed to the view — NO new queries (canon L1429:
>   "All data read from latestResult — no additional queries").

═══════════════════════════════════════════════════════════════════════════════
STEP 2 — Add the subtitle (#3 — trivial copy)
═══════════════════════════════════════════════════════════════════════════════

> Under the "Local SEO" page title, add the prototype's description line (proto L3221):
> "Local SEO and GEO are linked. We track signals that influence both Google and LLM visibility."
> Use `--text-secondary`, matching the prototype. Pure copy; no logic.

═══════════════════════════════════════════════════════════════════════════════
STEP 3 — (OPTIONAL) Split into the 4 component files (#4 — organizational)
═══════════════════════════════════════════════════════════════════════════════

> Canon L871-875 names four component files. This is organizational (no functional change) — do it if
> keeping structural parity with canon; skip if prioritising velocity. If doing it, extract the
> EXISTING inline sections into:
>   components/domain/local-seo/gmb-card.tsx                  (the Step 1 card)
>   components/domain/local-seo/directory-presence-matrix.tsx (the existing 4-directory list — moved, NOT enriched)
>   components/domain/local-seo/nap-consistency-table.tsx     (the existing NAP source table)
>   components/domain/local-seo/suburb-coverage-card.tsx      (the existing content/meta/schema suburb list)
> The page composes these. Behaviour and rendered output must be IDENTICAL to before the split (pure
> refactor). Do NOT change any section's content while moving it — especially do NOT enrich the
> directory matrix (that's the out-of-scope #1).

═══════════════════════════════════════════════════════════════════════════════
STEP 4 — Verify (against real data) before reporting done
═══════════════════════════════════════════════════════════════════════════════

> - The GMB card renders on the Local SEO page for a brand with a GMB result (e.g. Bondi Plumbing),
>   beneath the KPI row, showing only real fields; the GMB% KPI and the card's detail are consistent
>   (the card's present-field count should reconcile with the completeness %).
> - A brand with no GMB → the card shows the "not found" state, no crash.
> - The directory table is UNCHANGED (still the 4-row Found/Not-found list — no reviews/ratings/CTAs
>   added). Confirm #1 was NOT implemented.
> - Subtitle present. If Step 3 done: output is pixel-identical to pre-split; `npm run typecheck`
>   passes; both light/dark themes intact.
> Report: the GMB card shape used (match-badges vs value/completeness) + why; a screenshot/description;
> confirmation the directory table was left as-is; whether you did the optional Step 3 split.

─────────────────────────────────────────────────────────────────────────────

## Notes for Sri (not part of the paste)
- **The honesty hinge is Step 0/1.** The prototype's GMB card shows "Match/Mismatch" per field, but
  Sprint 8's gmb-check returns raw GMB *values*; the website↔GMB *match* is computed by
  nap-consistency. So the card must DERIVE match status from data that exists, or fall back to showing
  field values + the completeness breakdown. The prompt tells Claude Code to use whichever the real
  data supports and NOT fabricate match badges — important for a trust product (and it's the same
  "no invented data" principle the build already follows well).
- **#1 is deliberately excluded** and the prompt guards against it twice (the box + Step 3's "don't
  enrich while moving"). FG5 defers directory reviewCount/avgRating to Sprint 9; LLM-weight/filters/
  CTAs are prototype aspiration. Building them now = fabricating Sprint 9 data.
- **#3 and #4 are low-stakes** — add the subtitle for fidelity; do the component split only if you
  value structural parity with canon (it's pure refactor, zero user-facing change).
- This is the one legitimate gap from Claude Code's analysis (which was accurate). After this, the
  Local SEO page is fully canon-complete for Sprint 8.
- Per your relay discipline: this touches a built page's display only (no scoring/schema), so it's
  lower-risk — but a quick reviewer pass on the GMB card's "what match status is real vs derived" is
  the bit worth a second look.
