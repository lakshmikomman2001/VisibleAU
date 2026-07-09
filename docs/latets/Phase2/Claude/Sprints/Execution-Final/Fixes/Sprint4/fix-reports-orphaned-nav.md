# Claude Code — FIX (orphaned nav): the Reports screen has no entry point on Brand Detail

**Bug (manual pass):** the Sprint 4 Reports screen (`/brands/[brandId]/reports`) **loads correctly but is
unreachable by clicking** — it can only be reached by typing the URL. The Brand Detail page shows the intelligence
cards (Workflow, Visibility, Technical Audit, Robots.txt, llms.txt, Schema, SSR, Answer Capsules, Brand Entity,
Signals, Local SEO, Audit Schedule) but **no Reports card/tab**. This is the same orphaned-nav class as the Sprint 3
Visibility hub / Citation Failure (which had built routes but no nav link).

Severity: MODERATE — the feature is built + works, but users can't discover/reach it. A shipped-but-unreachable
feature is effectively missing.

## ✅ THREE-SOURCE CHECK (done) — the Reports entry belongs in BrandIntelTabs, gated Growth+
- **Prototype FIX17 `BrandIntelTabs` (line 1046-1055):** the intelligence-tab array **explicitly includes**
  `{ id: 'reports', label: 'Reports', icon: FileText, layer: 'comm', minTier: 'Growth' }` — alongside workflow /
  visibility / trust / retrieval / discovery. So Reports IS specified as a brand-detail intelligence tab/card.
- **LLD TG-02 (line 603-614, authority):** BrandIntelTabs Reports tab minTier reconciled **Starter → Growth**
  (because `generated_reports` is Growth+; Starter has no report entitlement). So the gate is **Growth+**, enforced
  in BrandIntelTabs (the real entitlement gate).
- **Sprint 4 prompt §6U.2:** the Reports list is the destination (`/brands/[brandId]/reports`, ReportsList,
  Growth+ TierGate). The prompt focuses on the screen; the NAV to it is the prototype's BrandIntelTabs tab (above).
- **Prototype note (FIX, line 72):** the sidebar "Reports" item is "ungated nav convenience — the real gate is
  BrandIntelTabs." So the authoritative entry is the **BrandIntelTabs Reports tab/card on Brand Detail**, gated
  Growth+.
- **Conclusion:** add the **Reports card/tab to the Brand Detail intelligence tabs** (BrandIntelTabs equivalent),
  layer `comm` (indigo `--layer-comm`), **minTier Growth**, linking to `/brands/[brandId]/reports`. No conflict —
  prototype + LLD agree.

> Investigate-first: find the Brand Detail intelligence-card/tab component (the grid of Workflow/Visibility/etc.
> cards shown on the brand page) and how each card is defined + linked + tier-gated.
```bash
# Find the brand-detail intelligence cards/tabs (the Workflow/Visibility/Technical/... grid):
grep -rn "Workflow\|Visibility\|Technical Audit\|Robots\|Answer Capsules\|Local SEO\|Audit Schedule" app/ components/ | grep -iE "card|tab|href|/brands/" | head
# The component that renders that card grid on the brand page:
grep -rln "BrandIntelTabs\|intelligence\|Share of voice\|Tasks & remediation" app/ components/ | head
# How tier gating is applied to those cards (minTier / tierRank):
grep -rn "minTier\|tierRank\|subscriptions.tier\|TierGate" app/ components/ | grep -iE "brand\|intel\|card\|tab" | head
```

## THE FIX — add the Reports card/tab to the Brand Detail intelligence cards
- Add a **Reports** card/tab to the same grid/array that renders Workflow / Visibility / Technical Audit / etc. on
  the Brand Detail page, matching the existing card pattern:
  - **label:** "Reports"  · **sublabel** (match the card style, e.g. "AI visibility reports" / "Scheduled reports")
  - **icon:** FileText (the prototype's icon for reports)
  - **layer/colour:** `comm` → **`--layer-comm`** (indigo `#6366f1`) — the Communication layer colour (NOT a new
    colour; use the existing token, same as the Reports page LayerBadge).
  - **link:** navigates to **`/brands/[brandId]/reports`** (the existing, working route).
  - **tier gate: Growth+** — the card follows the same gating the other cards use (minTier 'Growth' /
    `tierRank`), reading **`subscriptions.tier`** (NOT organizations.tier). For a Starter-tier brand it shows the
    **locked/teaser** state like other gated cards; Growth/Agency see it active. (This Agency-tier brand qualifies →
    it must appear active.)
- Place it sensibly among the cards (it's a Communication-layer surface — near the other intelligence layers; order
  isn't spec-critical, but keep it consistent with the prototype's tab order where practical:
  visibility/trust/retrieval/workflow/discovery/**reports**).
- Do NOT change the Reports screen itself (it's correct) — this is purely adding the missing entry point.

## INVARIANTS
- Use the existing `--layer-comm` indigo token (matches the Reports page LayerBadge) — no invented colour.
- Tier gate Growth+ via the existing card-gating mechanism, reading `subscriptions.tier` (never organizations.tier).
- Match the existing intelligence-card component/pattern (don't build a bespoke card) — same styling, hover, focus,
  ARIA as its siblings.
- Link to the existing `/brands/[brandId]/reports` route — don't create a new route.
- Don't regress the other cards or the 78 Sprint 4 tests.

## VERIFY (on screen)
1. Brand Detail for an **Agency/Growth** brand (e.g. 026acf75-...) now shows a **Reports card** among the
   intelligence cards, indigo `--layer-comm`, FileText icon → clicking it navigates to
   `/brands/[brandId]/reports` (no URL typing needed). The orphaned-nav is closed.
2. A **Starter**-tier brand shows the Reports card **locked/teaser** (Growth+ gate), consistent with other gated
   cards.
3. The Reports page itself unchanged (still "Reports" + Communication badge + the empty/list states).
4. Reachability: every Sprint 4 surface can be reached by clicking (Reports list → a report → detail). (Note: the
   org-scoped Template editor + Delivery schedules at `/organizations/[orgId]/...` are separate — confirm THEIR nav
   entry too, see NOTE.)
5. 78 Sprint 4 tests still green; no regression to the other brand-detail cards.

## REPORT
- The card added (label/sublabel/icon/colour/link/gate) + which component/array it went in.
- Screenshot/confirm: Reports card visible on Brand Detail (Agency brand) → clicks through to the reports route;
  Starter shows locked.
- Confirm: `--layer-comm` token used; Growth+ gate via subscriptions.tier; existing card pattern reused; route
  unchanged; 78 tests green.

## NOTE — check the OTHER Sprint 4 nav entries too (same orphaned-nav risk)
Sprint 4 has TWO more screens that are **org-scoped**, not brand-scoped:
- Template editor → `/organizations/[orgId]/report-templates` (§6U.4)
- Delivery schedules → `/organizations/[orgId]/delivery-schedules` (§6U.5)
These won't be reached from BrandIntelTabs (they're org-level, Agency+). Confirm they have a nav entry (e.g. from
the Agency Dashboard / org settings). If THEY are also only reachable by URL, that's the same orphaned-nav bug for
those two — report it and we'll add their entry points (a follow-up fix). This prompt fixes the brand-scoped Reports
entry; flag whether the two org-scoped screens are also orphaned.
