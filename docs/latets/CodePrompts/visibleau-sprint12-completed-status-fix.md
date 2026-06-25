# VisibleAU — Fix the `'completed'` → `'complete'` audit-status footgun in the Sprint 12 PROMPT
**This is a CANON edit, not an app change.** It corrects the Sprint 12 sprint-prompt FILE
(`sri-visibleau-sprint-12-prompt.md`) so that when Sprint 12 is built, it ships the correct audit
status value the first time. Apply this to the prompt file in your canon/docs repo — NOT to the app.

> Paste into the chat/editor where you maintain the VisibleAU sprint prompts. If applying via Claude
> Code against the docs repo, point it at the sprint-12 prompt file.

---

## The bug (verified)
The canonical audit `status` enum is **`'pending' | 'running' | 'complete' | 'failed'`** —
the success value is **`'complete'`** (NO trailing -d). This is confirmed in Foundations v1.12
(`audits` table) and is the value the entire built app filters on. This exact typo
(`'completed'` vs `'complete'`) already caused TWO production-path bugs earlier in Phase 1 (the PDF
builder regression and the bulk-CSV empty export).

The Sprint 12 prompt has **three** functional spots that use the WRONG value `'completed'`. If Sprint
12 is built as written, all three ship broken:

| Line | Location | Current (WRONG) | Effect of the bug |
|---|---|---|---|
| ~510 | Public badge endpoint score lookup | `.eq('status', 'completed')` | Badge ALWAYS returns "No data" — the public embed badge never shows a score |
| ~570 | Demo-data seed insert | `status: 'completed'` | Demo audits are INVISIBLE to every `'complete'`-filtered query in the app — the demo workspace shows no audit data |
| ~803 | `audit-data-retention` cron delete filter | `eq(audits.status, 'completed')` | Cron matches ZERO rows → **silently deletes nothing** → the §9 Privacy Policy 12-month retention claim is violated (data kept forever) |

The retention one (line ~803) is the most serious: it's a silent compliance failure — the cron "runs"
and reports success while deleting nothing.

## What must NOT change (these are correct — leave them exactly as-is)
These also contain the string "completed" but are CORRECT and must be preserved:
- **Line ~188** — `checkout.session.completed` — this is the real **Stripe event name** (`-ed` is
  correct; Stripe defines it this way).
- **Line ~637** — "Backup drill completed (Supabase PITR)" — English prose, not a status value.
- **Lines ~1736–1747** — PostHog event names: `signup_completed`, `sample_audit_completed`,
  `first_audit_completed`, `checkout_completed`, and the funnel definitions referencing them. These
  are **analytics event names** chosen deliberately with `-ed`; renaming them would break the PostHog
  funnels. DO NOT touch.
- **Lines ~1770–1771** — changelog prose. DO NOT touch.

The rule: **only fix occurrences where `'completed'` is used as an AUDIT-ROW `status` value**
(a DB filter or insert on `audits.status`). Never touch Stripe event names, PostHog event names, or
prose.

---

## The three edits (exact string replacements)

**Edit 1 — Badge endpoint (~line 510):**
```
FIND:        .eq('status', 'completed')
REPLACE:     .eq('status', 'complete')
```
(Context: inside the public badge `getScoreForDomain` service comment — the `.select('score_composite,
brands!inner(domain)')...` block.)

**Edit 2 — Demo seed (~line 570):**
```
FIND:        # 3. db.insert(audits).values({ status: 'completed', scoreComposite: 72, ... })
REPLACE:     # 3. db.insert(audits).values({ status: 'complete', scoreComposite: 72, ... })
```

**Edit 3 — Retention cron (~line 803):**
```
FIND:        .where(and(lt(audits.createdAt, cutoff), eq(audits.status, 'completed')))
REPLACE:     .where(and(lt(audits.createdAt, cutoff), eq(audits.status, 'complete')))
```

Each `'completed'` → `'complete'` is unique enough in context to replace precisely. Do NOT do a
blind global find-replace of "completed" — that would corrupt the Stripe/PostHog names above.

---

## Add a build-time guard note to the Sprint 12 prompt
After the edits, add this note near the top of the Sprint 12 prompt's pitfalls/conventions section
(or wherever §0-style conventions live), so the BUILDER also catches any stragglers at build time:

```markdown
### ⚠️ Audit status value — `'complete'` not `'completed'`
The `audits.status` success value is **`'complete'`** (no -d), per Foundations. Any query/insert that
filters or sets an audit's status MUST use `'complete'`. This typo has bitten Phase 1 twice. During
build, run:  `grep -rnE "status.{0,4}'completed'|'completed'.{0,4}status|eq\(audits.status, 'completed'\)" .`
and fix any audit-status hit. DO NOT change `checkout.session.completed` (Stripe event name) or
PostHog event names like `signup_completed` — those are correctly `-ed`.
```

---

## Verification (on the PROMPT file)
After editing, confirm only the three status occurrences changed and the protected ones survived:
```bash
# The three audit-status bugs are now 'complete' (no -d):
grep -nE "eq\('status', 'complete'\)|status: 'complete'|eq\(audits.status, 'complete'\)" sri-visibleau-sprint-12-prompt.md   # → 3 matches

# No audit-status 'completed' remains:
grep -nE "eq\('status', 'completed'\)|status: 'completed'|eq\(audits.status, 'completed'\)" sri-visibleau-sprint-12-prompt.md  # → 0 matches

# Protected occurrences STILL present (must NOT have changed):
grep -nE "checkout.session.completed|signup_completed|sample_audit_completed|checkout_completed|first_audit_completed" sri-visibleau-sprint-12-prompt.md  # → still present
grep -n "Backup drill completed" sri-visibleau-sprint-12-prompt.md  # → still present
```

Also bump the Sprint 12 prompt's changelog with a line, e.g.:
```
- v1.x (<today>): Fixed audit-status footgun — three `'completed'` → `'complete'` corrections
  (badge endpoint score lookup, demo-seed insert, audit-data-retention cron delete filter). These
  matched zero audit rows as written (DB value is 'complete'); the retention cron would have silently
  deleted nothing, violating the 12-month retention claim. Stripe/PostHog `*_completed` event names
  left unchanged (correctly -ed). Added a build-time grep guard to the conventions section.
```

Report: the three edits applied, the verification greps (3 fixed / 0 remaining / protected intact),
and the changelog bump.
