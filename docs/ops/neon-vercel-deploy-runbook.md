# Neon + Vercel deploy runbook

Written 2026-09-18, from the repo and git history, after the six-incident chain it took to get the
first real user through sign-up → dashboard on production. If you're doing a fresh deploy (a Neon
branch promotion, a second region, a rebuild after a restore, a new environment) — read this first.
Every path/command below was verified against the repo at the time of writing; if something's moved,
trust the repo over this doc and update it.

## 1. Topology

**Domains** (Porkbun DNS → Vercel): apex `vunnara.com.au` → A record → `216.198.79.1` (verified via
`nslookup`), `www.vunnara.com.au` → CNAME → a per-project `<hash>.vercel-dns-017.com` (verified). Apex
is **Production**; `www` returns `308` → apex (verified via `curl -I`). This redirect is a
**Vercel-platform-level domain setting**, not application code — `next.config.ts`'s own `redirects()`
block still references the old `www.visibleau.com` → `visibleau.com` domain pair and is dead code for
the current domain; worth cleaning up but not currently load-bearing.

**Vercel**: project `visible-au`, team `sjl-b692` (plan: **Hobby**), production branch `main`.
Function region is `syd1`, set in `vercel.json`'s `"regions"` key — separate from the **build**
region, which is `iad1` (US East) in every build log observed; that's normal, builds don't run in the
deployed function's region. `vercel.json` also sets `maxDuration` per-route (60s for the Inngest
webhook and `/api/audits`, 10s for `/api/badge`) and the CSP header (see §3.1).

**Neon**: project `vunnara`, region `ap-southeast-2` (Sydney), database `neondb`. Two roles:
`neondb_owner` (→ env var `SERVICE_DATABASE_URL`; privileged, `rolbypassrls = t`, not subject to RLS
regardless of `FORCE ROW LEVEL SECURITY`) and `visibleau_app` (→ env var `DATABASE_URL`;
`rolsuper = f`, `rolbypassrls = f`, fully RLS-enforced). **Vercel's `DATABASE_URL` uses the pooled
host; `.env.neon`'s uses the direct (non-pooler) host** — `set_config`/RLS context needs a real
session, which the pooler doesn't reliably preserve across statements.

**Supabase**: storage only (bucket `reports`), not the database. Don't confuse the two.

**The three databases every migration must reach**: local `visibleau` (dev), local `visibleau_prod`
(local prod-mirror), Neon `main`. A migration applied to fewer than all three *will* drift — that's
exactly how this incident chain started.

## 2. Env files and how to use secrets without printing them

| File | Purpose |
|---|---|
| `.env.local` | Local dev, `LLM_MODE=mock` |
| `.env.prod` | Local prod-mirror config, real LLM calls |
| `.env.neon` | Real Neon credentials + optional `VERCEL_TOKEN`. Gitignored by the existing `.env*` rule (no separate rule needed — verified with `git check-ignore -v .env.neon`). |

**`.env.neon` must be pure LF, not CRLF.** A Windows editor save (or a naive Python
`open(path).read()`/`.write()` round-trip in *text* mode, which translates `\n` → `\r\n` on Windows)
will silently corrupt it: a `while IFS= read -r line` loop doesn't strip embedded `\r`, so the last
few bytes of whatever value ends the line get a trailing `\r` appended, which breaks connection-string
parsing in exactly the kind of way that's hard to spot (`invalid channel_binding value: "require"` was
the actual error seen — the value was really `require\r`). Check with `file .env.neon` (should say
"Unicode text, UTF-8 text", no "with CRLF") or `grep -c $'\r' .env.neon` (should be `0`). If you must
rewrite a line programmatically, use binary-mode I/O (`open(path, 'rb')`/`'wb'`, split/join on `b'\n'`
explicitly) rather than Python's default text mode.

