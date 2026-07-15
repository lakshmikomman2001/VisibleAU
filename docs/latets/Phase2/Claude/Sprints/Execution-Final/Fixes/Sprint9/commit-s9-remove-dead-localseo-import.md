# COMMIT — Remove the dead `localSeoAuditFn` import (HEAD imports a deleted module)

## Why this is a blocker, not housekeeping
The **committed HEAD** (`9a88bf8`) registers `localSeoAuditFn` in `serve()`, imported from
`@/inngest/functions/local-seo-audit` — **a file that does not exist.**

That is not a documentation issue. It is a **broken import in `main`**: depending on bundling it
either fails the build or throws at cold start when Inngest registers its functions. The fix already
exists in the working tree — **it's just unstaged.**

**Lineage — this is OQ-1 residue.** S8 built a local-SEO surface against the §0.6 **DEFER** ruling.
The cleanup removed the schema and the source file, but **left the import in `serve()`**. The S8
invariants script checks that `db/schema/local-seo-results.ts` is absent — it never checked whether
anything still *imports* the deleted module. **That gap is why this survived.**

---

## TASK

### 1 — Confirm the state before committing
```bash
cd c:/startup/VisibleAU/src
git status --short app/api/webhooks/inngest/route.ts
git diff app/api/webhooks/inngest/route.ts
# Prove the module really is gone:
ls inngest/functions/local-seo-audit.ts 2>&1 || echo "CONFIRMED: file does not exist"
# And that nothing ELSE still imports it:
grep -rn "local-seo-audit\|localSeoAuditFn" app/ lib/ inngest/ db/ components/ --include=*.ts --include=*.tsx
```
⚠️ **If anything besides `route.ts` still references it, remove those too** — report every hit.

### 2 — Verify it builds and the functions register
```bash
npx tsc --noEmit 2>&1 | grep -i "local-seo\|localSeoAudit" || echo "OK: no TS error for the dead import"
npm run build 2>&1 | tail -20      # or your build command
```
Then **confirm `serve()` registers 41** and the app starts:
```bash
npx vitest run tests/phase2/sprint9/ -t "serve"   # the new manifest guard
```

### 3 — Commit
```bash
git add app/api/webhooks/inngest/route.ts
# plus the QA script + manifest if they're also unstaged:
git status --short
git commit -m "fix(inngest): remove dead localSeoAuditFn import (OQ-1 residue)

serve() imported @/inngest/functions/local-seo-audit, a module deleted
during the S8 OQ-1 cleanup (local-SEO built against the §0.6 DEFER ruling).
HEAD therefore imported a nonexistent file.

serve() is now 41 functions (was 42 with the dead import).

Also adds a set-difference manifest guard for serve() — any addition or
removal now goes RED naming the function, replacing the snapshot count
that could only catch removals."
```
**Report the commit SHA.**

### 4 — ⚠️ Add the guard that would have CAUGHT this
The S8 invariants script checks the *schema file* is absent. **It never checked for dangling
imports.** Add a check — to `scripts/qa/sprint9-invariants.sh` (or a shared QA script):

> **Every import in `serve()` (and ideally every local `@/` import repo-wide) must resolve to a file
> that exists.**

Simplest robust version: `tsc --noEmit` already catches this — so **assert that `tsc` reports no
"cannot find module" errors**, and fail the QA script if it does. If tsc has too much pre-existing
noise (33 known errors), scope the check:
```bash
npx tsc --noEmit 2>&1 | grep -E "Cannot find module '@/" && exit 1 || echo "OK: no dangling @/ imports"
```
**Re-break it:** add `import { fakeFn } from "@/inngest/functions/does-not-exist";` → the check must
go **RED** naming it → revert.

⚠️ **This is the real lesson.** OQ-1's cleanup removed the *file* and the *schema* but left the
*import* — and every check we had looked for the file's absence, not for references to it. **An
absence check and a dangling-reference check are different things.**

---

## CONSTRAINTS
- Commit **only** the dead-import removal + the QA script/manifest. Do not bundle unrelated changes.
- If anything else still references `local-seo-audit`, remove it in the same commit and **say so**.
- Do NOT re-add `localSeoAuditFn` or recreate the module — local SEO is **DEFERRED** per §0.6.
- The dangling-import guard must go **RED** on a fake import.

## REPORT BACK (paste inline)
1. The `git diff` before commit + confirmation the module is genuinely absent.
2. **Any OTHER references to `local-seo-audit` / `localSeoAuditFn`** anywhere in the repo.
3. `tsc` / build clean of that error; **`serve()` = 41**; the manifest guard green.
4. **The commit SHA.**
5. The **dangling-import guard** + its re-break RED.
