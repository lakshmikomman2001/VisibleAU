# Claude Code — FIX (Finding 1, refreshed): Workflow is orphaned from nav — add the brand-detail entry point

**Refreshed to reuse the `WorkflowSubNav` tab convention built earlier this session** (don't invent a new tab
style).

The Workflow surfaces (`/brands/[brandId]/workflow`, `/workflow/tasks`, `/workflow/drafts`) are reachable ONLY by
typing the URL — there is no link to them from the brand page. The flagship Phase 2 feature is invisible. (Within
Workflow, the Tasks/Drafts `WorkflowSubNav` tab strip built this session works — but getting INTO Workflow from
the brand has no entry point.) LLD records this: "/workflow surfaces are URL-only, not in brand nav (Sprint 9
orphaned-nav pattern)."

The prototype specifies the intended brand-detail nav: **`BrandIntelTabs`** (~prototype line 1046) — a tab strip
on the brand detail page:
`Overview · Visibility · Trust · Retrieval · **Workflow** · Discovery · Reports`, each tier-gated by `minTier`.
**Workflow is `minTier: 'Starter'`.** The build never carried this over.

This fix adds the entry point so users reach Workflow without editing the URL. **Workflow is the must-have** (the
only Phase 2 layer built so far). Only wire entries for layers whose pages exist — do NOT link to routes that 404.

> **Investigate-first. Report before building.** Read, in order:
> - `components/domain/workflow/workflow-sub-nav.tsx` — the tab convention BUILT THIS SESSION (Tasks | Drafts,
>   `2px solid var(--accent-blue)` active border, `var(--text-primary)`/`var(--text-secondary)`, `Link`-based,
>   following the existing audit-page tab pattern). **The brand-detail Workflow tab must follow this SAME
>   convention** — same active-border, colors, Link approach — for visual consistency. Reuse/generalize it rather
>   than authoring a new tab style.
> - `app/(auth)/brands/[brandId]/page.tsx` (and any brand-detail layout) — the ACTUAL current structure. Is there
>   already a tab strip / sub-nav on the brand detail page, or just overview content? Where does a "Workflow" tab
>   slot in? (The brand surfaces are reached via the "Detail" breadcrumb; the left sidebar is workspace-level —
>   Overview/Brands/Vertical packs/Action Center/Drift Alerts/Agency Dashboard.)
> - Which Phase 2 layer routes ACTUALLY EXIST under `app/(auth)/brands/[brandId]/` right now: workflow definitely;
>   visibility/trust/retrieval/discovery/reports — check each. Only link to ones that exist.
> - How the current org tier is read for gating (`subscriptions.tier` — the locked source-of-truth, NOT
>   `organizations.tier`).
> Report: the brand-detail structure, the `WorkflowSubNav` convention specifics, and which layer routes exist —
> then build.

---

## WHAT TO BUILD — a brand-detail tab strip (or minimal entry) using the WorkflowSubNav convention

Pick the approach that fits the brand-detail structure (report which):

### APPROACH A (PREFERRED) — brand-detail tab strip (`BrandIntelTabs`), styled like `WorkflowSubNav`
- Add a tab strip to the brand detail page matching the prototype's `BrandIntelTabs`:
  `Overview · Visibility · Trust · Retrieval · Workflow · Discovery · Reports`.
- **Use the EXACT visual convention from `WorkflowSubNav`** (the `2px solid var(--accent-blue)` active border,
  text-primary/secondary colors, hover bg, `Link`-based navigation) — so the brand-level tabs and the
  within-Workflow Tasks/Drafts tabs look like one coherent system. If sensible, generalize `WorkflowSubNav` into a
  shared tab-strip component both can use; otherwise mirror its styling exactly.
- **Only render tabs whose route exists.** Workflow is required → `/brands/[brandId]/workflow`. For layers not yet
  built, either omit the tab OR render it disabled/locked ("coming soon") — do NOT link to a 404. Report which you
  did.
- Active-tab state per the convention (accent-blue underline/border on the active tab).

### APPROACH B (fallback if a full tab strip doesn't fit the current structure) — entry card / link
- Add a **"Workflow"** entry on the brand overview page (a card or clearly-labelled link, using existing
  components + the GitBranch icon per the prototype) → `/brands/[brandId]/workflow`. Same idea as the Sprint 9
  dashboard entry-point cards.
