# Push runbook — 2026-10 (commits `0b31a94`..`7ecef68`)

One ordered runbook for pushing the 6 local commits currently sitting unpushed on `main`:
`0b31a94`, `e47033a`, `01dd7b6`, `c7816d5`, `78a08d9`, `7ecef68`. Two fix live cross-tenant bugs
(`78a08d9`); `7ecef68` fixes invite acceptance, the sample-audit leaks, and Inngest scoping. Two
commits need prod SQL applied **before** the push (`e47033a` → `0051`, `7ecef68` → `0053`) or the
new code will 42703 (missing column) / silently rely on a missing constraint the moment it's live.

Every step below names an exact file to paste into the **Neon SQL editor, production branch** —
never SQL to type by hand, never a command run from Claude Code. Stop and send Claude a screenshot
at every step marked **⏸ STOP**.

---

## 1. Neon: snapshot before touching anything

In the Neon console, create a branch from the production branch's current tip, named
`pre-push-2026-10`. This is the rollback point if anything in steps 2–4 goes wrong — restoring
from it undoes any DDL applied below, independent of the `0051`/`0053` rollback files in step 10.

No SQL file — this is a Neon console action (Branches → your prod branch → "Create branch").

---

## 2. `0047` — citations/audits indexes (performance only, not apply-before-push)

1. Paste **`db/prod-fixes/0047-citations-audits-indexes-precheck-prod.sql`**. Expect: shows whether
   `citations_audit_run_idx` / `audits_brand_completed_idx` already exist and match.
2. If both already correct, **skip to step 3** — do not run the apply file.
3. Otherwise, paste **`db/prod-fixes/0047-citations-audits-indexes-apply-prod.sql`** — but run its
   two `CREATE INDEX CONCURRENTLY` statements **one at a time**, each as its own paste (the file's
   own header explains why: `CONCURRENTLY` cannot run inside a transaction block, and some SQL
   editors auto-wrap a multi-statement paste in one). Wait for statement 1 to finish before
   pasting statement 2.
4. The same file's final `SELECT` (the validity check) runs automatically after both — expect
   `indisvalid = true` for both index names. If either shows `false`, `DROP INDEX CONCURRENTLY
   <name>` and retry that one statement.

This step is **not** apply-before-push — nothing in `7ecef68` or earlier depends on these indexes
existing. It's bundled here only because it was still open from an earlier follow-up.

---

## 3. `0051` — `ai_bot_ip_ranges` unique constraint (needed by `e47033a`)

1. Paste **`db/prod-fixes/0051-ai-bot-ip-ranges-unique-precheck-prod.sql`**.
2. **⏸ STOP — screenshot the result to Claude before continuing.** Its own header explains why:
   confirm row 1 ("cidr column type") says `cidr`, not `text` — if it says `text`, migration 0024
   needs to be applied first (see `db/prod-fixes/diag-0050-cidr-inet-prod.sql`), and `0051-apply`
   must not run yet.
3. Once Claude confirms it's safe: paste **`db/prod-fixes/0051-ai-bot-ip-ranges-unique-apply-prod.sql`**
   — its own header splits it into 3 sections; **run each section as its own separate paste**, in
   order, confirming each section's own inline check before moving to the next (section 2's
   `CREATE INDEX CONCURRENTLY` especially cannot share a transaction with anything else).
4. After section 3, the file's own post-check `SELECT` runs — expect `excess_rows = 0`,
   `new_constraint_present = true`, `old_constraint_still_present = false`.

---

## 4. `0053` — `org_members.expires_at` (needed by `7ecef68`)

1. Paste **`db/prod-fixes/0053-org-members-invite-expiry-precheck-prod.sql`**. Expect
   `column_missing_as_expected = true`. Note the `already_expired_pending_rows` count — if it's
   greater than 0, those are real pending invites that will immediately start showing "This
   invitation has expired" the moment the apply below runs, not at some later point. If that
   number is non-trivial, tell whoever sent those invites before continuing.