**The pattern for using secrets in a Claude Code session without ever printing them:**
```bash
while IFS= read -r line; do
  if [[ "$line" =~ ^[A-Z_]+= ]]; then key="${line%%=*}"; val="${line#*=}"; export "$key=$val"; fi
done < .env.neon
```
(`set -a; source .env.neon; set +a` looks equivalent but does not reliably populate variables in this
environment — use the read-loop above instead.) Then reference `$VAR` in commands; never `echo`/`cat`
a variable holding a secret. Pass values to `psql` via a heredoc-written temp SQL file (`chmod 600`,
`shred -u` after) rather than `-v name=value` — the `:'name'` substitution syntax was unreliable via
`-c` in practice. Pass values to the Vercel CLI via stdin (`printf '%s' "$VALUE" | npx vercel env add
...`), never as a `--token`-style flag argument for the value itself (tokens themselves, which aren't
long-lived secrets in the same sense and are meant to be passed as flags, are the exception).

## 3. The incident chain

### 3.1 CSP likely blocks sign-up when the serving origin doesn't match `NEXT_PUBLIC_APP_URL`

Reported symptom: sign-up requests blocked on non-canonical origins (preview deployments, `www`
before its redirect). **Not personally reproduced in this session** — included here because the
underlying mechanism is real and verifiable in the current code: `lib/auth/client.ts` sets
`baseURL: process.env.NEXT_PUBLIC_APP_URL` (a fixed absolute URL), and `vercel.json`'s CSP header sets
`connect-src 'self' *.sentry.io *.posthog.com api.stripe.com` — no allowance for a second self-hosted
origin. If a page is ever served from an origin other than exactly `NEXT_PUBLIC_APP_URL` (a preview
URL, `www` before the platform redirect fires), the browser's `fetch()` to the auth endpoint becomes
cross-origin from the CSP's perspective and gets blocked. Durable fix (not yet done): make the auth
client use a relative/same-origin `baseURL` instead of a fixed env value.

### 3.2 `organization/create` 500 — `column "slug" of relation "organizations" does not exist`

`0010_baseline-reconcile.sql` uses `CREATE TABLE IF NOT EXISTS "organizations" (...)` to reconcile the
full desired shape — but `organizations` already existed (without `slug`/`onboarding_complete`) from
`0000_marvelous_madrox.sql`, so that statement silently no-ops on any database built from a clean
migration replay. `audits` had the same gap (4 columns — see `db/migrations/README.md` for the exact
list and the full forensic trail). Found by a TS-schema-vs-live diff (`pnpm db:drift`, see §4.1);
confirmed by running `pnpm dev` against Neon directly and reading the server terminal for the verbatim
Postgres error. Fixed by `db/migrations/0030_repair_baseline_reconcile_gaps.sql`, commit `4dec571`.

### 3.3 `brands_brand_token_unique` — present, just under the wrong name

`pnpm db:drift` flagged this constraint as missing on Neon. It wasn't — `0019_phase2_sprint6_brand_token.sql`'s
inline `ADD COLUMN ... UNIQUE` syntax created it under Postgres's auto-generated name
(`brands_brand_token_key`), not Drizzle's expected name, because `brands` predated migration 0010 the
same way `organizations`/`audits` did. Fixed by a guarded rename (not a redundant second constraint) in
`db/migrations/0031_brands_brand_token_unique.sql`, commit `355a4b5`.

### 3.4 Dashboard "Something went wrong" — stale `visibleau_app` password in Vercel

Sign-up only ever exercises `serviceDb`/`SERVICE_DATABASE_URL`; `/dashboard` was the first path to read
through `db`/`DATABASE_URL` (RLS-enforced). `SERVICE_DATABASE_URL` authenticated fine; `DATABASE_URL`
did not, on either the direct or pooled host. Fixed by rotating the password
(`ALTER ROLE visibleau_app WITH PASSWORD '...'` on Neon), updating Vercel's `DATABASE_URL` (pooled
host, via `vercel env rm` + `vercel env add` with the value piped via stdin) and `.env.neon`'s
`DATABASE_URL` (direct host), then redeploying. No code commit — this was a credential + Vercel env
change only.

