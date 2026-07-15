# Claude Code — FIX: Discovery hub is NAV-ORPHANED — add the Discovery tile to the brand page (+ a grep guard so this class stops recurring)

The S7 Discovery hub pages were built (discovery hub / journeys / comparisons) but there's NO Discovery tile on the brand
page — so the whole S7 UX is unreachable except by typing the URL. This is the THIRD time this exact bug shipped: S5's
Trust hub was nav-orphaned (added Trust tile), S6's Retrieval hub was nav-orphaned (added Retrieval tile), now S7's
Discovery hub. Add the Discovery tile the SAME way the Retrieval tile was added, gated Agency+, and add a §12 grep that
asserts the brand-page nav includes it — so a future layer-hub sprint can't strand its UX again.

Env: Windows repo `C:\startup\VisibleAU\src\`. App on LOCAL PROD `visibleau_prod`. Never real prod. Brand: Metropolitan
418f321f-2489-4560-aaa9-895728580465. Org is Agency (will see the Agency+ tile).

## Canon (prototype FIX17)
- Brand-page tile array (proto 883-885): the hub tiles are `visibility-hub, trust-hub, retrieval-hub, workflow-hub,
  **discovery-hub**` — Discovery is `{ id: 'discovery-hub', label: 'Discovery', icon: Compass, layer: 'discovery',
  tierGate: 'Agency' }`, a PEER to Retrieval.
- Tabs array (proto 1051-1053): `retrieval (Starter), workflow (Starter), **discovery (Agency)**, reports (Growth)` —
  Discovery is `{ id: 'discovery', label: 'Discovery', icon: Compass, layer: 'discovery', minTier: 'Agency' }`.
- Layer token/icon (proto 545): `discovery: { color: var(--layer-discovery), soft: var(--layer-discovery-soft), icon:
  Compass }` — cyan. The `--layer-discovery` tokens already exist (the build added them per its report).
- Tier: journeys UX = **Agency+** (v8.19 regating). So the Discovery tile/tab is Agency+, matching Retrieval's Starter
  vs Discovery's Agency distinction in the prototype.

## STEP 1 — Find where the RETRIEVAL tile/tab was added (the proven pattern to mirror)
```bash
# The brand-page nav/tile component (where Retrieval tile lives — S6 added it here):
grep -rln "retrieval-hub\|Retrieval.*Cpu\|layer: 'retrieval'\|id: 'retrieval'" app/ components/ 2>/dev/null
grep -rn "retrieval-hub\|'retrieval'\|Retrieval" app/**/brand*/ components/**/brand*/ components/**/*nav* components/**/*tile* 2>/dev/null | head
# The tabs array (Overview|Visibility|Trust|Retrieval|Workflow|...|Reports):
grep -rln "id: 'retrieval'\|label: 'Retrieval'\|minTier" app/ components/ 2>/dev/null | head
# Is Compass already imported anywhere (lucide-react)?
grep -rn "Compass" components/ app/ 2>/dev/null | head
```
Report: the EXACT file(s) where the brand-page hub tiles + the tabs array are defined (where Retrieval is), and whether
Compass is imported.

## STEP 2 — Add the Discovery tile to the brand-page hub-tile array (mirror Retrieval)
In the SAME file/array where `retrieval-hub` is defined, add `discovery-hub` right after `workflow-hub` (matching proto
883-885 order), mirroring how Retrieval's tile is shaped in the ACTUAL repo (not the prototype's shape — the repo's):
- id: 'discovery-hub' (or the repo's id convention), label: 'Discovery', icon: **Compass** (import from lucide-react if
  not already), layer: 'discovery', route/href → **`/brands/{brandId}/discovery`**.
- **Agency+ gate:** mirror how Retrieval's tile is gated in the repo, but Discovery = **Agency** (Retrieval is Starter).
  Read **subscriptions.tier** (never organizations.tier — the invariant). Since the current org is Agency, the tile
  SHOWS.
- Use the `--layer-discovery` cyan token for the tile accent (matching how Retrieval uses --layer-retrieval).

## STEP 3 — Add Discovery to the TABS array too (proto 1051-1053)
If the brand page also has the horizontal tabs (Overview|Visibility|Trust|Retrieval|Workflow|Discovery|Reports), add the
Discovery tab after Workflow, before Reports:
- `{ id: 'discovery', label: 'Discovery', icon: Compass, layer: 'discovery', minTier: 'Agency' }` (repo's shape).
Report whether both the tile AND the tab needed adding (some repos have one or both).

## STEP 4 — Verify on screen (both themes)
Reload `/brands/418f321f...`:
- The **Discovery tile** appears in the hub-tile grid (cyan accent, Compass icon, label "Discovery"), as a peer to
  Retrieval — and clicking it navigates to `/brands/{id}/discovery` (the hub loads, not a 404).
- (If tabs exist) the **Discovery tab** appears after Workflow.
- Both light + dark themes render the tile readably (the --layer-discovery token has both, per the build).
- As Agency, the tile is VISIBLE. (Sanity: the gate reads subscriptions.tier — a Growth/Starter org should NOT see it,
  but don't break the current Agency view.)
Report: Discovery tile present + navigates to the hub + readable both themes.

## STEP 5 — Add the §12 grep guard (so this class stops recurring — the 3rd time it shipped)
Add to `scripts/qa/sprint7-invariants.sh` (and note it as a pattern for future layer sprints): assert the brand-page nav
includes the Discovery hub tile/route.
```bash
# The brand-page nav array must reference the discovery hub (tile is wired, not orphaned):
grep -rEc "discovery-hub|'discovery'|/discovery" <the brand-page nav file from STEP 1>   # ≥1
# And the tile is Agency-gated on subscriptions.tier (not organizations.tier):
grep -rEc "subscriptions\.tier|subscription.*tier" <the tile-gating file>   # ≥1 (sanity)
```
Report the guard added + passing (≥1). (This is the guard that would have caught S5, S6, and S7's nav-orphan — the
brand-page nav references the new layer's route.)

## STEP 6 — Report
- STEP 1: the real files where Retrieval's tile + tab are defined.
- STEP 2-3: Discovery tile (+ tab if present) added, mirroring Retrieval, Agency+ on subscriptions.tier, → /discovery.
- STEP 4: on screen — tile present, navigates to the hub, readable both themes, visible as Agency.
- STEP 5: the §12 grep guard asserting the nav includes discovery → passing.

## Constraints
- Mirror how the RETRIEVAL tile/tab is shaped in the ACTUAL repo (STEP 1) — not the prototype's literal shape; the repo's
  conventions win. Discovery differs from Retrieval only in: label/icon (Compass), layer (discovery), route (/discovery),
  and tier (**Agency** not Starter).
- Tier gate reads **subscriptions.tier** (never organizations.tier — the invariant). Agency sees it; don't break that.
- Compass from lucide-react (import if missing). --layer-discovery cyan token (already added per the build).
- Add the §12 grep guard — this nav-orphan class shipped 3× (S5/S6/S7); the guard asserts the brand-page nav references
  the new layer's route so it can't strand again.
- Verify on screen, both themes. Local prod, never real prod. LLD v8.70 / prototype 883-885 + 1051-1053 win.

## NOTE
Third occurrence of the nav-orphan class: S5 Trust hub, S6 Retrieval hub, now S7 Discovery hub — the hub pages get built
but the brand-page tile that reaches them gets forgotten. Add the Discovery tile (proto 885: Compass icon,
--layer-discovery cyan, layer 'discovery', → /brands/{id}/discovery) + the tab (proto 1053) mirroring how Retrieval was
added in the REPO, gated **Agency+** on subscriptions.tier (Retrieval is Starter; Discovery is Agency per v8.19). Verify
on screen (tile present, navigates to hub, both themes, visible as Agency). Add a §12 grep asserting the brand-page nav
references /discovery — the guard that would have caught all three nav-orphans, so future layer sprints can't strand
their UX. The Discovery hub pages already exist (build report) — this just makes them reachable.
