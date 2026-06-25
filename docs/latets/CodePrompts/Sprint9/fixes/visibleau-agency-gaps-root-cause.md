# VisibleAU — Root-cause analysis: WHY the agency-surface gaps were missed
# Question (Sri): are these missed from the design, the prototype, or the sprint prompts?
# Method: traced each missed item through the four layers — PRD/design → prototype → sprint prompt →
#   build — to find WHERE each one was lost. Sources: PRD v1.15, prototype (AgencyDashboard L3568+),
#   Sprint 9 prompt.

═══════════════════════════════════════════════════════════════════════════════
THE ANSWER IN ONE LINE
═══════════════════════════════════════════════════════════════════════════════
The features were NOT missed from design or the prototype — they exist in both. They were lost at the
**prototype → sprint-prompt** boundary: the sprint prompt specifies the agency PAGES (routes + data +
backend) thoroughly, but it does NOT carry over the prototype's NAVIGATION — the cards/buttons that
link those pages together. The prototype shows HOW you get from screen to screen via onClick handlers;
the sprint prompt lists the destination pages but omits the connective tissue. The build faithfully
implemented what the prompt said (the pages), so the pages exist but are unreachable.

In short: **a navigation-flattening gap when the visual prototype was translated into the linear
sprint prompt.** It's a spec-translation failure, not a design failure and not (mostly) a build
failure.

═══════════════════════════════════════════════════════════════════════════════
EVIDENCE — tracing each missed item through the layers
═══════════════════════════════════════════════════════════════════════════════

