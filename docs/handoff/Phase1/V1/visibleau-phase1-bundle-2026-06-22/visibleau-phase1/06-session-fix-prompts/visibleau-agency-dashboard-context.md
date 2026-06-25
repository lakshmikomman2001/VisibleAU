# VisibleAU — AgencyDashboard: full context, functionality & navigation (Phase 1 canon)
# Sources read: Sprint 9 prompt (sri-visibleau-sprint-9-prompt.md) — the authoritative spec;
#   prototype (visibleau-prototype.jsx, AgencyDashboard L3568 + ClientPortal L3660);
#   foundations/PRD (PRD §8 Module 6/7). Phase 2 LLD does not own this (it's a Phase 1 Sprint 9 feature).

═══════════════════════════════════════════════════════════════════════════════
1. WHAT IT IS (and how it differs from the regular Dashboard)
═══════════════════════════════════════════════════════════════════════════════
Two SEPARATE screens exist in Phase 1:
- **Dashboard** (prototype L916) — breadcrumb `Workspace › Overview`. Single-workspace view: "Brands
  tracked / Audits this month / Avg visibility / LLM spend" + Recent audits feed. This is what you
  currently see ("Welcome back, Sri").
- **AgencyDashboard** (prototype L3568) — breadcrumb `Agency workspace › Overview`. A PORTFOLIO-level
  view across ALL client brands: "Active brands / Avg portfolio score / Brands with issues / Total
  monthly LLM cost", top movers, pending drift, upcoming scheduled audits. Subtitle: "23 client
  brands · 4 portfolios · 156 audits this month".

They are architecturally distinct (different routes, different KPIs, different purpose) — not the same
page with different data. Your screenshots show the regular Dashboard, which is the key signal that
AgencyDashboard is either unbuilt or unrouted (more in §6).

═══════════════════════════════════════════════════════════════════════════════
2. CONTEXT — what sprint/tier it belongs to
═══════════════════════════════════════════════════════════════════════════════
- **Sprint:** Phase 1 **Sprint 9** ("Unlock Agency + Agency Pro tiers"). The agency dashboard is the
  headline deliverable: Sprint 9 §24 — "Agency dashboard at `/agency` — Overview across all client
  brands."
