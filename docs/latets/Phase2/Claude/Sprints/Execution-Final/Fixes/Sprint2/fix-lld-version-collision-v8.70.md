# Claude Code — METADATA FIX (docs only): version-number collision — bump audit/start canon correction to v8.70

The `audit/start → audit.run` canon-correction work was mislabelled as **v8.69**, but the LLD was **already at
v8.69** when that work began. The existing v8.69 CHANGELOG entry belongs to the PRIOR session's **TC-01
task-creation entry point** fix. Stamping the canon correction as a second v8.69 creates two completely different
change sets under one version number — ambiguous, and it breaks the "version = clean pointer" discipline
(`treat anything below v8.66 as stale`).

Ground truth (from the LLD as it stands):
- `# Version: 8.69`
- Top CHANGELOG entry: `v8.69 — TASK-CREATION ENTRY POINT (TC-01) — Sprint 2 manual-testing finding.` ← prior
  session, NOT the audit/start work.

**The audit/start canon correction must be v8.70.** This is a documentation-only metadata fix — no source, no
spec content changes; only the version label on the canon-correction change set.

> **Investigate-first (quick).** Open both LLDs (`phase-2/01-lld/visibleau-phase2-7layer-lld-v8.69.md` and
> `phase-1/02-lld/visibleau-phase1-7layer-lld.md`) and confirm:
> - The current `# Version:` line value.
> - That the top/most-recent CHANGELOG entry labelled v8.69 is the **TC-01 task-creation** entry (prior session).
> - That the **audit/start canon correction** CHANGELOG entry (the one listing the four fixed functions:
>   trigger-validation-reaudit, audit-schedules-cron, schedule-workflow-runs, bulk-reaudit-orchestrate) is
>   ALSO currently labelled v8.69 — i.e. the collision.
> Report what you find, then apply the fix below.

---

## THE FIX

1. **Bump the version header** in BOTH LLDs (if both were touched by the canon correction):
   `# Version: 8.69` → `# Version: 8.70`

2. **Re-label the audit/start canon-correction CHANGELOG entry** from v8.69 → **v8.70**:
   - Keep its full text exactly (the description of the audit/start → audit.run correction + the list of four
     affected functions). ONLY change the version number on the entry heading.
   - It must sit **ABOVE** the existing v8.69 (TC-01) entry, as the newest entry at the top of the CHANGELOG.

3. **Update the inline correction stamps** inside the spec annotations (the D-05 entry, the
   triggerValidationReaudit skeleton/QUOTA-NOTE, Foundations, Architecture):
   `[CORRECTED 2026-06-28 v8.69]` → `[CORRECTED 2026-06-28 v8.70]`
   so the inline stamps match the CHANGELOG version they refer to. (Tier 2 sprint-prompt inline notes that say
   "see D-05 v8.69" → "see D-05 v8.70" for the same reason.)

4. **Do NOT touch the v8.69 (TC-01) entry** — it stays as-is, describing only the task-creation entry-point fix.

## INVARIANTS
- Docs only. No source changes. No spec content changes — only the version label/stamps on the canon-correction
  change set move from v8.69 → v8.70.
- v8.69 must remain EXCLUSIVELY the TC-01 task-creation fix. v8.70 must be EXCLUSIVELY the audit/start canon
  correction. One version = one change set.
- Both LLDs stay consistent with each other (same header version, same entries).
- The prototype is unchanged and not re-pinned by this (no prototype edit).

## VERIFY
1. `grep -nE "^# Version:" phase-2/01-lld/*.md phase-1/02-lld/*.md` → both show **8.70**.
2. The CHANGELOG now has, top-down: **v8.70** (audit/start canon correction, four functions listed) ABOVE
   **v8.69** (TC-01 task-creation) — two distinct entries, two distinct change sets, no collision.
3. `grep -rn "v8.69" phase-2/01-lld phase-1/02-lld` → remaining v8.69 references are ONLY the TC-01 entry and any
   legitimate historical mentions; the audit/start correction stamps now read v8.70.
4. The v8.69 (TC-01) entry text is unchanged.

## REPORT
- Confirmed header version before (8.69) and after (8.70) on both LLDs.
- Confirmation that v8.69 = TC-01 only and v8.70 = audit/start canon correction only (no overlap).
- The inline stamps updated to v8.70.
- Docs only, no source, no spec content changed.

## NOTE — handover / canonical-version pointer is now stale
The stored canonical-version reference (currently "LLD v8.68 canonical") is now TWO versions behind. After this
fix, current canonical is **v8.70**. Update the handover/notes so the next session knows:
- **v8.70** = current canonical (audit/start → audit.run canon correction)
- **v8.69** = TC-01 task-creation entry point (prior session)
- Treat anything below v8.66 as stale (unchanged).
