# Claude Code — FIX: No way to VIEW existing drafts (drafts list is orphaned) — Workflow hub tabs

Sprint 2 manual testing: there is **no way to navigate to the existing content drafts** for a brand. The drafts
list page (`/brands/[brandId]/workflow/drafts`) is reachable **only** by clicking a task card's "Generate draft"
button — which is the action for *creating a new* draft, not viewing existing ones. A user who has already
generated/approved/rejected drafts has no link anywhere to go back and see them. The drafts list is orphaned the
same way the whole Workflow area is (Finding 1), just one level deeper.

Canon intent (prototype WorkflowHub, ~line 2157/2230): the Workflow hub is a **3-tab interface —
`Tasks | Drafts | Workflow runs`**. The user switches to the **Drafts** tab to view existing drafts. The build
flattened these into separate URL-only routes and never built the tab strip, so the only path to drafts became
the create button. This fix restores a real "view drafts" entry point.

> **Investigate-first. Report before building.** Read, in order:
> - `app/(auth)/brands/[brandId]/workflow/page.tsx` (the hub — currently 3 stat cards + "Generate draft" / "New
>   task" buttons; no tab strip). Confirm there is no existing nav to `/workflow/drafts` other than the generate
>   button.
> - `app/(auth)/brands/[brandId]/workflow/tasks/page.tsx` and `.../workflow/drafts/page.tsx` — the two pages that
>   should be reachable as tabs/links from the hub.
> - The prototype WorkflowHub tab strip (`['tasks','drafts','runs']`, ~line 2230) for the intended design.
> Report the current hub structure, then build the smallest fix that gives a clear, persistent way to reach the
> drafts list.

---

## WHAT TO BUILD — a persistent "Drafts" navigation on the Workflow area

Pick the approach that best fits the current structure (report which):

### PREFERRED — a tab/sub-nav strip on the Workflow hub (matches the prototype)
- Add a sub-nav on the Workflow area with links: **Tasks · Drafts** (and **Workflow runs** only if that page
  exists — if not, omit it; do NOT link to a 404).
- "Tasks" → `/brands/[brandId]/workflow/tasks`; "Drafts" → `/brands/[brandId]/workflow/drafts`.
- Render it consistently across the hub, the tasks page, and the drafts page (so the user can move between them
  from any of the three). Active tab highlighted per existing conventions.

### ACCEPTABLE MINIMAL — a "View drafts" link/button on the hub + tasks pages
- If a full tab strip is too invasive, add at minimum a clearly-labelled **"View drafts"** link/button:
  - on the **Workflow hub** (next to "Generate draft" / "New task"), and
  - on the **Tasks board** header (so the user can reach drafts from where the tasks live).
- → `/brands/[brandId]/workflow/drafts`. Plain navigation, no generation.

**Minimum bar:** from the Workflow hub AND the Tasks board, a user can reach the drafts list in one click via a
control whose label clearly means "view/see drafts" — NOT the "Generate draft" create button. The two actions
must be visually and semantically distinct (one creates, one navigates to the list).

## ALSO — clarify the existing "Generate draft" button (it's overloaded)
The task-card "Generate draft" button currently doubles as the only path to the drafts page. Once a real "view
drafts" entry exists, leave "Generate draft" as create-only (it opens the modal → POSTs → navigates to the
drafts list on success, which is fine). No change needed to the button itself beyond making sure the *separate*
view path exists.

## INVARIANTS — do not violate
- Do NOT create nav links to routes that don't exist (no 404s). Tasks + Drafts pages exist; "Workflow runs" only
  if its route exists — verify before linking.
- This is a NAVIGATION-only fix. Do NOT change the drafts list page's data/logic, the generation flow, the
  approve/reject flow, or the kanban. Only add the entry point(s) to reach the drafts list.
- Use existing shared components, icons, and design tokens — don't invent new primitives. Active/hover states
  follow existing conventions; ARIA: if a tablist, role="tablist"/role="tab"/aria-selected; if links, proper
  anchors.
- Don't regress: tasks board, generate-draft modal, approve/reject, the badges.

## VERIFY (behavioural — reach the drafts list without the generate button)
On Bondi Plumbing (`/brands/8f59b2a2-6aa0-4318-9848-b33ed520ca36/workflow`):
1. From the Workflow hub, there is now a visible **Drafts** tab / **View drafts** control (distinct from
   "Generate draft"). Click it → land on `/workflow/drafts` showing the existing drafts (the Approved + Rejected
   "Your AU local directory listings" rows from testing). WITHOUT clicking "Generate draft".
2. From the **Tasks board** (`/workflow/tasks`), there is also a one-click way to reach the drafts list.
3. (If tab strip built) From the drafts page, the user can navigate back to Tasks via the same strip.
4. "Generate draft" on a task still opens the create modal and generates (unchanged) — it is no longer the ONLY
   way to reach drafts.
5. No nav link points to a non-existent route (no 404s — e.g. if "Workflow runs" page doesn't exist, that tab
   isn't shown).
6. Full Sprint 2 suite still green; no regression to drafts list, generation, or approve/reject.

## REPORT
- The current hub structure you found (stat cards + buttons; no tab strip / no drafts link confirmed).
- Which approach you built (tab strip vs view-drafts link) and why.
- Whether a "Workflow runs" page exists (and so whether that tab/link was included or omitted).
- Behavioural confirmation: drafts list reachable in one click from the hub AND the tasks board via a
  view-oriented control (not the generate button); generate-draft still works; no 404 links.
- Confirm invariants (navigation-only, no logic change, no dead links) + suite green.

## NOTE (relationship to the other nav fix)
This overlaps with `fix-workflow-nav-orphaned-finding1.md` (which adds the Workflow entry point to the brand
page). If you build the broader brand-page tab + a Workflow-hub sub-nav together, this drafts-navigation gap is
naturally covered. They can be combined or applied separately — but THIS one is the concrete blocker the user
hit (no way to see existing drafts), so it must be resolved either way.
