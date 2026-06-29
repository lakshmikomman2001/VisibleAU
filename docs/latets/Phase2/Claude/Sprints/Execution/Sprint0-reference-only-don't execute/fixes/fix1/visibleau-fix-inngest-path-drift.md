# VisibleAU — FIX: Inngest endpoint path drift (`/api/inngest` → `/api/webhooks/inngest`)

**Scope:** Phase 2 sprint prompts (the priority — your imminent build) + a few Phase 1 references.
**Severity: HIGH for the Phase 2 build** — every Phase 2 sprint prompt's verification greps point at the
WRONG, non-existent route path, so they will fail on a correct build and may lure the builder into creating a
second, split Inngest registration that silently leaves half your functions unserved.

> This is a **prompt + canon edit** done in the REVIEWER chat (this side), BEFORE Claude Code builds Phase 2.
> It is NOT a repo code change — it corrects the documents Claude Code reads. (The few Phase 1 items are
> prompt-doc fixes too; the built Phase 1 route is already at the correct path — see "Already correct" below.)

---

## THE CANONICAL FACT (verified)

CLAUDE.md §6 (line 342) declares the Inngest handler lives at:
```
app/api/webhooks/inngest/route.ts
```
This is locked. Sprint 1/2/3 (Phase 1) were corrected to it via the T4/B/Z3/X7 fixes; the built Phase 1 route
is already there. The production Inngest-dashboard URL is therefore `https://visibleau.com/api/webhooks/inngest`.
Anywhere that says `app/api/inngest/route.ts` or `…/api/inngest` (without `webhooks/`) is **wrong**, EXCEPT
lines that mention it only to label it as the wrong path (those are intentional documentation — leave them).

## WHY THIS BITES THE PHASE 2 BUILD (the important part)

Every Phase 2 sprint prompt ends with a verification grep like:
```bash
grep -cE "calculateShareOfVoice|aggregateVisibilityTrend|..." app/api/inngest/route.ts   # → 6   (S3)
```
The path `app/api/inngest/route.ts` **does not exist** (the real file is `app/api/webhooks/inngest/route.ts`).
So after a *correct* build that registered the functions at the canonical path, this grep:
- returns 0 / errors → the sprint's verification **fails despite a correct build**, OR
- prompts the builder to "make the grep pass" by **creating** `app/api/inngest/route.ts` and registering the
  functions there — splitting Inngest registration across two route files. Result: only one file is the real
  served endpoint; **the functions registered in the other file never run**, and the Inngest dashboard never
  sees them. That's a silent, production-breaking split.

This is exactly the long-flagged Phase 2 prerequisite. Fix the prompts' paths so the greps target the real file.

---

## PART A — PHASE 2 SPRINT PROMPTS (do this first; it's the imminent build)

In each Phase 2 sprint prompt, correct the verification-grep path. One occurrence per file (S8 has none):

| File | Line (approx) | Current (wrong) | Fix to |
|---|---|---|---|
| `visibleau-p2-sprint-1-prompt.md` | 454 | `git diff --stat app/api/inngest/route.ts` | `app/api/webhooks/inngest/route.ts` |
| `visibleau-p2-sprint-2-prompt.md` | 489 | `grep -cE "…" app/api/inngest/route.ts` | `app/api/webhooks/inngest/route.ts` |
| `visibleau-p2-sprint-3-prompt.md` | 537 | `grep -cE "…" app/api/inngest/route.ts` | `app/api/webhooks/inngest/route.ts` |
| `visibleau-p2-sprint-4-prompt.md` | 483 | `grep -cE "…" app/api/inngest/route.ts` | `app/api/webhooks/inngest/route.ts` |
| `visibleau-p2-sprint-5-prompt.md` | 547 | `grep -cE "…" app/api/inngest/route.ts` | `app/api/webhooks/inngest/route.ts` |
| `visibleau-p2-sprint-6-prompt.md` | 534 | `grep -cE "…" app/api/inngest/route.ts` | `app/api/webhooks/inngest/route.ts` |
| `visibleau-p2-sprint-7-prompt.md` | 470 | `grep -cE "…" app/api/inngest/route.ts` | `app/api/webhooks/inngest/route.ts` |
| `visibleau-p2-sprint-9-prompt.md` | 361 | `grep -Rc "serve(" app/api/inngest/route.ts` | `app/api/webhooks/inngest/route.ts` |

**Mechanical rule:** in these eight files, replace `app/api/inngest/route.ts` → `app/api/webhooks/inngest/route.ts`.
Do NOT touch any line that already reads `app/api/webhooks/inngest/route.ts`. (S8 needs no change.)

> Each sprint adds Inngest functions to the SINGLE canonical `serve()` array in
> `app/api/webhooks/inngest/route.ts`. The running total across Phase 2 reaches 25 functions. The greps should
> confirm registration in that ONE file — never a second route file.

---

## PART B — PHASE 1 PROMPT REFERENCES (lower priority; do for canon consistency)

These Phase 1 prompt docs also carry the wrong path. The built Phase 1 route is already correct, so this is
doc-hygiene + preventing a wrong production-dashboard URL.