### Item A — "Bulk actions" card (the nav handle to the PDF builder + bulk ops)
| Layer | Present? | Evidence |
|---|---|---|
| PRD/design | YES | white-label PDF + bulk ops are PRD §8 Module 6 deliverables |
| **Prototype** | **YES** | AgencyDashboard has a "Bulk actions" card (proto L3625) with "Generate client reports (white-label)" → `onNav` |
| **Sprint prompt** | **NO (the gap)** | §24 says the dashboard renders "portfolio composite score, top-3 movers, drift pending, upcoming schedules, LLM spend" — it lists KPIs+movers+schedules but NOT the Bulk-actions card. GB1's `AgencyDashboardView` is passed brands/audits/drift/schedules — NO bulk/report data. The prompt never says "render a bulk-actions card linking to /agency/reports/pdf-builder." |
| Build | Followed prompt | Built KPIs + Top Movers + Scheduled Audits (exactly the prompt's list); did NOT build the card the prompt didn't mention |
→ **Lost at the prototype→prompt step.** The card is in the prototype; the prompt's dashboard spec
silently dropped it.

### Item B — "Client-facing portals" card (the nav handle to client portals)
| Layer | Present? | Evidence |
|---|---|---|
| PRD/design | YES | client portal = PRD §8 Module 6 |
| **Prototype** | **YES** | AgencyDashboard has a "Client-facing portals" card (proto L3646) with "Preview portal" → `onNav('client-portal')` |
| **Sprint prompt** | **NO (the gap)** | Same as A — §24's dashboard contents list omits this card. The portal PAGES are specified (L40-43: /agency/client-portals, the route group, magic-link), but the dashboard CARD that links to them is not in the dashboard's render spec. |
| Build | Followed prompt | Didn't build a card the prompt didn't list |
→ **Lost at the prototype→prompt step**, identically to A.

### Item C — How to reach /agency at all (the workspace-switcher "All brands")
| Layer | Present? | Evidence |
|---|---|---|
| Prototype | PARTIAL | AgencyDashboard exists but the prototype's SIDEBAR has no link to it (orphan screen); only a static "All brands" Select mock (proto L3526) |
| **Sprint prompt** | **YES (specified) but as a buried fix-note** | GH2 DOES specify the workspace-switcher with "All brands → /agency". So the nav handle WAS in the prompt — but as a single line inside a component fix-block (L650), not in the dashboard's main spec. Easy to miss. |
| Build | Missed initially | The switcher wasn't built until we flagged it; GH2 was buried |
→ **Specified but buried.** Unlike A/B (omitted entirely), the switcher WAS in the prompt — but as a
one-line note in a fix-block, so the build skipped it. A visibility/prominence failure within the
prompt.

### Item D — Switcher routes to non-existent /brands/[brandId]/audits
| Layer | Present? | Evidence |
|---|---|---|
| **Sprint prompt** | **WRONG** | GH2 says route to `/brands/${id}/audits` — but NO sprint prompt ever defines that page. The prompt referenced a route it never specified. |
→ **Prompt internal inconsistency.** GH2 pointed at a phantom route. This one IS a sprint-prompt
error (not a translation gap) — the prompt contradicted itself (told the switcher to go somewhere it
never built).

### Item E — FM5 audit-list drift JOIN, F — agency ambiguous-id
→ These were **build-level** bugs against a correct prompt (FM5 component existed but wasn't wired; the
SQL had an unqualified column). Different category — genuine build misses, not spec gaps.

═══════════════════════════════════════════════════════════════════════════════
THE PATTERN — three distinct failure types (don't conflate them)
═══════════════════════════════════════════════════════════════════════════════
1. **Prototype→prompt navigation-flattening (A, B)** — THE DOMINANT ONE. The prototype's connective
   nav (cards/buttons with onClick) wasn't carried into the sprint prompt's page specs. The prompt
   lists destinations but not the links between them. Result: pages built, unreachable. This is why
   you've hit "built but unlinked" repeatedly (Local SEO entry point, /agency, PDF builder, portals).
2. **Buried-in-fix-block (C)** — the nav WAS specified but as a one-line note inside a component
   fix-block (GH2), not in the main feature spec, so the build skipped it.
3. **Prompt internal inconsistency (D)** — the prompt referenced a route/page it never defined
   (phantom /brands/[brandId]/audits). A self-contradiction within the prompt.
(Plus ordinary build bugs E/F against correct specs — a separate, expected category.)

═══════════════════════════════════════════════════════════════════════════════
WHY THIS HAPPENED (the structural reason)
═══════════════════════════════════════════════════════════════════════════════
- The prototype is a VISUAL artifact where navigation is implicit and obvious — you SEE the "Generate
  client reports" button sitting on the dashboard, so its existence is self-evident.
- The sprint prompt is a LINEAR text artifact organized by FEATURE/route (here's the PDF builder page,
  here's the bulk page, here's the portal page) — it enumerates the destinations well but has no
  natural place to say "and the dashboard has a card linking to these." Navigation between features
  falls between the cracks of a feature-by-feature spec.
- Agency was a LARGE sprint (dashboard + PDF + portals + bulk + GA4 + scheduling + digest). The more
  surfaces a sprint has, the more inter-surface NAV there is to lose — which is why Sprint 9 has the
  most "built but unlinked" gaps of any sprint so far.
- The prototype even FLAGS its own weakness: AgencyDashboard is an orphan screen with no sidebar link
  ("Sprint 9 screens use their own fixture data") — the prototype itself never wired agency navigation,
  so there was nothing clean for the prompt to translate.

═══════════════════════════════════════════════════════════════════════════════
WHAT THIS MEANS / HOW TO PREVENT THE NEXT BATCH
═══════════════════════════════════════════════════════════════════════════════
- **It's NOT a design problem.** The PRD and prototype contain these features and their nav. Don't
  redesign anything.
- **It's NOT mostly a build problem.** The build faithfully implemented the prompt; it built what it
  was told and skipped what it wasn't. (D, and E/F, are the exceptions — real prompt/build bugs.)
- **It IS a prompt-completeness problem at the navigation layer.** The fix-forward lesson: when a
  sprint introduces multiple new pages, the prompt needs an explicit "NAVIGATION" section — for each
  new page, state how the user reaches it (which card/button/menu on which existing page). The prompt
  has detailed sections for schema, routes, components, DoD — but no section for "how do these pages
  connect."
- **Practical checklist for future sprints (and to finish Sprint 9):** for every page in the route
  list, ask "what links to this?" If the answer isn't in the prompt, it's a future "built but unlinked"
  gap. For Sprint 9, that's: the two missing dashboard cards (A, B), and confirming the switcher (C)
  and its corrected route (D).
- **The agency-surface audit prompt** (separate doc) will enumerate exactly which pages are built vs
  unlinked vs unbuilt — this analysis explains WHY, that one will tell you WHAT remains.

═══════════════════════════════════════════════════════════════════════════════
BOTTOM LINE FOR SRI
═══════════════════════════════════════════════════════════════════════════════
Missed from the **sprint prompt**, not the design or prototype — specifically the prototype's
NAVIGATION (the cards/buttons linking pages) didn't survive translation into the feature-by-feature
sprint prompt. The pages were specified and built; the LINKS between them were dropped. Two cards (Bulk
actions, Client-facing portals) were omitted entirely; the workspace-switcher was specified but buried
in a fix-note; and one route target was a phantom. The cure is a "navigation" section in future sprint
prompts (how each page is reached), and for Sprint 9, adding the two dashboard cards finishes most of
it at once.
