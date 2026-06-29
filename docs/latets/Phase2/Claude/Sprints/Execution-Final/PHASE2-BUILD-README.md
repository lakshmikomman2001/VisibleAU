# PHASE2-BUILD-README

**VisibleAU Phase 2 — how to build it with Claude Code.**
This is the orientation + read-order document. Read it once before opening Sprint 1, then follow the
per-sprint ritual for each of S1…S9.

> **Scope of this file.** This README tells Claude Code *what to read, in what order, before building each
> sprint*. It does **not** contain bug fixes or canon edits — those are separate standalone documents (see
> "Prerequisites" below). Keep them separate: this file is process; the fixes are content.

---

## 0. THE ONE PRINCIPLE

**The sprint prompt is the index into the LLD — not a replacement for it.**

Each sprint prompt's header declares the exact LLD line-regions and prototype components it depends on
(a `# Source anchors:` block). So Claude Code never reads the whole 9,365-line LLD up front. It reads the
**prompt** in full, then opens **only** the LLD regions and prototype components the prompt cites. Where the
prompt and the LLD differ, **the LLD wins** — which is exactly why the actual LLD region must be read, not
just the prompt's summary of it.

---

## 1. PREREQUISITES — clear these BEFORE Sprint 1 (they are NOT in this file)

Two Phase 1 issues are hard gates on the Phase 2 build. They live in their own standalone fix documents and
must be applied first:

1. **Retention-cron status fix** — `visibleau-fix-retention-cron-status.md`.
   Phase 1's retention cron filters `audits.status='completed'` but the value is `'complete'` (no -d), so it
   deletes zero rows. **Phase 2's retention CASCADE/SET-NULL chain depends on this cron actually deleting
   audits.** This is a repo code change (run via Claude Code against the built Phase 1 repo).

2. **Inngest path-drift fix** — `visibleau-fix-inngest-path-drift.md`.
   The Phase 2 sprint prompts' verification greps target `app/api/inngest/route.ts`, but the canonical route
   is `app/api/webhooks/inngest/route.ts` (CLAUDE.md §6). Left unfixed, a correct build fails its own
   verification or the builder creates a split second route file that silently unserves functions. This is a
   prompt/canon doc edit (applied to the sprint prompts in the reviewer chat).

**Do not start Sprint 1 until both are applied.** This README assumes they are.

> **Status (as of last update):** BOTH prerequisites are resolved. Fix 1 (Inngest path) was applied and
> verified — including two follow-up misses the first pass left (a go-live-checklist URL and the
> canonical-bundle LLD copy), both since corrected. Fix 2 (retention cron) was investigated and found
> **already correct** in the built code (the cron uses age-only deletion, no status bug); confirmed by a
> behavioural test that seeded a 13-month-old audit and watched it actually delete. Two unrelated
> `'completed'`→`'complete'` bugs (bulk-export, an e2e test) were cleaned up in passing. Phase 2 is unblocked.

---

## 1a. CANONICAL FILES — which copy is the source of truth

There are **multiple copies** of the canon files on disk (Execution, Builder, Sprint123/456, several Design
snapshots v1–V13, handoff copies, a "canonical-bundle" folder, etc.). A path-drift verification found the LLD
existing in **16 copies** that had *drifted out of sync* on a basic fact. This is a real risk for a workflow
whose core rule is "the LLD wins" — that rule only works if there is ONE LLD. Before building, pin the
canonical copy and treat everything else as archive:

| Canon file | **Canonical copy (what Claude Code reads for Phase 2)** | Everything else |
|---|---|---|
| LLD | `Execution/Design/visibleau-7layer-lld.md` (v8.68; the build-source copy, verified clean) | Design v1–V13, Sprint123, SprintFinalAudit, root, canonical-bundle copies = **archive, do not read** |
| Prototype | the `visibleau-prototype-phase2.jsx` alongside the canonical LLD (FIX 16) | older prototype copies = archive |
| Sprint prompts | the `visibleau-p2-sprint-N-prompt.md` set alongside the canonical LLD | other prompt copies = archive |

**Rule:** every Phase 2 build session and every review session reads from the ONE canonical set above. Do not
open an archive copy believing it is canonical — the folder named "canonical-bundle" is NOT the canonical
source (its LLD was found carrying a stale path); the canonical source is the Execution copy. If you ever need
to designate a different canonical copy, do it explicitly and update this table — never let two copies silently
compete.