- Minimum acceptable: one-click from the brand page to the Workflow hub, no URL typing.

**Minimum bar (either approach):** from the brand detail/overview page, a user reaches `/brands/[brandId]/workflow`
in ONE click without touching the URL. The full tab set is a bonus if the structure supports it cleanly; Workflow
reachability is the requirement.

## TIER GATE (match the prototype's logic — do NOT hardcode)
The prototype gates tabs via `minTier` with `tierRank = { Free:0, Starter:1, Growth:2, Agency:3, 'Agency Pro':4 }`.
- **Workflow is `minTier: 'Starter'`** — visible to Starter and above; locked/hidden for Free.
- Read the current org's tier from **`subscriptions.tier`** (NOT `organizations.tier` — locked invariant), via the
  same tier-read helper the rest of the app uses.
- Below-tier tabs: locked state (lock icon + upgrade affordance) OR omitted — match the app's existing tier-gate
  pattern (reuse the existing TierGate/lock pattern; don't invent one).
- (Bondi/VisibleAU Dev is Agency tier → Workflow shows unlocked for testing.)

## INVARIANTS — do not violate
- Tier source-of-truth is **`subscriptions.tier`**, never `organizations.tier`.
- Do NOT create nav links to non-existent routes (no 404s). Workflow exists; verify the others before linking.
- **Reuse the `WorkflowSubNav` tab convention** (accent-blue active border, Link-based, existing tokens) — the
  brand-detail tabs and the within-Workflow tabs must be visually consistent. Don't author a divergent tab style.
- This fix touches ONLY navigation (the brand-detail tab strip / entry card). Do NOT change the Workflow hub,
  kanban, drafts pages, or their data/logic — those already work.
- ARIA: tablist uses `role="tablist"`/`role="tab"`/`aria-selected` (the app's FIX 13 build rule); entry cards/links
  are proper anchors.
- Do NOT regress the within-Workflow `WorkflowSubNav` (Tasks | Drafts) built this session, or the brand-detail
  page's existing content.

## VERIFY (reach Workflow without the URL bar)
On Bondi Plumbing (Agency tier):
1. Open the brand detail page (`/brands/8f59b2a2-6aa0-4318-9848-b33ed520ca36` via Brands → Bondi Plumbing).
   Confirm there's now a visible **Workflow** entry (tab or card) — WITHOUT typing a URL — styled consistently with
   the existing Tasks/Drafts tab convention.
2. Click it → land on `/brands/8f59b2a2-.../workflow` (the hub: Open/In progress/Done cards + Generate draft / New
   task, and the Tasks | Drafts `WorkflowSubNav`). One-click navigation works.
3. From the hub, the Tasks (`/workflow/tasks`) and Drafts (`/workflow/drafts`) tabs still work (the WorkflowSubNav
   built this session is intact).
4. Tier gate (if quick): a Free-tier brand shows Workflow locked/hidden (not an active link); Starter+ shows it
   unlocked. (Workflow minTier = Starter.)
5. No new nav link points to a non-existent route (no 404s).
6. Suite green; no regression to the brand-detail content or the WorkflowSubNav.

## REPORT
- The brand-detail structure found (tab-based? overview-only?) + which Phase 2 layer routes exist today.
- The `WorkflowSubNav` convention specifics and whether you generalized it into a shared component or mirrored its
  styling.
- Which approach you built (A tab strip / B entry card) and why; how below-tier layers are handled (omitted vs
  locked); how tier is read (`subscriptions.tier`).
- Behavioural proof: Workflow reachable from the brand page in one click (no URL editing), visually consistent with
  the Tasks/Drafts tabs; hub → Tasks/Drafts still navigable; no 404 links; tier gate correct.
- Confirm invariants: subscriptions.tier source, no dead links, WorkflowSubNav + workflow pages unchanged, tab
  convention reused. Suite green.

## NOTE — completes the navigation story
This fix makes Workflow reachable FROM the brand (the entry point); the `WorkflowSubNav` built this session handles
moving WITHIN Workflow (Tasks ↔ Drafts). Together they fully resolve the orphaned-Workflow-nav finding. If you
generalize `WorkflowSubNav` into a shared tab component for the brand-detail strip, note that for consistency
across future layer tabs (Visibility/Trust/etc.) when those surfaces get built.
