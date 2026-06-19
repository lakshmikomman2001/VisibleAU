# VisibleAU — Smart Prompt Pack FIX-PROMPT REVIEW (PASS 2 — v1.1 validation + new-section audit)
# Reviewer: independent reviewer chat | Date: June 2026
# Reviewing: fix-brand-smart-prompt-pack.md **v1.1** ("vertical pack UI reconciliation added")
# Prior review: SMART-PROMPT-PACK-FIX-FINDINGS.md (v1.0) — findings F-01…F-06.
# This pass: (1) validate the v1.0 findings against v1.1, (2) audit the NEW content (Phase 5b).

---

## 1. HEADLINE — the v1.1 added Phase 5b but did **NOT** apply F-01…F-05

I verified each prior finding against the actual v1.1 text (line-level). **The four MODERATE
code bugs and the one LOW item are all still present, byte-for-byte unchanged.** The v1.1 bump
was solely for the new Phase 5b (UI reconciliation); none of my code findings were applied.

| Finding | v1.1 status | Evidence (v1.1 line) |
|---------|-------------|----------------------|
| **F-01** stored pack ignores region | **NOT applied** | L320 still `buildPromptPack(classification, brand.name, brand.domain)` — no region arg; the `classify-and-store` SELECT still omits `brands.region` |
| **F-02** parent-fallback multi-word bug | **NOT applied** | L706 still `category.split('_')[0] + '_general'` |
| **F-03** un-awaited classification | **NOT applied** | L851 still `classifyAndStoreBrand(newBrand.id).catch(…)`; no `brand/created` event |
| **F-04** Haiku not selected + interface | **NOT applied** | L215 still `const llm = getLLMService();` (no model arg); L228 still `llm.complete({ prompt, maxTokens, temperature })` |
| **F-05** SQL/Drizzle nullability | **NOT applied** | L94–96 still `classification_status TEXT CHECK(…) DEFAULT 'pending'` (no `NOT NULL`); comment still says "all columns nullable" |
| **F-06** serve() 25→26 (Phase-2 docs) | **Can't verify here** | action is on the Phase-2 prompts, not this file — still outstanding unless done separately |

If you intended this v1.1 to carry the F-01…F-05 fixes, **this uploaded copy isn't that
version** — it's v1.0 + Phase 5b. The four moderate bugs from the last review still need to be
applied before Claude Code runs this (full detail + minimal fixes are in the v1.0 findings doc;
re-summarised in §3 below so you have them in one place).

---

## 2. NEW CONTENT — Phase 5b (vertical pack UI reconciliation): **reviewed, essentially clean**

Phase 5b reconciles the two-prompt-system UI conflict spotted in the live Sprint 5 Vertical
Pack Browser. It's well-scoped: cosmetic label + a count-semantics change + copy + a tooltip;
**no schema changes, no new files** — consistent with the additive spirit of the whole fix.

- **5b.1 (Audit Running label)** — `brand.promptPack?.length > 0 ? '(N brand-specific)' :
  '(N from vertical pack)'`. Correct and clearly flagged cosmetic. The count shown is
  `promptCount`, which matches what `getAuditPrompts` actually returns (it pads/truncates to
  `promptCount`), so the number is honest. ✓
