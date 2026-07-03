# Claude Code — DIAGNOSE (report-first, NO broad fixes): `setRlsContext` cross-org leak across the connection pool — SECURITY

**SEVERITY: HIGH — potential cross-tenant data exposure.** A Sprint 2 E2E brand-isolation test exposed that
`setRlsContext` does NOT reliably enforce org isolation across the Postgres connection pool — i.e. one org can read
another org's data. 3 task routes were patched with explicit org-ownership checks, BUT that fixes 3 routes, not the
**root cause**. If `setRlsContext` is unreliable across the pool, then EVERY org-scoped query relying on RLS alone
(Phase 1 + Phase 2, 30+ routes) may have the same hole. This is a foundational tenant-isolation issue, not a
Sprint 2 bug.

Canon mechanism (confirmed):
- RLS policies enforce via `USING (organization_id::text = current_setting('app.current_org_id', true))` (LLD
  ~8868).
- `setRlsContext(db, currentUser.organizationId)` sets `app.current_org_id` (the mandatory pattern: getCurrentUser
  → setRlsContext → db queries; LLD ~5733, ~5743). It's described as setting a "context variable" (~8858).
- **The likely bug:** `setRlsContext` sets `app.current_org_id` via a **session-level `set_config`/`SET`** on a
  connection checked out from the pool — but the subsequent `db` query may run on a DIFFERENT pooled connection
  that never received the `SET`. So `current_setting('app.current_org_id', true)` returns empty/stale on the query
  connection → the RLS policy's comparison fails open or matches the wrong org → cross-org access. This is the
  classic pooled-Postgres + session-RLS footgun. The fix is to PIN the context-set and the query to the SAME
  connection (a transaction with `SET LOCAL`, or a dedicated pinned connection per request).

**DIAGNOSE ONLY. Confirm root cause + survey blast radius + propose the systemic fix. Do NOT apply broad changes
until Sri reviews.** (The 3 task-route explicit checks already applied can stay as defense-in-depth — do not
remove them.)

---

## STEP 1 — Read how `setRlsContext` actually works (confirm the mechanism)
```bash
cat db/client.ts 2>/dev/null || cat src/db/client.ts 2>/dev/null || grep -rln "setRlsContext" --include=*.ts | head
grep -rn "setRlsContext\|set_config\|SET app\|SET LOCAL\|app.current_org_id\|current_setting" db/ src/db/ lib/ --include=*.ts | head -30
```
Report the EXACT implementation of `setRlsContext`:
- Does it run `SELECT set_config('app.current_org_id', $1, false)` or `SET app.current_org_id = ...`? The third arg
  `false` (or a plain `SET`) = **session-level**, persists on the connection but is connection-specific. `true` (or
  `SET LOCAL`) = **transaction-local**.
- Is the `set_config`/`SET` wrapped in a TRANSACTION that also contains the subsequent queries? Or is it a
  standalone statement, after which `db.select(...)` issues a SEPARATE query (potentially on a different pooled
  connection)?
- What's the DB client/pool? (node-postgres `Pool`, Drizzle over a pool, postgres.js, Supabase pooler/PgBouncer?)
  Does the pool hand out per-statement connections, or can a request pin one?

## STEP 2 — Confirm the pool actually splits context from query (reproduce the mechanism)
```bash
# Does a setRlsContext call + a query run in ONE transaction/connection, or two?
grep -rn "setRlsContext" app/ --include=*.ts | head -40
```
For a representative route (e.g. one of the task routes, and one Phase 1 route): trace whether
`setRlsContext(db, orgId)` and the following `db` queries are guaranteed on the SAME connection.
- If `db` is a pool and each `await db.xxx()` checks out a (possibly different) connection, then the `SET` on
  connection A does NOT apply to the query on connection B → RLS context missing → **leak confirmed**.
- Report: is there ANY mechanism pinning them (a transaction `db.transaction(...)`, a per-request client, an
  AsyncLocalStorage-scoped connection)? Or are they independent checkouts?

## STEP 3 — Reproduce the leak deterministically (the proof)
Write a minimal check (or use the E2E test that found it) to PROVE the leak under the pool:
- Set RLS context to Org A, then run a query that should return only Org A's rows — but under pool conditions
  (concurrent/pooled), confirm it can return Org B's rows or all rows.
- OR: directly inspect — after `setRlsContext(db, orgA)`, run `SELECT current_setting('app.current_org_id', true)`
  via `db` and see if it returns orgA or EMPTY (empty = the query ran on a different connection without the SET).
