# Claude Code — START SPRINT 1: Platform Foundation (Layer: Platform)

> **Paste this into a fresh Claude Code session to start this sprint.**
> Canonical folder (all Phase 2 files live here):
> `C:\startup\VisibleAU\src\docs\latets\Phase2\Claude\Sprints\Execution-Final\`
> Read ONLY from this folder. Do not open Phase 2 copies in any other directory.

---

## STEP 0 — Canon check (confirm you are on the right, latest canon)
```bash
cd "C:/startup/VisibleAU/src/docs/latets/Phase2/Claude/Sprints/Execution-Final"
grep -m1 '# Version:' visibleau-7layer-lld.md            # → # Version: 8.68
grep -c  'FIX 16 (v8.68)' visibleau-prototype-phase2.jsx   # → 1
grep -c  'ATTRIBUTION CORRECTION' visibleau-7layer-lld.md  # → 3
```
If any value is wrong, STOP — you are on a stale copy. Do not build against it.

## STEP 1 — Read the sprint prompt IN FULL
Open and read completely: **`visibleau-p2-sprint-1-prompt.md`**.
This is both the build instruction and the index — its header lists the exact LLD regions and prototype
components this sprint needs. Read all of it, including its own internal Step 0 and acceptance criteria.

## STEP 2 — Read ONLY the cited LLD regions (not the whole 635KB file)
From `visibleau-7layer-lld.md`, open and read only the regions the prompt cites:
- §"PHASE 2 SPRINT 1 — PLATFORM FOUNDATION" (~lines 4760–5082)
- serve()/registry note (~4511)
- table inventory rows 1–7 (~8730)
- sprint plan (~8816)

**Line numbers are navigational, not literal** — they drift a few lines between copies. Open the region and
confirm by the section/table name, not the exact number. **Where the prompt and the LLD differ, the LLD wins.**

## STEP 3 — Read ONLY the cited prototype components
Sprint 1 is platform scaffolding (shell, sidebar, brand switcher, tier-aware nav) — it builds the chrome the
later screens render inside. Read whatever prototype components the prompt's body references for that chrome
from `visibleau-prototype-phase2.jsx`; do not read the whole file.

## STEP 4 — Run the prompt's own Step 0 against the REAL repo, then build
The prompt opens with an investigate-first Step 0 (grep the repo to confirm the Phase 1 foundation it builds
on). Run it against the actual repo first. Then build per the prompt, with the LLD as the tiebreaker.

---

## GUARDRAILS for this sprint
- **Inngest:** any Inngest function registers in the SINGLE `app/api/webhooks/inngest/route.ts` serve() array.
  NEVER create `app/api/inngest/route.ts`. (Sprint 1 adds the platform tables + an `audits` ALTER; confirm no
  net-new Inngest function unless the prompt specifies one.)
- **Build order:** this is Sprint 1 of 9 — the foundation. Everything later depends on its tables.
- **Don't read the whole LLD** — use the prompt's anchors above.
- After building, the post-build review (fresh reviewer chat + UI test of any new surface) is a SEPARATE step.

## Reusable one-liner (if you prefer the short form)
> Read `visibleau-p2-sprint-1-prompt.md` in full; from its source-anchors, open only the cited regions of
> `visibleau-7layer-lld.md` (LLD wins on conflict); read only the cited prototype components; run the prompt's
> Step 0 repo-investigation; then build. Don't read the whole LLD. Confirm canon = v8.68 first.