### B1 — Sprint 10 (registration comment)
`sri-visibleau-sprint-10-prompt.md` ~line 1211:
- `// Add sampleAuditCleanup to serve() array in app/api/inngest/route.ts`
- → `// Add sampleAuditCleanup to serve() array in app/api/webhooks/inngest/route.ts`

### B2 — Sprint 12 (the HIGH-impact ones: the Inngest-dashboard URLs)
`sri-visibleau-sprint-12-prompt.md` — these are the **production/staging registration URLs**. Registering the
wrong URL means **all jobs queue indefinitely** (the prompt's own JF2 warns of this). Fix all of them:
- ~703: `vercel.json` key `"app/api/inngest/route.ts": { "maxDuration": 60 }` → `"app/api/webhooks/inngest/route.ts": …`
- ~709: comment `// /api/inngest must respond within 30s…` → `// /api/webhooks/inngest must respond within 30s…`
- ~1155: `Register Inngest production app URL (https://visibleau.com/api/inngest)` → `https://visibleau.com/api/webhooks/inngest`
- ~1292: `Inngest → Staging → Apps → Sync https://[staging-url]/api/inngest` → `…/api/webhooks/inngest`
- ~1442: `Enter: https://visibleau.com/api/inngest (the production Inngest endpoint…)` → `https://visibleau.com/api/webhooks/inngest`
- (the changelog mention of `https://visibleau.com/api/inngest` in the JF2 note may be left as historical, or corrected for consistency — your call; the live instruction lines above are what matter.)

### B3 — Sprint prompts index
`sri-visibleau-sprint-prompts-index.md` — 1 wrong-path ref → `app/api/webhooks/inngest/route.ts`.

---

## ALREADY CORRECT — DO NOT "FIX" THESE (they document the right decision)

Leave every line that mentions `app/api/inngest/route.ts` **only to flag it as wrong**, e.g.:
- Sprint 1 file tree: `inngest/route.ts  # T4 fix: canonical path is app/api/webhooks/inngest/route.ts … originally had app/api/inngest/route.ts — wrong path.`
- Sprint 1 §12 anti-pattern: `Do not use app/api/inngest/route.ts … canonical is app/api/webhooks/inngest/route.ts.`
- Sprint 2 file tree / §10: `…/inngest/route.ts  # B fix: canonical path … (was api/inngest/route.ts)`
- Any changelog (T4/B/Z3/X7) entry describing the historical correction.

These are intentional — removing them would lose the record of why the path is what it is. The fix is ONLY the
lines that *instruct* the wrong path (greps, registration comments, dashboard URLs, vercel.json keys).

---

## VERIFICATION (after the edits)
```bash
# 1. PHASE 2 prompts — every verification grep now targets the canonical path:
cd <phase2-bundle>
grep -rn "app/api/inngest/route.ts" visibleau-p2-sprint-*.md          # → 0 matches (all corrected)
grep -rc "app/api/webhooks/inngest/route.ts" visibleau-p2-sprint-*.md # → S1-S7,S9 each ≥1; S8 may be 0

# 2. PHASE 1 prompts — only the intentional "this is the wrong path" mentions remain:
cd <phase1-bundle>/04-sprint-prompts
grep -rn "api/inngest/route.ts" *.md | grep -v "webhooks/inngest"
#   → every remaining hit must be a line that LABELS /api/inngest as wrong (T4/B anti-patterns, file-tree
#     notes, changelogs). No remaining hit should be an INSTRUCTION (grep target, registration comment,
#     dashboard URL, vercel.json key).

# 3. No production/staging dashboard URL points at the bare path:
grep -rnE "visibleau.com/api/inngest|/api/inngest\b" *.md | grep -v "webhooks"
#   → 0 live-instruction matches (historical changelog mentions optional to keep).
```

### Build-time confirmation (when Phase 2 sprints run)
- After each Phase 2 sprint builds, its (now-corrected) grep targets `app/api/webhooks/inngest/route.ts` and
  finds the registered functions there. The function count climbs toward 25 in that ONE file.
- There is **never** a second `app/api/inngest/route.ts` created. Spot-check after S1:
  `test -f app/api/inngest/route.ts && echo "WRONG — split registration" || echo "OK — single canonical route"`.
- At Phase 2 completion, the Inngest dashboard is synced to `https://visibleau.com/api/webhooks/inngest` and
  shows all 25 functions.

---

## NOTE FOR THE REVIEWER
This is the second long-flagged Phase 2 prerequisite (after the retention-cron `'completed'`→`'complete'` fix).
The drift is doc-level but build-affecting: the Phase 2 prompts' verification greps pointed at a non-existent
route, which would fail correct builds or induce a split registration that silently unserves functions. The
canonical path (`app/api/webhooks/inngest/route.ts`, CLAUDE.md §6) was already enforced for the Phase 1 route
file; this fix aligns the PROMPT references (P2 greps + a few P1 docs + the P1 production dashboard URLs) to it.
After this and the retention-cron fix land, both hard Phase 2 prerequisites are cleared and S1 can open.
Worth a one-line guard in the Phase 2 build-README: "all Inngest functions register in the single
app/api/webhooks/inngest/route.ts serve() array; never create app/api/inngest/route.ts."