- **Tier-gated:** only `agency` / `agency_pro` / `enterprise` tiers. Lower tiers hitting `/agency` get
  a `<TierGate requiredTier="agency" />` upgrade screen (GB1). (DoD L1109: "Free/Starter/Growth see
  upgrade CTAs in agency-only screens.")
- **Why it exists:** an agency managing 5–25 client brands can't use the single-brand Dashboard to see
  everything at once. AgencyDashboard is the cross-client portfolio cockpit.

═══════════════════════════════════════════════════════════════════════════════
3. FUNCTIONALITY (canon Sprint 9 §24 + GB1 server-component spec)
═══════════════════════════════════════════════════════════════════════════════
The route is **`/agency`** → `app/(auth)/agency/page.tsx` (server component, spec'd in full at GB1).
It renders `<AgencyDashboardView>` from four parallel queries (all RLS-scoped to the org):
1. **All brands** (id, name, clientTag) — for KPI counts.
2. **Most recent audit per brand** (scoreComposite, createdAt, brandName, limit 50) — for avg
   portfolio score + top movers.
3. **Unacknowledged drift alerts count** — the "pending acknowledgment" KPI.
4. **Next scheduled audits** (active schedules, by nextRunAt, limit 5) — "upcoming scheduled audits".

Displayed elements:
- **Portfolio KPI cards:** Active brands, Avg portfolio score, Brands with issues, Total monthly LLM
  cost.
- **Top-3 movers** (up/down) — biggest score changes across the portfolio (component `top-movers.tsx`).
- **Portfolio grid** (component `portfolio-grid.tsx`) — brands grouped by client (see §4).
- **Pending drift alerts** + **upcoming scheduled audits** + **LLM spend this month**.
- **"Client-facing portals" card** (prototype L3646) — lives INSIDE AgencyDashboard; shows active
  portals count + a "Preview portal" button. THIS is why you couldn't find the portals card: it's a
  sub-component of AgencyDashboard, so if AgencyDashboard isn't built, the card doesn't exist anywhere.

The wider Sprint 9 "/agency/*" route family (all tier-gated):
- `/agency` — the dashboard (above)
- `/agency/branding` — logo + colour upload (white-label)
- `/agency/reports/pdf-builder` — white-label PDF preview
- `/agency/bulk` — bulk operations (re-audit all, bulk CSV)
- `/agency/client-portals` — issued-invite management (list / revoke / regenerate)
- `/agency/client-portals/new` — issue a new client-portal invite
- `/portfolio` — Sprint 4 stub, now populated

═══════════════════════════════════════════════════════════════════════════════
4. DATA MODEL — the "portfolios" subtlety (GB5, important)
═══════════════════════════════════════════════════════════════════════════════
The prototype shows "Client portfolios" as a grouped view, implying a portfolios table. **Canon
explicitly says NO separate portfolios table (GB5):**
- "Portfolios" = `GROUP BY brands.clientTag` (a free-text tag).
- Sprint 9 adds `clientTag: text('client_tag')` to Sprint 4's `brands` table (via migration).
- Portfolio aggregation: `SELECT client_tag, count(*), avg(score) FROM brands GROUP BY client_tag
  WHERE client_tag IS NOT NULL`.
- Per-brand client assignment (Sprint 9 §25): each brand optionally tagged with a "client" identifier;
  that tag is what groups the portfolio view AND scopes client portals.
So AgencyDashboard's "portfolios" are emergent from clientTag, not a first-class entity. (Worth
checking your build didn't invent a portfolios table — canon forbids it.)

═══════════════════════════════════════════════════════════════════════════════
5. HOW IT'S MEANT TO BE REACHED — the navigation answer (GH2)
═══════════════════════════════════════════════════════════════════════════════
This is the crux of your "how do I navigate to it" question. Canon's intended entry point is NOT a
sidebar item — it's the **workspace/brand switcher in the TOP BAR** (component `workspace-switcher.tsx`,
GH2 fix):
- A top-bar dropdown listing all the org's brands.
- For Agency-plan users it ALSO shows an **"All brands (N)"** option → which `router.push('/agency')`.
- So the canonical path is: **top-bar workspace switcher → "All brands" → lands on `/agency`
  (AgencyDashboard).**
- DoD confirms it (L1096): "Topbar workspace switcher selects between brands"; and GH2: '"All brands"
  option → /agency'.

CRITICAL NUANCE: canon does NOT add an "Agency" sidebar entry. The intended navigation is the top-bar
switcher's "All brands" option. The PROTOTYPE doesn't even wire this — its AgencyDashboard is an
orphan screen with no nav handle at all (the prototype sidebar is only Overview/Brands/View plans).
So the navigation lives in canon (GH2) but not in the prototype.

═══════════════════════════════════════════════════════════════════════════════
6. WHY YOU CAN'T FIND IT — the likely build situation
═══════════════════════════════════════════════════════════════════════════════
Putting it together, the most probable explanation for "I can't navigate to AgencyDashboard":
1. **The workspace-switcher (GH2) with the "All brands → /agency" option may not be built** — it's the
   ONLY canonical nav handle, and it's a small component easy to miss. Without it there's no UI path,
   even if `/agency` exists.
2. **AND/OR `/agency` itself may be unbuilt** — your screenshots show the regular Dashboard with
   single-workspace KPIs (Brands tracked: 3), not the portfolio view (Active brands: N). If
   AgencyDashboard were built and you're Agency-tier, you'd reach the portfolio cockpit via the
   switcher.
3. The prototype gave the builder agency *screens* but NO navigation, so a build following the
   prototype could easily have shipped the screens unwired (the same "page built, no nav entry"
   pattern we've already hit with Local SEO and the audits list).

To distinguish "unbuilt" vs "built-but-unwired", try the direct URL **`http://localhost:3000/agency`**:
- Loads the portfolio dashboard → it's built; the gap is just the missing workspace-switcher nav
  handle (GH2). Fix = add the switcher / "All brands" option.
- Shows a TierGate upgrade screen → built + tier-gated; confirm your account is actually agency-tier.
- 404 → `/agency/page.tsx` wasn't built; AgencyDashboard is a genuine Sprint 9 gap.

═══════════════════════════════════════════════════════════════════════════════
7. SUMMARY
═══════════════════════════════════════════════════════════════════════════════
- **AgencyDashboard ≠ Dashboard.** It's a separate Sprint 9, Agency-tier-only PORTFOLIO cockpit at
  `/agency`, showing cross-client KPIs, top movers, pending drift, scheduled audits, and the
  "Client-facing portals" card.
- **It's reached (per canon GH2) via the top-bar workspace switcher's "All brands" option**, NOT a
  sidebar item. The prototype never wired any path to it (orphan screen).
- **"Portfolios" = brands.clientTag grouping** (no portfolios table — GB5).
- **You can't find it most likely because** the workspace-switcher nav handle (GH2) and/or the
  `/agency` page weren't built — the recurring "screen built, nav missing" pattern, here made worse by
  the prototype providing no navigation at all.
- **Next step:** hit `/agency` directly to classify it as built-but-unwired vs unbuilt, then I can
  scope the right fix (add the workspace-switcher nav handle, or build the agency dashboard).

If you want, send me what `http://localhost:3000/agency` shows (the page, a TierGate, or a 404) and
I'll tell you exactly which it is and write the matching fix/verification prompt.
