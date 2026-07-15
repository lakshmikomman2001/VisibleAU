# FIX S9-HIGH-07 (F17) — Autopilot loop stalls at step 2: the `Array.isArray` fallback SWALLOWS wrapped envelopes

## Severity: HIGH — the loop never advances past step 2 for ANY brand with real gaps. Steps 3/4/5 (including the honesty-rule pending state) are unreachable in practice. This is the sprint's flagship "aha" loop.

## The finding (Bondi, `/brands/0f531803-.../autopilot`)
The screen says **"No gaps identified yet."**
**Bondi HAS an open gap.** Verified twice:
- Step 0 (DB): `remediation_tasks` → **"Update local directory listings"** (status `open`, priority 5000)
- The Health Check renders it RIGHT NOW as the **#1 recommended action** (same brand, same data)

The Autopilot loop cannot see it.

## Root cause — the `Array.isArray` fallback is the F16 bug, not a protection against it
The F15 report classified these three as **"Already OK — `Array.isArray` fallback"**:
| Fetch | Route returns | Page does | Result |
|---|---|---|---|
| `/topical-gaps` | `{ gaps: [...] }` (or bare array?) | `Array.isArray(raw) ? raw : []` | **object → false → `[]`** |
| `/tasks` | `{ tasks: [...] }` (or bare array?) | `Array.isArray(raw) ? raw : []` | **object → false → `[]`** |
| `/drafts` | `{ drafts: [...] }` (or bare array?) | `Array.isArray(raw) ? raw : []` | **object → false → `[]`** |

`Array.isArray()` on a **wrapped object** is **always false** → it falls through to an empty array →
"No gaps identified yet." **The tolerance IS the bug** — identical to F16's discovery page
(`Array.isArray` on `{ journeys, templates }` → 0 journeys). It was assessed as safe and never
verified on screen.

**The proof it's a lie, not an honest empty:** Metropolitan has NO open task (Step 0 confirmed) — so
its "No gaps identified yet" is TRUE. Bondi HAS one — so its identical message is FALSE. **Same
screen, same copy, one honest and one lying.** Only the DB answer key distinguishes them.

## Task

### 1 — Establish each route's ACTUAL return shape (don't assume)
```bash
cd c:/startup/VisibleAU/src
for r in topical-gaps tasks drafts; do
  echo "=== /$r ==="
  grep -n "return NextResponse.json\|NextResponse.json(" "app/api/brands/[brandId]/$r/route.ts" | head -3
done
```
Report exactly what each returns: a **bare array** `[...]`, or an envelope `{ gaps: [...] }` /
`{ tasks: [...] }` / `{ drafts: [...] }` (and any sibling keys).

### 2 — Unwrap correctly in `autopilot/page.tsx`
Replace each `Array.isArray(raw) ? raw : []` with an explicit unwrap keyed to the route's REAL shape:
```ts
const gapsData   = gapsRes.ok   ? await gapsRes.json()   : null;
const gaps       = gapsData?.gaps   ?? (Array.isArray(gapsData)   ? gapsData   : []);

const tasksData  = tasksRes.ok  ? await tasksRes.json()  : null;
const tasks      = tasksData?.tasks  ?? (Array.isArray(tasksData)  ? tasksData  : []);

const draftsData = draftsRes.ok ? await draftsRes.json() : null;
const drafts     = draftsData?.drafts ?? (Array.isArray(draftsData) ? draftsData : []);
```
(Keep a bare-array fallback ONLY if a route genuinely returns one — but the named key must be tried
FIRST. Better: once Step 1 tells us the real shape, use the exact unwrap and drop the guessing.)

### 3 — Confirm the loop now ADVANCES for Bondi
With the gap/task/draft data flowing, `deriveStepStatus()` should advance:
- **step 1** `done` — audit complete (real score/engines/prompts)
- **step 2** `done` — the gap EXISTS → shows **"Update local directory listings"**
- **step 3** `current`/`done` — the explainability rationale ⚠️ (known F9/F13 gap: `description` is
  NULL and there's no `explainability` column — report EXACTLY what renders; an empty rationale here
  is the upstream gap, not a new bug)
- **step 4** — the `content_draft` (does Bondi have one? check: `SELECT * FROM content_drafts WHERE
  brand_id='0f531803-...'`). If none → step 4 legitimately `pending`.
- **step 5** — **"validation audit scheduled — pending"** (`score_after` IS NULL — the honesty rule
  MUST still hold)

**This is the first time the loop will actually run end-to-end.** Steps 3/4/5 have never been
rendered with real data — they may hide further bugs (the same way step 2 did).

### 4 — Metropolitan is the CONTROL
Metropolitan has **no** open task → its "No gaps identified yet" is **correct**. After the fix it must
STILL show that (an honest empty), while Bondi advances. If both still say "no gaps", the fix didn't
take. If Metropolitan suddenly shows a gap, something's wrong in the other direction.

## Verify (on screen — both brands, side by side)
| Brand | Expected AFTER the fix |
|---|---|
| **Bondi** | Step 2 = **"Update local directory listings"** · loop advances to step 3+ · step 5 = "validation audit scheduled — pending" |
| **Metropolitan** | Step 2 = "No gaps identified yet" (**honest** — it has no open task) |

Plus: the **`<lg`** vertical stack (still owed — closes F5).

## Constraints
- Unwrap by the route's REAL key (Step 1 first — don't guess).
- Do NOT break Metropolitan's honest empty state.
- The honesty rule at step 5 must still hold (`score_after` NULL → pending, no lift number).
- Do NOT "fix" the empty rationale by generating text (F9/F13 are upstream — S9 renders, never
  regenerates). Report what step 3 shows.

## This is the FOURTH instance of the same class
F11 (health-check) · F15 (autopilot brand/audit) · F16 (discovery journeys) · **F17 (autopilot
gaps/tasks/drafts)**. The `Array.isArray` tolerance and the bare `res.json()` are two faces of one
problem: **routes return inconsistent shapes and pages guess.** The F16 prompt asks for the route
shape inventory — that inventory is now urgent. **Standardising the envelope (and deleting the
tolerant fallbacks so a mis-read fails LOUDLY) is the only durable fix.** A guard that greps for
`Array.isArray(` on a `.json()` result should be added alongside the unwrapped-`.json()` guard.

## Report back (paste inline)
1. Each route's real return shape (bare array vs envelope + key).
2. The unwrap diff.
3. **Screenshot Bondi** — step 2 showing the real gap title; how far the loop advances; what step 3
   (rationale) and step 5 (pending) show.
4. **Screenshot Metropolitan** — still the honest "No gaps identified yet".
5. **Screenshot `<lg`** — the vertical stack.
6. Any NEW bug revealed in steps 3/4/5 now that they render with real data for the first time.