- **5b.2 (active-brands count query)** — recount as "brands on this vertical that still use the
  shared pack": `and(eq(vertical, packId), or(isNull(promptPack), status='pending',
  status='failed'))`. Logic is correct across all states (pending/processing/failed →
  `promptPack` is NULL → counted; complete → `promptPack` set → excluded). **Minor:** the
  `status='pending'` / `status='failed'` arms are redundant with `isNull(promptPack)` (a pack is
  only stored on `complete`), so the `or(...)` could just be `isNull(promptPack)` — harmless,
  not a bug. Claude Code will need to import `and`/`or`/`isNull`/`count` from drizzle-orm. ✓
- **5b.3 (card copy)** — "N active brands" → "N brands using pack", plus the VerticalPackDetail
  stat card. Cosmetic. ✓
- **5b.4 (tooltip)** — one-sentence clarifier on the count. Good UX (pre-empts the "why does it
  say 0 when I have 3 SaaS brands?" support question). ✓

### One structural caveat on Phase 5b (ties back to the unapplied findings)
Phase 5b's **visible effect depends on F-01 and F-03 being fixed.** If classification never
reliably completes (F-03 — the un-awaited promise on serverless) or stored packs are region-
broken (F-01), brands stay at `classification_status='pending'` with `promptPack=NULL`
indefinitely — so the 5b.2 count would show **every** brand as "using pack" and the 5b.1 label
would always read "from vertical pack." In other words, 5b is correct logic, but it only
*demonstrates* anything once F-01…F-04 actually work. Worth sequencing the code fixes before (or
with) 5b so the reconciliation is observable.

(The handoff's new Section F6 — Phase 5b checks — aligns with the above; no issue there.)

---

## 3. OUTSTANDING FINDINGS (carried from v1.0 — still required)

These are unchanged from the prior review; minimal fixes restated so they're actionable here:

- **F-01 [MOD]** `classify-and-store.ts`: add `region: brands.region` to the SELECT and pass it —
  `buildPromptPack(classification, brand.name, brand.domain, brand.region ?? 'Australia')`.
  Without it the **cached** pack (the path most audits use) renders every `{region}` as
  "Australia" — wrong for trades / allied-health / real-estate / hospitality / legal (incl. 2 of
  3 core verticals). *(Confirmed by trace last pass: stored = "plumber Australia" vs runner = "plumber Bondi".)*
- **F-02 [MOD]** `templates.ts` `getTemplatesForCategory`: parent key =
  `category.split('_').slice(0, -1).join('_') + '_general'` (not `split('_')[0]`). Otherwise
  `allied_health_*` sub-types Haiku invents fall to `general`, skipping `allied_health_general`.
  *(Confirmed by trace last pass.)*
- **F-03 [MOD; HIGH if serverless]** brand-create: replace the un-awaited
  `classifyAndStoreBrand(id).catch(…)` with `await inngest.send({ name: 'brand/created',
  data:{ brandId } })` + a small Inngest fn that classifies on that event. Preserves the
  Section-D non-blocking design; makes it actually complete + retry.
- **F-04 [MOD]** `classify-brand.ts`: select Haiku via model-selector's mechanism (a use-case/
  tier arg, not a hardcoded string) so the ~$0.001 cost + intended-model hold; and verify the
  real `complete()` signature/return shape during Phase 1 (the assumed `{prompt,…}→string` may
  differ).
- **F-05 [LOW]** migration: `classification_status TEXT … NOT NULL DEFAULT 'pending'` to match
  the Drizzle `.notNull()` (safe — the default backfills existing rows).
- **F-06 [cross-artifact, Sri]** adding `classifyExistingBrands` to `serve()` makes the Phase-2
  "eventual 25" → 26; update the Phase-2 sprint prompts' serve() notes + the 25/25 locked fact.

---

## 4. VERDICT — **PASS-WITH-FIXES** (unchanged): Phase 5b is approved; F-01…F-04 still block

- **Phase 5b (new):** good — clean, well-scoped, no schema/new files; one harmless redundancy
  in the 5b.2 `or(...)`. Approve as-is.
- **The file as a whole:** still carries the four MODERATE code bugs (F-01…F-04) + the LOW
  (F-05) from v1.0. Those remain the gating items before Claude Code runs this.

**Net:** the v1.1 addition is fine, but the substantive fixes from the last review have not
landed in this copy. Apply F-01…F-04 (small, localized), sequence them before/with Phase 5b so
the reconciliation is observable, and the prompt is ready. Validation remains the Section G
test: a Canva re-audit moving 34.4 → 80–95+ with design-specific, **correctly region-tokened**
prompts — which specifically needs F-01 + F-02 to be true.

---

## 5. NEXT STEP
1. Apply F-01…F-04 (and F-05) to the fix prompt — see §3 / the v1.0 findings doc for exact edits.
2. Keep Phase 5b as written (optionally simplify the 5b.2 `or(...)` to `isNull(promptPack)`).
3. F-06: bump the Phase-2 prompts' serve() count 25 → 26.
If you'd like, re-send once F-01…F-04 are in and I'll do a final confirm + one more fresh angle.

— End of SMART-PROMPT-PACK-FIX-FINDINGS-PASS2.md
