# Built-UI Review — /brands/[brandId]/brand-entity-audit (D6) vs prototype + canon
# Reviewer: independent reviewer chat | Date: 19 Jun 2026
# Reviewed: the built Brand & Entity Audit page (2 screenshots, Bondi Plumbing) vs the prototype
#   BrandEntityAudit (proto L3093) + Sprint 7 canon (EE4 + brand_entity_scores schema).

---

## 1. VERDICT — PASS (clean; build correctly follows canon over the prototype)

This is a faithful, canon-correct build with **no issues requiring a fix**. Notably, where the
prototype and canon disagreed (the EE4 5-rows-vs-4-sources point), the build correctly implemented
the **canon** model, not the prototype's display. Every weighting, the score arithmetic, the
directory list, and the data source all match canon.

---

## 2. VERIFIED AGAINST CANON (each confirmed by grep)

### The EE4 prototype-vs-canon conflict — resolved correctly ✓
- **The prototype shows 5 signal rows** (proto L3116–3120): ABN Lookup verification, Wikipedia AU,
  AU TLD, AU directory aggregate, **+ a 5th "Australian Business Register match"**.
- **Canon EE4 (S7 L293–299) explicitly says this is wrong-by-display:** the 5th row "IS the ABN
  Lookup result (same ABR API call)… Do NOT add a 5th schema column." The real model is **4 data
  sources**, scored **ABN(3) + Wikipedia AU(3) + AU TLD(2) + AU Directory(2) = /10**.
- **The build shows exactly 4 Entity Signals rows** — ABN Lookup Verification (0/3), Wikipedia AU
  Presence (0/3), Australian TLD (2/2), AU Directory Aggregate (0/2). It did **not** render the
  prototype's 5th row. ✓ This is the correct "LLD wins over the prototype" outcome — the build
  collapsed the ABN display to one row and used the 4-source scoring. (EE4 permits an optional
  two-row ABN split "for clarity"; the build chose the single-row form, which is equally compliant.)

### Score composition + arithmetic ✓
- Per-row weightings match canon exactly: ABN **/3**, Wikipedia **/3**, AU TLD **/2**, AU Directory
  **/2** (S7 L299).
- The total reconciles: **2/10 = 0 (ABN) + 0 (Wikipedia) + 2 (AU TLD) + 0 (Directory)**. The header
  "2/10" and the per-row scores are internally consistent.
- `scoreBrandEntity` is a `/10` column feeding the **Authority** rollup (`authorityPct =
  scoreBrandEntity / 10 × 100`, S7 L379–380). The page reads the column + the `brandEntity` findings
  key — correct source, no scoring perturbation.

### AU Directory Presence section ✓
- The four directories listed — **Hipages, Yellow Pages AU, ServiceSeeking, Word of Mouth** — match
  canon's named AU directory set exactly (S7 L38, L291 `au-directory-aggregate.ts`). All showing
  "Not found" is consistent with the AU Directory Aggregate scoring 0/2.

### Data correctness for this brand ✓
- bondiplumbing.com.au → AU TLD passes (2/2), green check — correct.
- No ABN verified (0/3), not on Wikipedia (0/3), 0 directories (0/2) — all consistent with a small
  brand with no entity footprint; the X marks and amber/neutral treatment are right.

### Presentation ✓
- Title "Brand & Entity Audit", subtitle "AU-localised brand presence signals · Score: 2/10", the
  top-right 2/10, breadcrumb "Brand & Entity" — all on-spec and matching the prototype's intent
  (the "AU-localised" framing). The pass/fail row icons (✓ green / X) and the /3, /2 right-aligned
  scores follow the design system. The two-section layout (Entity Signals + AU Directory Presence)
  is a sensible elaboration of the prototype's single signal list.

---

## 3. ISSUES
**None requiring a fix.** No scoring, data-source, schema, or canon-fidelity problems found. The page
is build-ready as-is.

### Optional / awareness only (NOT fixes)
- **O-1 (cosmetic, no action):** the prototype includes a "Why this matters" closing info box (proto
  L3143–3148, the entity-verification 2–3× citation explainer). The built page (as captured) doesn't
  show one — but the screenshots may be cut off before it, and it's a presentational nicety, not a
  canon requirement. If you want full prototype parity you could add it, but it's not an issue.
- **O-2 (already-correct design choice):** the single-row ABN presentation (vs EE4's optional
  two-row split) is fully compliant — flagging only so it's a conscious choice, not a surprise later.

---

## 4. SUMMARY FOR SRI
D6 Brand & Entity is **clean — no fix prompt needed.** The build correctly resolved the EE4
prototype-vs-canon discrepancy by implementing the 4-source model (ABN/Wikipedia/TLD/Directory =
3/3/2/2 = /10) rather than the prototype's 5-row display, the 2/10 arithmetic is consistent, the four
AU directories match canon, and the score feeds the Authority rollup correctly. The only optional
item is the "Why this matters" box (cosmetic parity), which may simply be below the screenshot fold.

This is the most canon-faithful page of the Sprint 7 sub-pages reviewed so far. Ready to move on to
**D7 citability** whenever you are.

— End of review.