---

## 2. THE FILES IN THIS BUNDLE

| File | What it is | When read |
|---|---|---|
| `VISIBLEAU-PHASE2-v8.68-CONTENTS.txt` | Manifest — file list, build order, invariants, verify greps | Phase 0, once |
| `visibleau-NEW-CHAT-HANDOFF-v8.68.md` | Where Phase 2 stands; what changed in v8.68; what was deliberately NOT changed | Phase 0, once |
| `visibleau-7layer-lld.md` | **CANON** — LLD v8.68 (9,365 lines): 37 tables, 25 Inngest functions, 16 GAPs, 7 layers | Per sprint, cited regions only |
| `visibleau-prototype-phase2.jsx` | **CANON** — prototype FIX 16 (3,437 lines): 14 Figma-style screens, fully styled | Per sprint, cited components only |
| `visibleau-p2-sprint-N-prompt.md` (×9) | The build instruction + index for sprint N | Per sprint, in full |
| `PHASE2-BUILD-README.md` | This file | Phase 0, once |

**Build order is fixed: S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8 → S9.** Each sprint depends on earlier sprints'
tables/services (e.g. S3 creates the ExplainabilityService that S5/S6/S9 reuse; S1's tables underpin
everything). Never build out of order or in parallel.

---

## 3. PHASE 0 — once, at the very start (before Sprint 1)

Done a single time when you open the Phase 2 build:

1. **Read `VISIBLEAU-PHASE2-v8.68-CONTENTS.txt`** in full — the manifest (2 minutes).
2. **Read `visibleau-NEW-CHAT-HANDOFF-v8.68.md`** in full — orientation, and especially **what was
   deliberately NOT changed** (see §5 Deliberate Deferrals — don't "fix" these).
3. **Run the canon-verify greps and STOP if any fail:**
   ```bash
   grep -m1 '# Version:' visibleau-7layer-lld.md          # → # Version: 8.68
   grep -c 'FIX 16 (v8.68)' visibleau-prototype-phase2.jsx  # → 1
   grep -c 'ATTRIBUTION CORRECTION' visibleau-7layer-lld.md # → 3
   ```
   If these don't match, the canon is stale — resolve before building anything.
4. **Map the LLD's shape — don't read it cover-to-cover.** Just index its headers so the per-sprint anchors
   are navigable:
   ```bash
   grep -n '^# \|^## ' visibleau-7layer-lld.md   # the 7-layer structure + section map
   ```

Phase 0 is done **once**. Everything after is the per-sprint ritual.

---

## 4. PER-SPRINT RITUAL — repeat for each of S1…S9

For sprint **N**, in this exact order:

**Step 1 — Read the sprint prompt in full: `visibleau-p2-sprint-N-prompt.md`.**
This is the build instruction *and* the index. Read it completely. Its header carries:
- a `# Source anchors:` block — the LLD line-regions + prototype line-refs it depends on;
- a **§0.3 canon gate** — confirms it's building against v8.68 (8.67/8.66 also valid);
- a **Step 0 investigate-first** section — repo greps to run before writing code.

**Step 2 — Read ONLY the LLD regions the prompt cited: `visibleau-7layer-lld.md`.**
Open each region named in the prompt's `# Source anchors:` (e.g. S3: "Layer 2 ~5852, tables 12–18 at
5873/5897/5939/…, the two FK ALTERs ~7591/7600"). Read those regions. **Where the prompt and the LLD differ,
the LLD wins.** Line numbers are *navigational, not literal* — they drift a few lines between LLD copies, so
confirm by content (the section header / table name), not the exact line.

**Step 3 — Read ONLY the prototype components the prompt cited: `visibleau-prototype-phase2.jsx`.**
The prompt's header gives line-refs (e.g. S2: "WorkflowHub 2096, ContentDraftEditor 2231, EnhancedDashboard
1061, shared components 492–840"). These are fully-styled Figma-style specs — read them so the built UI
matches (styling included, not just structure).

**Step 4 — Run the prompt's Step 0 against the REAL repo, then build.**
Each prompt opens with an investigate-first Step 0 (grep the repo to confirm earlier sprints' tables/services
exist). Run it against the actual repo before writing code — S*N* depends on S1…S*N-1* being built. Then
build per the prompt, with the LLD as the tiebreaker.

**Shape, every time:** prompt (whole) → LLD (cited regions only) → prototype (cited components only) → Step 0
repo-investigate → build.

### Reusable opening line (paste at the top of each Claude Code sprint session, swap N)
> Before building: (1) read `visibleau-p2-sprint-N-prompt.md` in full. (2) From its `# Source anchors:`
> header, open and read ONLY those cited regions of `visibleau-7layer-lld.md` — where the prompt and LLD
> differ, the LLD wins. (3) From its header's prototype line-refs, read ONLY those components of
> `visibleau-prototype-phase2.jsx` for the UI spec. (4) Run the prompt's Step 0 repo-investigation to confirm
> earlier sprints' tables/services exist. (5) Confirm the §0.3 canon gate (LLD reads v8.68). Then build. Do
> not read the whole LLD — use the prompt's anchors.

---

## 5. LOCKED INVARIANTS & DELIBERATE DEFERRALS (don't "fix" these)

Carry these across every sprint. They are intentional — a builder who "corrects" them introduces a bug.

**Invariants:**
- **37 tables, 16 GAPs, serve() = 25 Inngest functions** at Phase 2 completion. The function count climbs
  toward 25 across the sprints, all registered in the **single** `app/api/webhooks/inngest/route.ts` serve()
  array — **never** a second route file (see Prerequisite 2).
- **Explainability contract** `{ rationale, confidence_label, confidence_note, top_action }` holds across all
  scored sprints (S3 creates the service; S5/S6/S9 reuse/render it). Rationale must be specific (>30 chars,
  naming a real signal) — not a bare number.
- **Four status enums, never unified:** `audits='complete'` (no -d) · `workflow_runs='completed'` (-ed) ·
  remediation_tasks (open/in_progress/ready_for_review/complete/wont_fix — NOT 'done') · content_drafts
  (draft/approved/published/rejected).
- **`assertBrandAccess(user, brandId)`** is the canonical brand-isolation gate on every brand-scoped surface
  — org-scoped RLS alone does NOT enforce per-brand access.
- **Scores are 0–100** (composite + dimensions); `mention_source_ratio` is 0–1; div-by-zero guards return
  NULL, not NaN. `score_of_10` (entity score) is a SEPARATE 0–10 value — never conflate.
- **Tiers:** Free = 2 engines / paid = 4. Discovery is Agency+. Reports *generation* is Growth+ (Starter has
  no entitlement even if the tab shows). `subscriptions.tier` is the sole tier source — never
  `organizations.tier`.

**Deliberate deferrals (NOT bugs — leave them):**
- **OQ-1 `local_seo_results`** is deferred — no DDL until a dedicated local-SEO pass.
- **`local_ai_trust_score` stays NULL for SaaS** by design (S6b-02). `task_score` is still computed for ALL
  verticals — only the local-trust composite is SaaS-NULL.
- **RM-02 (aria-live regions) + responsive breakpoints** are forward build rules — apply them as you build
  each screen; they are not yet in the prototype.

---

## 6. AFTER EACH SPRINT BUILDS — the review step (separate from this README)

This README covers *building*. The standing project discipline still applies *after* each sprint:

- **Independent review by a fresh chat** — the two-chat relay: a reviewer chat verifies the built code against
  canon (grep sources, LLD wins, a ready-to-paste fix prompt for every issue found, including LOW).
- **"Code reported done + typecheck passes ≠ works on the rendered screen."** Manually test each sprint's UI
  surfaces logged in (Phase 2 pages are all `app/(auth)/…`). The Phase 2 UI test plan lists which screens each
  sprint produces.

These are separate workflows — not part of the build read-order above.

---

## 7. QUICK REFERENCE

```
CANONICAL LLD:    Execution/Design/visibleau-7layer-lld.md  (ONE source of truth — all other copies = archive)
PHASE 0 (once):   CONTENTS → HANDOFF → verify-greps → LLD header map
PER SPRINT (×9):  prompt(full) → LLD(cited regions) → prototype(cited components) → Step 0 repo → build
BUILD ORDER:      S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8 → S9   (hard dependency chain)
TIEBREAKER:       LLD wins over the prompt, always.
CANON:            LLD v8.68 · prototype FIX 16 · 37 tables · 25 fns · 16 GAPs
PREREQUISITES:    Inngest-path fix + retention-cron fix — BOTH RESOLVED (see §1 status note). Phase 2 unblocked.
```