2. Paste **`db/prod-fixes/0053-org-members-invite-expiry-apply-prod.sql`** — one paste, it's a
   single transaction (`BEGIN`...`COMMIT`), no `CONCURRENTLY` involved.
3. Its own post-check `SELECT` runs automatically — expect `is_nullable = 'NO'` and
   `remaining_nulls = 0`.

**⚠️ Order matters**: this step must complete before step 6 (the push) — the new
`members/accept/route.ts` code reads `expires_at` unconditionally. Pushing `7ecef68` before this
step applies would 500 every invite-accept attempt in production.

---

## 5. Regenerated bundle — the final gate

Paste **`db/prod-fixes/prepush-bundle-0046-0047-0048-0051-0053.sql`** (supersedes the older
`prepush-bundle-0046-0047-0048.sql`, which stays in place as historical record). This re-checks
everything from steps 2–4 in one grid, plus the pre-existing `0046`/`0048`/RLS checks from earlier
follow-ups.

**⏸ STOP — the `OVERALL` row (seq 0) must read `PASS`. Screenshot the whole grid to Claude before
continuing.** If it reads `STOP`, read the specific `STOP` row(s) below it — each names exactly
what's wrong — and do not proceed to step 6 until a re-run shows `PASS`.

---

## 6. Push

Sri runs, from his own machine (never from Claude Code — `CLAUDE.md`'s standing rule):

```
git push origin main
```

Confirm: `git log origin/main --oneline -1` shows `7ecef68` as the tip.

---

## 7. Vercel: deployment health

In the Vercel dashboard, confirm the deployment built from commit `7ecef68` shows **Ready**, and
the Production environment's badge is filled blue (pointing at this deployment, not a stale one).

---

## 8. Vercel Logs: confirm the app's real DB role

In Vercel → the project → Logs, search `db_role_check`. Expect two log lines, one per connection:
- `connection=app` → role `visibleau_app`, `bypassrls=false` (RLS-enforced, as it must be)
- `connection=service` → role `neondb_owner`, privileged — **expected**, not a bug (Inngest's
  legitimately cross-org background jobs need it)

**⏸ STOP — screenshot both log lines to Claude.**

---

## 9. Re-audit a real brand (Bondi) and confirm it live

Trigger a fresh audit for the Bondi test brand through the normal product flow (not a script).
Once it completes:

**⏸ STOP — screenshot both of these pages to Claude:**
- Citation Sources (the page this task's earlier follow-ups hardened against overstated counts
  and the cache-replay inflation issues)
- Citation Failure (the diagnosis page)

This is the one step that confirms the actually-deployed code behaves correctly against a real
audit, not just that the schema/role checks passed.

---

## 10. Rollback — if something above goes wrong

**Application rollback** (wrong code live, schema is fine): in Vercel → Deployments, find the
previous deployment (the one built from `c7816d5`, the last commit before this push) and use its
"..." menu → **Promote to Production**. This repoints the Production alias without a new build or
any DB change.

**Schema rollback** (only if `0051` or `0053` themselves need reverting — rare, and only safe if
the application has already been rolled back first per the file headers' own warnings):
- `db/prod-fixes/0051-ai-bot-ip-ranges-unique-rollback-prod.sql` — drops only the new constraint,
  never the old one it replaced; safe to run any time, additive-only to revert.
- `db/prod-fixes/0053-org-members-invite-expiry-rollback-prod.sql` — drops the `expires_at`
  column outright. **Only run this after the application rollback above** — its own header warns
  that dropping the column while the new `members/accept/route.ts` is still live 500s every
  invite-accept attempt, the same failure mode in reverse that `0053-apply`'s own header warns
  about.

The Neon branch snapshot from step 1 (`pre-push-2026-10`) is the blunt-instrument fallback if
either rollback file itself needs undoing, or if something broke that these two files don't cover.
