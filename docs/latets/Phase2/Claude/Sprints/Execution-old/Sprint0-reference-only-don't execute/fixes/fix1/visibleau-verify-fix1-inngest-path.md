# VERIFY Fix 1 — Inngest path drift (verification only, NO code changes)

This is a **verification task, not a fix.** Fix 1 (correcting `app/api/inngest/route.ts` →
`app/api/webhooks/inngest/route.ts`) has already been applied. Do NOT edit any file. Run the checks below and
report the output of each. The goal is to confirm the fix is complete and consistent across all file copies,
and that nothing intentional was broken.

> Run from the repo/bundle root. If canon files live in multiple copies/folders (Execution, Builder,
> Sprint123, etc.), run recursively so every copy is covered.

---

## CHECK A — Zero WRONG-PATH references remain in any build-affecting document
```bash
grep -rn "app/api/inngest/route.ts" . 2>/dev/null | grep -v "webhooks"
```
**Expected:** only lines that *label* `/api/inngest` as the WRONG path remain — i.e. the intentional
documentation. Specifically, the only acceptable remaining hits are:
- Sprint 1 anti-pattern / file-tree notes (e.g. "...originally had app/api/inngest/route.ts — wrong path",
  "Do not use app/api/inngest/route.ts").
- Sprint 2 changelog entries describing the historical "B fix".
- Any version changelog describing the historical correction.

**FAIL if** any remaining hit is a *live instruction* — a `grep` verification target, an Inngest-dashboard
URL, or a `vercel.json` key — still pointing at the bare `/api/inngest` path. Report any such line with its
file + line number.

---

## CHECK B — Canonical path is present in the Phase 2 prompts where expected
```bash
grep -rl "app/api/webhooks/inngest/route.ts" . 2>/dev/null | grep -E "sprint-[1-9]"
```
Then, for precision on the Phase 2 prompts specifically:
```bash
for n in 1 2 3 4 5 6 7 8 9; do
  echo -n "P2 Sprint $n: "
  grep -rh "app/api/webhooks/inngest/route.ts" . 2>/dev/null | grep -c "" >/dev/null
  # per-file count across copies:
  find . -name "*sprint-$n-prompt.md" -path "*p2*" -exec grep -l "app/api/webhooks/inngest/route.ts" {} \; 2>/dev/null | head -1 >/dev/null && echo "has canonical path" || echo "(check — none found)"
done
```
**Expected:** Phase 2 Sprints 1-7 and 9 each contain the canonical path (their verification grep targets it).
**Sprint 8 is EXEMPT** — it has no Inngest-route reference at all, so finding none there is CORRECT, not a miss.

Simpler equivalent if the loop is noisy — just confirm S8 has zero and the rest have the path:
```bash
for n in 1 2 3 4 5 6 7 8 9; do
  f=$(find . -name "*p2-sprint-$n-prompt.md" | head -1)
  [ -n "$f" ] && echo "P2 S$n: webhooks-path=$(grep -c 'app/api/webhooks/inngest/route.ts' "$f")  bare-path=$(grep -c 'app/api/inngest/route.ts' "$f" 2>/dev/null)"
done
```
**Expected per file:** S1-S7,S9 → `webhooks-path=1  bare-path=0`. S8 → `webhooks-path=0  bare-path=0`.

---

## CHECK C — LLD spot-check (confirm the "bonus" LLD edit didn't break anything)
```bash
grep -rn "api/inngest" . 2>/dev/null | grep -i "lld\|7layer" | grep -v "webhooks"
```
**Expected:** EMPTY. Every Inngest path in the LLD (all copies) should now be the canonical
`webhooks/inngest`, or there were none to begin with.

**If non-empty:** show each remaining line with file + line number, and quote the surrounding sentence, so it
can be judged whether the edit was correct (the LLD is top-tier canon — an unintended change there matters
most). Do NOT change it; just report it for review.

---

## CHECK D — No production/staging dashboard URL points at the bare path
```bash
grep -rn "visibleau.com/api/inngest\|\[staging-url\]/api/inngest" . 2>/dev/null | grep -v "webhooks"
```
**Expected:** only a historical CHANGELOG mention may remain (e.g. a "v1.8 ... JF2" entry describing the past
fix). Any *live registration instruction* (a checklist item or a "Enter this URL" step) still on the bare
path is a FAIL — report it.

---

## REPORT FORMAT
For each check A-D, report: the command's output (or "empty"), and PASS / FAIL with a one-line reason.
Then a final verdict: **Fix 1 fully verified** (all live instructions on the canonical path; only intentional
documentation + historical changelogs mention the bare path; LLD clean) — or list exactly what still needs
attention. **Make no edits.**
