# VisibleAU — INVESTIGATE + FIX: 404 page "Your recent audits" block never renders (logged-in)

**Phase/Sprint:** Phase 1, Sprint 11 (`app/not-found.tsx`, IE2). **Severity: LOW** (cosmetic — the 404
page works; only the nice-to-have recent-audits convenience block is missing). Fix anyway per
ready-a-fix-for-every-issue discipline. **This is INVESTIGATE-FIRST** — the failing error is swallowed by a
silent catch, so find the real cause before editing.

---

## SYMPTOM (observed 26 Jun 2026)

The 404 page (triggered by visiting a non-existent route, e.g. `/docs`) is CONDITIONAL:
- **Logged-out:** "404 / Couldn't find that page. / ← Back to home" → **works.** ✓
- **Logged-in:** the back link correctly flips to "← Back to dashboard" → **works** (auth detection is fine).
  BUT the spec's **"Your recent audits"** block (up to 3 of the user's audits, each linking to
  `/audits/{id}`) **does NOT appear** — even though the logged-in user demonstrably HAS audits (their
  dashboard shows "Recent audits: 5" + multiple completed audits like Bondi Plumbing, Marrickville Dental).

So: auth detection works (back-link flip proves it), but the recent-audits FETCH returns nothing.

## ROOT CAUSE HYPOTHESIS (confirm — don't assume)

The spec's `not-found.tsx` (IE2) wraps the recent-audits fetch in a **silent catch**:
```ts
if (userId) {
  try {
    const currentUser = await getCurrentUser();
    if (currentUser) {
      await setRlsContext(db, currentUser.organizationId);
      recentAudits = await db.select({ id: audits.id, brandName: brands.name,
        scoreComposite: audits.scoreComposite })
        .from(audits).innerJoin(brands, eq(audits.brandId, brands.id))
        .where(eq(brands.organizationId, currentUser.organizationId))
        .orderBy(desc(audits.createdAt)).limit(3);
    }
  } catch { /* silently skip — never block the 404 page */ }
}
```
The block only renders when `recentAudits.length > 0`. If ANYTHING in that try throws, the catch swallows it
and the block silently won't render — exactly this symptom (no error on screen, no block, page otherwise OK).

**Most likely:** the same **Clerk→Better Auth drift (C-04)** that the auth-detection half avoided, but in the
DATA-FETCH half. The spec's canonical code is the Clerk version (`auth()` for `userId`, then
`getCurrentUser()` for the fetch). The `userId` check was ported to Better Auth (so the back-link flip
works), but the `getCurrentUser()` → `setRlsContext()` → org-scoped query chain inside the try may not have
been fully adapted to Better Auth's session shape — and the silent catch hid the failure.

**Key asset:** the DASHBOARD already fetches recent audits successfully (the screenshot proves it). So a
WORKING recent-audits query pattern exists elsewhere in the repo to copy from (Sprint 8 dashboard /
overview). Find it and mirror it.

---

## STEP 0 — INVESTIGATE (surface the swallowed error; change nothing yet)
```bash
# 1. Read the actual not-found.tsx — is it still Clerk, or Better-Auth-ported? Where's the catch?
find app -name 'not-found.tsx' | head
grep -nE "clerk|@clerk|auth\(\)|getCurrentUser|getSession|setRlsContext|catch|recentAudits|userId" app/not-found.tsx
#    Note: does it import Clerk anywhere? does getCurrentUser() exist + return organizationId under Better Auth?

# 2. TEMPORARILY surface the swallowed error to see the REAL cause. In the catch block, change
#    `catch { /* silently skip */ }` to `catch (e) { console.error('[not-found recentAudits]', e); }`
#    (KEEP the catch — we still must never block the 404; we're just logging). Then, logged in, visit
#    /docs and read the dev-server terminal. The logged error is the authoritative cause. Capture it.
#    (Revert to silent catch — or keep a logged catch — as part of the final fix.)

# 3. Find the WORKING recent-audits query to copy (dashboard/overview — it works in the screenshot):
grep -rnE "recentAudits|orderBy\(desc\(audits.createdAt|Recent audits" app/ lib/ components/ | head
#    Mirror whatever auth + scoping that working query uses (getCurrentUser shape, RLS call, joins).

# 4. Confirm getCurrentUser()'s real return shape under Better Auth (the spec assumed Clerk):
grep -rnE "export.*getCurrentUser|function getCurrentUser|organizationId" lib/auth/ lib/ 2>/dev/null | head
#    Does it return { organizationId } directly, or nested (e.g. user.organizationId / session.user...)?
#    A shape mismatch here (currentUser.organizationId === undefined) would make the WHERE match zero rows
#    or throw — a prime suspect.

# 5. Quick data sanity (rule out "no audits"): the logged-in org DOES have audits —
psql "$DATABASE_URL" -c "SELECT b.organization_id, COUNT(a.*) FROM audits a JOIN brands b ON b.id=a.brand_id GROUP BY b.organization_id ORDER BY 2 DESC LIMIT 5;"
#    (Confirms rows exist; the dashboard already implies this.)
```

