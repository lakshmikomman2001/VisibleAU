# Fix 1 — CLEANUP: two remaining Inngest-path lines (found by verification)

Fix 1 verification found two `/api/inngest` → `/api/webhooks/inngest` lines still uncorrected. Fix **only
these two specific lines**. Do not touch anything else — not the frozen Design v1-V13 LLD snapshots, not the
`-old-donot-use` file, not the intentional "this is the wrong path" anti-pattern notes, not the fix-docs
themselves. This is a 2-line surgical edit.

---

## EDIT 1 — `golive-checklist.md` line ~41 (HIGH — production deployment risk)

The live go-live checklist has the wrong Inngest registration URL. Following it at launch registers the wrong
endpoint → all production jobs queue indefinitely (the JF2 risk).

- **Find:** `Register Inngest production app URL (https://visibleau.com/api/inngest)`
- **Change to:** `Register Inngest production app URL (https://visibleau.com/api/webhooks/inngest)`

Only the URL changes; leave the rest of the checklist line (the "AFTER DNS live" note etc.) intact.

## EDIT 2 — `latets/NewChat/V3/visibleau-canonical-bundle/02-phase2-lld/visibleau-7layer-lld.md` line ~3993

This LLD copy sits in a folder named "canonical-bundle" but still carries the bare path. Correct it so the
folder's name and contents don't disagree.

- **Find:** `Phase 2 Inngest functions — MUST be added to serve() in \`app/api/inngest/route.ts\`:`
- **Change to:** `Phase 2 Inngest functions — MUST be added to serve() in \`app/api/webhooks/inngest/route.ts\`:`

(Same single-line correction the Execution LLD copy already received.)

---

## DO NOT TOUCH (explicitly out of scope)
- The 13 frozen Design LLD snapshots (`latets/Phase2/Claude/Design/v1…V13/…`) — historical, leave as-is.
- `latets/Phase2/visibleau-7layer-lld.md` (root copy) and `Sprint123` / `SprintFinalAudit` LLD copies —
  historical/archival; leave as-is unless YOU later designate one canonical.
- `sri-visibleau-sprint-12-prompt-old-donot-use.md` — explicitly abandoned.
- Sprint 1 anti-pattern notes, Sprint 2 changelog, the fix-docs — intentional documentation of the wrong path.
- Historical Phase 1 sprint prompts (S2/S6/S7/S8/S9) and QA/E2E reference docs — already-built code uses the
  correct path; these are never re-run.

---

## VERIFY (after the 2 edits)
```bash
# 1. The go-live checklist URL is now canonical:
grep -n "visibleau.com/api/webhooks/inngest" golive-checklist.md   # → present
grep -n "visibleau.com/api/inngest" golive-checklist.md | grep -v webhooks   # → empty

# 2. The canonical-bundle LLD line is fixed:
grep -n "api/inngest" latets/NewChat/V3/visibleau-canonical-bundle/02-phase2-lld/visibleau-7layer-lld.md | grep -v webhooks   # → empty

# 3. Confirm nothing else changed — only 2 files touched:
git status --short   # → only golive-checklist.md + the canonical-bundle LLD modified (if under git)
```

Report: the two greps' results + confirmation that exactly two files were modified. Make no other edits.
