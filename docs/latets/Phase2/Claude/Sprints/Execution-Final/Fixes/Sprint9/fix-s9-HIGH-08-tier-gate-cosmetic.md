# FIX S9-HIGH-08 (F28) — 🔴 The tier gate is COSMETIC. Free users can read every Growth+ feature's data.

## Severity: HIGH — this is the entire Phase 2 monetisation boundary, and it is a CSS blur filter.

## The finding (Section 5, §5.5)
> *"The children ARE in the DOM (blurred preview)… The TierGate does NOT suppress API fetches — the
> page still calls `/api/brands/{id}/latest-audit`, etc. The data flows through XHR regardless of
> tier. **This is a cosmetic gate, not a security gate. The API routes themselves don't check tier** —
> they only check org ownership."*

**A free-tier customer gets the full product.** Not by hacking — by pressing **F12**, or by curling the
endpoint directly. `backdrop-filter: blur(6px)` is a visual effect. **The data is already on the
page.** `pointer-events-none` and `aria-hidden` prevent *clicking*; they prevent nothing else.

**Canon (§0.3, binding):** the Autopilot loop view, Health Check, Action Progress Tracker,
per-prompt trend, and persona dashboards are **Growth+** — *"the aha moment for every paying
customer."* The Agency command centre is **Agency+**.

**If the paywall is a blur, there is no paywall.**

## The class this belongs to
This is **F22's shape, without the safety net.** F22: `withRlsContext` looked like a security control
and enforced nothing (but app-level filtering held the line behind it). **F28: `TierGate` looks like
a monetisation control and enforces nothing — and there is NOTHING behind it.**

Both shipped past green tests. Both were only visible when someone asked *"is this control actually
doing anything, or does it just look like it is?"*

## Task — enforce tier SERVER-SIDE

### 1 — Inventory: which routes serve Growth+ data with no tier check?
```bash
cd c:/startup/VisibleAU/src
# Every S9/Growth+ route:
for r in latest-audit topical-gaps tasks drafts agent-readiness site-readiness action-progress \
         journeys comparisons; do
  echo "=== $r ==="
  grep -n "assertBrandAccess\|tier\|isTierAtLeast\|subscriptions" \
    "app/api/brands/[brandId]/$r/route.ts" 2>/dev/null | head -3
done
grep -rn "tier" "app/api/brands/[id]/prompts/[promptId]/trend/route.ts" \
  "app/api/brands/[id]/action-progress/route.ts" 2>/dev/null
```
**Report which routes check tier and which don't.** Expect: **most check `assertBrandAccess` (org
ownership) but NOT tier.** That's the gap.

### 2 — Add a server-side tier gate to every Growth+ route
Create/reuse a canonical guard alongside `assertBrandAccess`:
```ts
// lib/governance/access-control.ts (where assertBrandAccess lives)
export async function assertTier(orgId: string, required: Tier, tx: DbOrTx) {
  const tier = await getSubscriptionTier(orgId, tx);   // ⚠️ subscriptions.tier — NEVER organizations.tier
  if (!isTierAtLeast(tier, required)) {
    throw new ForbiddenError();   // → 403
  }
}
```
Apply to **every** Growth+ route: it must return **403 with NO data** before any query runs.
⚠️ **`subscriptions.tier` is the SOLE source of truth** — never `organizations.tier` (the S8 footgun).

**Canon's tier map:**
| Surface | Required |
|---|---|
| Autopilot loop, Health Check, Action Progress Tracker, per-prompt trend, persona dashboards | **Growth+** |
| Agency multi-brand command centre / cross-brand task queue | **Agency+** |

### 3 — The client gate becomes a PRESENTATION of a denial, not the denial
`TierGate` should render the lock **because the API returned 403** — not instead of asking. Ideally
the page **does not fetch at all** when the tier is insufficient (saves the round-trip), but the
**server must reject regardless** — a client that "decides not to fetch" is not a control either.

### 4 — Prove it the only way that counts
```bash
# As a FREE-tier user's session, hit the endpoint directly:
curl -H "Cookie: <free-tier session>" \
  http://localhost:3000/api/brands/{brandId}/latest-audit -i
```
**MUST return 403 with an empty/error body.** If it returns **200 with the audit data**, the gate is
still cosmetic.

Then in Playwright (§5.5), strengthen the assertion:
- Free tier → the page shows the lock **AND** ⚠️ **the network response contains no audit data**
  (inspect the XHR body, not just the DOM), **AND** the DOM contains no scores.
- **BREAK-PROOF:** remove `assertTier` from one route → the free-tier test goes **RED** with a 200 +
  leaked payload. **Paste that RED.** *That is the only proof the gate is real.*

### 5 — Fixture: the S8 footgun
`organizations.tier='free'` + `subscriptions.tier='growth'` → **MUST be ALLOWED (200).**
Point the gate at `organizations.tier` → this goes RED. Include it.

---

# FIX S9-MED-08 (F26) — the Health Check grid is a hardcoded inline style; it does NOT respond to viewport

## The finding
`components/domain/autopilot/health-check-panel.tsx:184`:
```ts
gridTemplateColumns: `repeat(${Math.min(dimensions.length, 4)}, 1fr)`   // ← inline style
```
- **Max 4 columns, hardcoded.** Canon binds **`grid-cols-1 sm:grid-cols-2 lg:grid-cols-5`**.
- **An inline style has no breakpoints** — it **does not stack on mobile at all.**
- At **375px, 3–4 fixed columns will overflow or be unreadable.**
- The **#1 Action** renders as a separate panel (line 276), not as canon's **5th grid cell**.

**The Health Check is the trial→paid conversion surface — and it is broken on phones.** Every
screenshot this sprint has been a wide desktop window, which is why nobody saw it.

## Task
Replace the inline `gridTemplateColumns` with the canon Tailwind classes:
```tsx
className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
```
⚠️ **Two decisions for Sri — REPORT, don't choose unilaterally:**
1. **Is the #1 Action the 5th grid card (canon), or a separate panel below (current UX)?** Canon says
   *"5 traffic-light sections"* and *"#1 ACTION (the 5th section)"*. The current separate-panel layout
   arguably reads better. **Sri decides.**
2. **SaaS brands hide Local Authority → 3 dims + action = 4 cards.** Does the grid stay
   `lg:grid-cols-5` (with a gap) or become 4? Canon doesn't say.

**Verify with Playwright at 375 / 640 / 1280** — assert the computed column count and **no horizontal
overflow** (`document.body.scrollWidth <= viewport.width`).

---

## CONSTRAINTS
- **F28 first.** It's the security/revenue finding; F26 is layout.
- ⚠️ `subscriptions.tier` **only**. Never `organizations.tier`.
- Do NOT weaken `assertBrandAccess` while adding `assertTier` — they're orthogonal (ownership vs tier).
- Report F26's two design questions; do not redesign the Health Check unilaterally.

## REPORT BACK (paste inline)
1. **The route inventory** — which Growth+ routes had NO tier check? (This number is the blast radius.)
2. **The curl proof:** free-tier session → `/latest-audit` → **403**, not 200-with-data.
3. **The break-proof RED** — remove `assertTier` → free-tier test goes red with a leaked payload.
4. The `organizations.tier='free'` + `subscriptions.tier='growth'` → 200 fixture.
5. F26: the grid fixed + **screenshots at 375 / 640 / 1280** + your recommendation on the two design
   questions.