**Report the swallowed error string (Step 0.2) + getCurrentUser's real shape (Step 0.4) before fixing.**

---

## THE FIX (apply after Step 0 confirms the cause)

The principle: make `not-found.tsx`'s recent-audits fetch use the SAME working auth + org-scoping pattern the
dashboard uses, adapted to Better Auth — and stop the silent catch from hiding future failures.

Likely changes (confirm against Step 0):
1. **Better Auth port of the fetch half.** Replace any Clerk-shaped access with the repo's real Better Auth
   helper (mirror the dashboard's recent-audits query). Ensure `currentUser.organizationId` (or whatever the
   real shape is) is actually populated — if `getCurrentUser()` returns a nested shape, read it correctly.
2. **Keep the 404 un-blockable, but stop swallowing silently.** Keep the try/catch (the 404 must NEVER crash),
   but log the error in the catch (`catch (e) { console.error('[not-found recentAudits]', e); }`) so a future
   failure is debuggable instead of invisible. (A silently-swallowed catch is what let this hide.)
3. **Match the working query exactly** — same joins (`audits` ⨝ `brands`), same org filter
   (`brands.organizationId === currentUser.organizationId`), `orderBy(desc(audits.createdAt)).limit(3)`,
   selecting `{ id, brandName, scoreComposite }`. Don't invent a new query shape.

Do NOT change the logged-OUT branch (it works) or the back-link logic (it works). Only the in-`try`
recent-audits fetch + the catch logging.

---

## CONSTRAINTS
- **Never block the 404.** The page must still render "404 / Couldn't find that page / back link" even if the
  audit fetch fails. Keep the try/catch — just log instead of swallowing silently.
- **Org-scoping is mandatory (security).** Recent audits MUST be filtered to the user's own org
  (`currentUser.organizationId`) — a 404 page must never leak another org's audits. (CLAUDE.md: every
  resource read checks `organizationId`.) Preserve `setRlsContext` + the org WHERE.
- **Better Auth, not Clerk** (C-04). No `@clerk/*` imports in `not-found.tsx`. Use the real session helper.
- **`audits.status='complete'`** (no -d) if the query filters by status; `scoreComposite` is 0–100. Match the
  dashboard's existing field usage — don't introduce new spellings.
- Presentation of the block per spec: `recentAudits.length > 0 &&` guard (an org with zero audits correctly
  shows no block — that's fine), each row links to `/audits/{id}`, heading "Your recent audits".
- No schema change, no new route.

---

## VERIFICATION (must pass)
```bash
# 1. No Clerk in not-found.tsx; uses Better Auth + the working pattern:
grep -nE "@clerk|clerk" app/not-found.tsx                       # → 0 matches
grep -nE "getCurrentUser|setRlsContext|organizationId" app/not-found.tsx  # → present (org-scoped)

# 2. Catch logs instead of swallowing silently (debuggable in future):
grep -nE "catch \(e\)|console.error" app/not-found.tsx           # → present (no bare `catch {}`)

# 3. Org filter preserved (no cross-org leak):
grep -nE "brands.organizationId|organizationId\)" app/not-found.tsx  # → present
```

### Manual test (re-run both states)
1. **Logged in** (a user WITH audits — e.g. the Agency dev account showing 5 recent audits) → visit `/docs`.
   - The **"Your recent audits"** block now appears, listing up to 3 audits (e.g. Bondi Plumbing,
     Marrickville Dental), each a link to `/audits/{id}`. Click one → opens that audit.
   - Back link still says "← Back to dashboard".
2. **Cross-org safety:** if you have a second test org, log in as a user from org B → visit `/docs` → the
   block shows org B's audits only, never org A's.
3. **Empty-history user** (if available): a logged-in user with NO audits → block correctly hidden (this is
   fine, not a bug).
4. **Logged out** (incognito) → `/docs` → still "← Back to home", no audits block (unchanged). ✓
5. **404 never crashes:** the page always renders the 404 heading + back link, even if the fetch errs (now
   logged, not swallowed).

---

## NOTE FOR THE REVIEWER (not for Claude Code)
Fifth finding of the 26-Jun session, and the mildest — the 404 page's auth DETECTION was correctly ported to
Better Auth (back-link flip works) but the recent-audits FETCH half likely wasn't, and a silent catch hid it.
This is the Clerk→Better-Auth drift (C-04) showing up one more time, in the data half rather than the auth
half. Lesson reinforced: silent `catch {}` blocks turn real failures invisible — the fix adds logging so the
next one is debuggable. Worth an E2E later: logged-in 404 for a user with audits asserts ≥1 recent-audit link
renders.