### 3.5 Four silent Vercel build failures — a TypeScript error `tsx`/`vitest` don't catch

`scripts/qa/schema-drift.ts`'s original `.filter((v): v is PgTable => is(v, PgTable))` type-checked
fine when run directly via `tsx` and in the vitest wrapper test, but failed `next build`'s
project-wide `tsc` type-check: Drizzle infers a distinct literal type per table export
(`name: "ai_referral_hits"`, not `name: string`), so no single `PgTable`/`AnyPgTable` predicate
structurally reconciles against the full union of schema exports. This broke **every** Production
deploy for ~11 hours across 4 consecutive commits before anyone noticed — `vercel ls` showing recent
rows as `Error` was the first sign. Fixed by dropping the type-predicate overload for a plain boolean
filter + cast, commit `d7fc5d0`. **Rule: run `pnpm typecheck` (or a full `pnpm run build`) locally
before any push to `main` that touches a file under the project's `tsconfig.json` `include` — that's
almost everything, including `scripts/` and `tests/`, not just `app/`/`lib/`.**

### 3.6 Ruled out (with the evidence, so nobody re-chases these)

- **RLS chicken-and-egg** (the org-creation code inserting before an RLS context exists) — ruled out:
  `neondb_owner` has `rolbypassrls = t` (confirmed via `pg_roles`), so it was never subject to RLS
  policies regardless of `FORCE ROW LEVEL SECURITY`.
- **Missing seed data / FK target** — ruled out: every FK on the tables `afterCreateOrganization`
  writes points internally within the same migration set (verified via `pg_constraint`); no external
  lookup table dependency.
- **Vercel-runtime-specific** (env var scoping, edge vs Node) — ruled out for 3.2: running `pnpm dev`
  locally with real Neon credentials reproduced the identical Postgres error outside Vercel entirely.

## 4. Checks for any fresh Neon deploy

Run these in order. Each has a command and the expected "good" output.

**4.1 — Schema drift.**
```bash
DATABASE_URL_FOR_DRIFT="$TARGET_URL" pnpm db:drift
```
Expect: `0 FATAL`, `74 tables`, `208 policies`. See `db/migrations/README.md` for what this checks and
why `drizzle-kit generate`/`check` can't (**never run either in this repo** — both are guarded to
print a warning and exit 1; see that doc for why). Override `EXPECTED_TABLES`/`EXPECTED_POLICIES` only
when a migration legitimately changes those numbers.

**4.2 — Role attributes.**
```sql
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN ('neondb_owner','visibleau_app');
```
Expect: `neondb_owner` → `rolbypassrls = t`; `visibleau_app` → `rolsuper = f`, `rolbypassrls = f`. A
superuser on your local machine is not the same as `neondb_owner` on Neon — always test with the
actual role each connection will use in production, not whichever role happens to be convenient
locally.

**4.3 — Auth on both hosts, both roles.**
```bash
psql "$SERVICE_DATABASE_URL" -Atc "select current_user;"   # direct host, neondb_owner
psql "$DATABASE_URL"         -Atc "select current_user;"   # direct host, visibleau_app
psql "$POOLED_SERVICE_URL"   -Atc "select current_user;"   # pooled host, neondb_owner
psql "$POOLED_APP_URL"       -Atc "select current_user;"   # pooled host, visibleau_app
```
All four must succeed. A stale password on one role/host combination is exactly incident 3.4.

**4.4 — RLS fail-closed.**
```sql
select count(*) from organizations;                                          -- no context: 0
select set_config('app.current_org_id','<real org id>',false);
select count(*) from organizations;                                          -- with context: exactly that org's rows
```