Report the result. `current_setting(...)` returning EMPTY on the query path is the definitive proof.

## STEP 4 — SURVEY THE BLAST RADIUS (the critical scope question)
How many routes/queries rely on `setRlsContext`/RLS ALONE for org isolation (no explicit `organization_id =
currentUser.organizationId` check)?
```bash
# Routes that call setRlsContext (rely on RLS):
grep -rln "setRlsContext" app/api/ --include=*.ts | wc -l
grep -rln "setRlsContext" app/api/ --include=*.ts
# Of those, which ALSO have an explicit org/ownership check (defense-in-depth) vs RLS-only?
grep -rLn "organizationId\s*[,=)]" $(grep -rln "setRlsContext" app/api/ --include=*.ts) 2>/dev/null
```
Report:
- Total org-scoped routes relying on `setRlsContext`.
- Which have ONLY RLS (vulnerable if the pool bug is real) vs which have explicit org checks too (the 3 task routes
  now do).
- Both Phase 1 AND Phase 2 routes — this is app-wide, not Sprint 2. Classify the exposure.

## STEP 5 — Determine the correct SYSTEMIC fix (for Sri to approve)
Based on findings, lay out the fix (do NOT apply broadly yet):
- **Primary (fix the mechanism):** make `setRlsContext` + the queries it guards run on the SAME connection. Options:
  (a) wrap each request's setRlsContext + queries in a single `db.transaction(tx => { SET LOCAL app.current_org_id;
  ... tx queries ... })` using `SET LOCAL` (transaction-scoped, dies with the txn, can't leak to the next pool
  borrower); (b) a per-request pinned connection (AsyncLocalStorage / a request-scoped client) that carries the
  context; (c) if using PgBouncer in transaction mode, ensure `SET LOCAL` within a transaction (session-level SET
  is incompatible with transaction pooling). Report which fits the current client/pool.
- **Defense-in-depth (keep + extend):** explicit `organization_id = currentUser.organizationId` (and brand
  ownership via the org) checks on org-scoped routes — the 3 task routes already have this; the survey (STEP 4)
  says which others need it. This does NOT replace fixing the mechanism, but bounds the risk and protects even if
  RLS context is ever wrong.
- **Recommended:** BOTH — fix the connection-pinning mechanism so RLS works as designed app-wide, AND keep explicit
  org checks as defense-in-depth on sensitive routes.
- Note any global/seed tables that are intentionally RLS-DISABLED (no organization_id) — those are NOT part of this
  (LLD ~8122) and must not get spurious org checks.

## VERDICT
- Is the leak CONFIRMED (STEP 3 shows empty/wrong `current_setting` on the query path or cross-org rows returned)?
- Root cause: session-level `set_config`/`SET` not pinned to the query connection across the pool? (or something
  else — report what.)
- Blast radius: how many routes exposed (RLS-only), Phase 1 + Phase 2.
- The systemic fix direction (connection-pinning mechanism + defense-in-depth), scoped for Sri's approval.

## REPORT
- The exact `setRlsContext` implementation + the DB client/pool type.
- Whether setRlsContext + queries share a connection/transaction or are independent pool checkouts.
- **Reproduction proof:** `current_setting('app.current_org_id', true)` on the query path returns org vs EMPTY;
  and/or a cross-org query returning foreign rows.
- **Blast-radius survey:** count + list of org-scoped routes relying on RLS-only vs RLS+explicit-check (Phase 1 +
  Phase 2).
- The proposed systemic fix (mechanism + defense-in-depth) for approval — NOT applied broadly.
- Confirm: no broad source changes (diagnosis only; the 3 task-route explicit checks already in place stay).

## NOTE — why this is report-first and high-priority
Cross-tenant data exposure is the most serious bug class for a multi-tenant SaaS. But the FIX must be systemic
(fix the connection-pinning so RLS holds everywhere), not 30 one-off route patches — patching routes one at a time
while the mechanism stays broken leaves holes and is unmaintainable. Confirm the root cause and full blast radius
FIRST, then apply one correct systemic fix (+ defense-in-depth) in a reviewed pass. This connects to the canon
O-01 / AA2 history (setRlsContext was already flagged as mandatory because missing it silently bypasses RLS — this
is the NEXT layer: even WITH setRlsContext, the pool can defeat it if context isn't pinned to the connection).
After this is resolved, the remaining Sprint 2 test section (Section 5 QA) can proceed.
