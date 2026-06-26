# VisibleAU — FIX PROMPT: Sample-audit status polling redirects to /sign-in (public teaser never completes)

**Phase/Sprint:** Phase 1, Sprint 10 (sample-audit flow) × Sprint 3 (status endpoint). **Severity: HIGH —
launch blocker.** The public, no-login "free sample audit" (the landing page's primary conversion path)
cannot complete for any logged-out visitor.

---

## SYMPTOM (observed on real run, 26 Jun 2026)

A logged-out visitor (incognito) clicks "Try a free sample audit" on `/`. The flow correctly creates the
audit and loads `/sample-audit/running?auditId=<uuid>`. The progress bar then sticks at ~4% forever. The
dev-server log shows the running page's status poll being **redirected to the sign-in page** on every tick:

```
POST /api/sample-audit 201                                              ← create: OK, public
GET  /sample-audit/running?auditId=f8e94dd5-...  200                    ← running page: OK, public
GET  /sign-in?redirectTo=%2Fapi%2Faudits%2Ff8e94dd5-...%2Fstatus  200   ← poll #1  ← REDIRECTED
GET  /sign-in?redirectTo=%2Fapi%2Faudits%2Ff8e94dd5-...%2Fstatus  200   ← poll #2  ← REDIRECTED
... (hundreds more, every 2s, forever)
```

Decoded, the poll target is `/api/audits/f8e94dd5-.../status`, and it is being **auth-gated → 302/redirect
to `/sign-in?redirectTo=<the status URL>`**. The polling `fetch()` follows the redirect, receives the
sign-in HTML (200) instead of a JSON status payload, never sees `status === 'complete'`, and loops until
the 5-minute client timeout. It is NOT slow mock data — it is a redirect loop because a PUBLIC page is
polling a PROTECTED endpoint.

## ROOT CAUSE (confirmed against canon)

- **Sprint 3** built `/api/audits/[auditId]/status` for **logged-in dashboard users**: its spec is
  `Auth: getCurrentUser() + setRlsContext(). Cross-org → 404.` (Sprint 3 prompt §9, line ~820; the Z6
  audit explicitly hardened this route's auth.)
- **Sprint 10** wired the **public** sample-audit running page to poll **that same protected route**:
  "Note: `/api/audits/[auditId]/status` is the existing Sprint 3 audit status endpoint." (Sprint 10
  prompt, line ~1070; polling pattern at lines ~1046–1065.)
- Sample audits attach to the **synthetic `slug='sample'` org** (Sprint 10 line ~31; `ensureSampleOrg()`),
  NOT to a visitor org — because the visitor is not authenticated. So `getCurrentUser()` returns null →
  the auth gate redirects to `/sign-in`.

The reuse was the mistake: a public flow must not depend on an auth-gated endpoint.

---

## STEP 0 — INVESTIGATE FIRST (do this before editing; report findings, then act)

The correct fix depends on HOW the redirect is enforced in this repo. Do not guess.

```bash
# 1. Find the status route file and read its auth handling:
find app -path '*audits*status*' -name 'route.ts'
#    e.g. app/api/audits/[auditId]/status/route.ts  (or [id])  — open it.
#    Identify: does the route itself call getCurrentUser()/requireAuth() and redirect, OR does it just
#    read status and something ELSE redirects (middleware)?

# 2. Find the auth middleware and its matcher — is /api/audits/* protected there?
find . -maxdepth 2 -name 'middleware.ts' -not -path '*/node_modules/*'
grep -nE "matcher|/api|publicRoutes|public|/sign-in|redirectTo|/sample-audit" middleware.ts 2>/dev/null
#    The redirect to /sign-in?redirectTo=... is almost certainly a Better Auth middleware pattern.
#    Determine whether /api/audits/[id]/status is caught by the protected matcher.

# 3. Confirm how the PUBLIC create route is exempted (it works — 201, not redirected):
find app -path '*sample-audit*' -name 'route.ts'
grep -rnE "sample-audit|publicRoutes|public|slug.*sample|ensureSampleOrg" middleware.ts app/api/sample-audit/ 2>/dev/null
#    Whatever mechanism makes POST /api/sample-audit public is the SAME mechanism to extend (or mirror)
#    for the sample-audit status read.

# 4. Confirm the running page's poll URL (so the fix matches what the client calls):
grep -rnE "/status|/api/audits|fetch\(" app/\(public\)/sample-audit/running/ app/sample-audit/running/ 2>/dev/null
#    Find the exact path the client polls and whether it sends credentials.

# 5. Confirm the audit's tenancy so we scope the public read safely:
#    sample audits live on organizations.slug='sample'. The public status read must be limited to
#    audits belonging to that sample org — NOT a blanket-public read of every audit.
grep -rnE "slug.*sample|SAMPLE_SLUG|ensureSampleOrg" lib/ db/ scripts/ 2>/dev/null | head
```

**Report:** (a) is the redirect coming from middleware or from in-route auth? (b) how is the create route
exempted? (c) exact poll path + param name (`[auditId]` vs `[id]`). Then implement the matching option below.

---

## THE FIX — choose the option that matches Step 0 (preferred: Option A)

The principle in all options: **the public running page must poll a PUBLIC, sample-scoped status endpoint
that returns JSON (never an auth redirect), and that endpoint must only ever expose audits belonging to the
synthetic `slug='sample'` org.** Do NOT make the existing protected dashboard status route public (that
would leak real customers' audit status). Add/expose a SEPARATE public sample path instead.

### Option A — Dedicated public sample-status route (cleanest; recommended)
Create a new public endpoint that mirrors the public create route's exemption, scoped to the sample org.

1. **New route** `app/api/sample-audit/status/route.ts` (or `app/api/sample-audit/[auditId]/status/route.ts`
   to match the create route's shape). It must be in the SAME public-exemption bucket as
   `POST /api/sample-audit` (Step 0 #3). Behaviour:
   - Read `auditId` (query param or path segment, matching the client).
   - Look up the audit. **Scope hard to the sample org:** join `organizations` and require
     `organizations.slug = 'sample'`. If the audit is not found OR does not belong to the sample org →
     return `404` JSON (never redirect, never expose a real-org audit).
   - Return the same minimal JSON shape the running page already expects from the Sprint 3 route
     (e.g. `{ status, progress }` — match the existing contract exactly so the client needs no reshape).
   - **No `getCurrentUser()` / no auth redirect.** This route is public by design, but safe because it can
     only ever return sample-org audits.
   - Use a service-role / RLS-bypass DB read consistent with how `POST /api/sample-audit` writes (Step 0
     #3 shows the pattern), since there is no user org context to set RLS from. Keep the query limited to
     the sample-slug filter.
2. **Point the running page at it.** In the sample-audit running component (Step 0 #4), change the poll
   target from `/api/audits/${auditId}/status` to the new public route
   (`/api/sample-audit/status?auditId=${auditId}` or the `[auditId]` path form). Leave the 2s interval and
   5-min timeout as-is (Sprint 10 lines ~1046–1065).

### Option B — Exempt the status route in middleware for the sample case (only if Step 0 shows middleware is the gate AND the route can self-scope)
If the redirect is purely middleware-driven and you prefer not to add a route:
1. Add the status route to the middleware **public** list/matcher — BUT only safely if the route itself
   then enforces the `slug='sample'` scope (Option A bullet 1, the 404-unless-sample-org check). Exempting
   it from auth without that scope check would expose every audit's status publicly — **do not do that.**
2. Because the existing Sprint 3 route is ALSO used by the authenticated dashboard, do not weaken it for
   logged-in users: it must still enforce cross-org 404 for real orgs. Simplest safe shape: at the top of
   the route, `if (audit.org.slug === 'sample') { return publicStatusJson(audit); }` (no auth), `else { run
   the existing getCurrentUser() + setRlsContext() + cross-org-404 path }`. This keeps real-org reads
   protected and only opens the sample-org branch.

> Prefer **Option A**. It keeps the public surface a separate, obviously-public file and leaves the
> hardened Sprint 3 dashboard route completely untouched (no risk of regressing real-customer isolation).

---

## CONSTRAINTS

- **Do not make the protected dashboard status route blanket-public.** Real customers' audit status must
  stay auth-gated + cross-org-404. Only the **sample-org** audits may be read without auth.
- **Public sample status must be scoped by `organizations.slug = 'sample'`** — a public endpoint that
  returns ANY audit by id is an IDOR leak. The sample-slug filter is the security boundary.
- **Return JSON, never a redirect**, on the public path. A 404 for non-sample/unknown ids; a normal status
  payload for sample ids.
- **Match the existing client contract** — the running page already parses a status/progress shape from the
  Sprint 3 route; return the same fields so no client reshape is needed.
- **`audits.status` is `'complete'`** (no trailing -d). The poll's completion check compares to `'complete'`
  (Sprint 10 line ~1047 uses `audit.status === 'complete'`). Do not introduce `'completed'` here.
- **Route param convention:** API routes use `[id]` / `[auditId]` per the existing route — match whatever
  Step 0 #1 finds; do not rename.
- No new table, no schema change, no new Inngest function. This is a route/auth-scope fix only.

---

## VERIFICATION (all must pass)

```bash
# 1. The public sample-status route exists and is NOT auth-gated, but IS sample-scoped:
find app -path '*sample-audit*status*' -name 'route.ts'                 # → exists (Option A)
grep -nE "slug.*sample|SAMPLE_SLUG" app/api/sample-audit/status/route.ts # → sample-scope filter present
grep -cE "getCurrentUser|requireAuth|redirect.*sign-in" app/api/sample-audit/status/route.ts  # → 0 (no auth redirect)

# 2. The running page polls the PUBLIC route, not the protected dashboard route:
grep -rnE "/api/sample-audit/status|/api/audits/.*status" app/**/sample-audit/running/ 2>/dev/null
#    → should reference the sample route, NOT /api/audits/[id]/status

# 3. The protected dashboard status route is UNCHANGED (still auth + cross-org 404):
grep -nE "getCurrentUser|setRlsContext|404" app/api/audits/*/status/route.ts   # → still present (real-org isolation intact)
```

### Manual test (the real proof — re-run the exact failing scenario)
1. `START-DEV.bat` running. Open an **incognito** window (no session) → `localhost:3000`.
2. Click **"Try a free sample audit"** → enter a domain → land on `/sample-audit/running?auditId=...`.
3. **Watch the dev-server log.** The status polls must now read:
   `GET /api/sample-audit/status?auditId=... 200` (JSON) — **NOT** `GET /sign-in?redirectTo=...`.
4. The progress bar advances past 4% and **reaches 100%**, then the page shows the sample result (no login).
5. **IDOR check:** while logged out, manually hit the public status route with a NON-sample audit id (any
   real audit's uuid from your DB) → must return **404**, never that audit's status. This proves the
   sample-slug scope is the security boundary.
6. **Dashboard regression:** log in as a normal test user, open a real audit → its status/progress still
   loads (the protected route still works for authenticated users).

---

## NOTE FOR THE REVIEWER (not for Claude Code)
This bug sits at the Sprint 3 × Sprint 10 seam: Sprint 10 reused the auth-gated Sprint 3 status route for a
public flow. Your S1–S10 unit/E2E tests likely passed because (a) the E2E sample-audit test was scoped to
"CTA href only" (IJ2), and (b) any status-poll test that ran logged-in wouldn't hit the redirect. The bug
only manifests for a genuinely logged-out visitor — which is exactly how the screenshot run caught it. Worth
adding a logged-OUT E2E assertion: sample-audit poll returns 200 JSON (not a sign-in redirect) and the run
completes without a session.