**4.5 — Sign-up reproduction, reading the terminal.**
```bash
pnpm dev > /tmp/repro.log 2>&1 &
EMAIL="repro-$(date +%s)@visibleau.local"
curl -s -c j -b j -H 'Content-Type: application/json' -H 'Origin: http://localhost:3000' \
  -X POST http://localhost:3000/api/auth/sign-up/email -d "{\"email\":\"$EMAIL\",\"password\":\"Repro-Pass-1\",\"name\":\"Repro\"}"
curl -s -c j -b j -H 'Content-Type: application/json' -H 'Origin: http://localhost:3000' \
  -X POST http://localhost:3000/api/auth/organization/create -d '{"name":"Repro","slug":"repro-'"$(date +%s)"'"}'
curl -s -c j -b j -X POST http://localhost:3000/api/auth/sync-user
curl -s -b j -o /dev/null -w "dashboard: %{http_code}\n" http://localhost:3000/dashboard
kill %1; pkill -f "next dev" || true   # ALWAYS kill it — don't leave a dev server pointed at Neon running
```
Each step should return 200. Read `/tmp/repro.log` for the actual server-side error if anything 500s —
`digest`-only prod error pages hide the real message; this is how you get it. **Then clean up the
repro account**, FK-safe order: `auth_sessions` → `auth_accounts` → `auth_members` →
`auth_organizations` → `auth_users`, plus `organizations`/`users`/`org_members`/`report_templates`/
`data_residency_log` if any app-level rows landed (`WHERE email/name = ...`, `RETURNING id` each step).

**4.6 — Vercel deployment state.**
```bash
npx vercel env ls production --token "$VERCEL_TOKEN" --scope sjl-b692
npx vercel ls visible-au --token "$VERCEL_TOKEN" --scope sjl-b692
curl -s -o /dev/null -w "%{http_code}\n" https://vunnara.com.au/
```
Check the env var **names** are present for Production (values are masked — that's correct, don't try
to unmask them). Check the newest row in `vercel ls` is `Ready`, not `Building`/`Error` — **a green
commit on `main` is not a deployed commit**; incident 3.5 sat unnoticed for 11 hours specifically
because nobody checked this. Landing page should be `200`.

**4.7 — Domains.**
```bash
npx vercel domains inspect vunnara.com.au --token "$VERCEL_TOKEN" --scope sjl-b692
curl -sI https://vunnara.com.au/ | head -1        # 200
curl -sI https://www.vunnara.com.au/ | head -1    # 308 -> apex
```

## 5. Rules

- Migrations on disk ≠ migrations live. Columns in the TS schema ≠ columns live. Only `pnpm db:drift`
  against the actual target tells the truth — not `drizzle-kit`, not reading the migration files.
- Never `drizzle-kit generate`/`push` in this repo (guarded; see `db/migrations/README.md`).
- Every schema migration → all three databases (§1), `ON_ERROR_STOP=1`, verify by count afterward —
  don't trust a clean exit code alone.
- A superuser locally is not `neondb_owner` on Neon. Test with the actual deployed role.
- Always kill any `pnpm dev` you start against Neon, in the same step you started it.
- `BETTER_AUTH_URL`/`NEXT_PUBLIC_APP_URL` must equal the origin users actually land on — see §3.1.
- Run `pnpm typecheck` (or a full `pnpm run build`) locally before pushing to `main`, for *any* file
  under the project's TS scope — see §3.5. `tsx`/`vitest` alone are not sufficient proof.

## 6. Open items (tracked elsewhere, not repeated here)

- Prompt B — make the auth client use a relative/same-origin `baseURL` (durable fix for §3.1).
- Prompt C — Inngest function registration on the deployed app.
- Prompt D — data residency verification.
- Prompt E — Neon backup/restore drill.
- `docs/ops/post-launch-db-hardening.md` — the duplicate `0010`/`0011`/`0008` migration numbering, hard-stop
  migration runner, local type drift vs Neon.
- Vercel deploy-failure notifications (so incident 3.5's class of problem alerts instead of sitting silent).
- Vercel Pro before real customer traffic (Hobby's fair-use/function limits).
- Stripe live mode, an SMTP relay for the email paths that currently no-op locally (see the env-var
  audit for which paths those are).
