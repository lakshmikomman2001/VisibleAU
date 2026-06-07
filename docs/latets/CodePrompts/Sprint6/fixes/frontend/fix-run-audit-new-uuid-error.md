# Claude Code task — fix "Run audit" crash (audits.id = 'new' invalid UUID)

## The bug

Clicking **Run audit** on the Brand Detail page throws a server-side `DrizzleQueryError`:

```
Failed query: select "id", "brand_id", "organization_id", "audit_number", "status", ...
  from "audits" where ("audits"."id" = $1 and "audits"."organization_id" = $2)
params: new, e079235f-1caa-4c54-a7f7-13ddf8186413
```

`$1` (`audits.id`) is the literal string `"new"`. `audits.id` is a `uuid` column, so Postgres
rejects `'new'::uuid` ("invalid input syntax for type uuid") and Drizzle wraps it as the error.

## Root cause

The audit-detail server component (`app/(auth)/.../audits/[auditId]/page.tsx`) is being reached
with `auditId === "new"` and runs the full `audits` SELECT unconditionally from `params.auditId`.
When the user clicks **Run audit**, the app is landing on that route with a literal `new` segment
instead of creating the audit first and navigating to the real returned UUID.

The intended flow (per the Sprint 2 spec) is:
`POST /api/audits` → returns `{ auditId, auditNumber }` → navigate to `/audits/{auditId}`.
There is **no** `new` audit page in the design. The built code has drifted from this.

## Step 1 — Investigate before changing anything

Locate and read these, and report back which one is producing the `"new"` id:

1. The **Run audit** button / handler on the Brand Detail page. Search the brand-detail
   component(s) for the button label "Run audit" and inspect how it navigates — look for any of:
   - a hardcoded `<Link href=".../audits/new">` or `router.push('.../audits/new')`
   - `fetch('/api/audits', { method: 'POST', ... })` followed by a navigation that reads the
     response shape **wrongly** (e.g. `const { id } = await res.json()` when the route returns
     `{ auditId, auditNumber }`, leaving the id `undefined`)
2. The audit-detail page: `app/(auth)/**/audits/[auditId]/page.tsx` (and any parent `layout.tsx`
   or `loading.tsx` in that segment).
3. The API route: `app/api/audits/[auditId]/route.ts` (GET).
4. Confirm `POST /api/audits` still returns `{ auditId, auditNumber }` (do not change this contract).

Tell me which of (1) the button or (2) an unguarded page is the trigger. Then apply BOTH fixes
below regardless — fix 1 removes the cause, fix 2 hardens the route against the whole class of bug.

## Step 2 — Fix 1: Run audit button = create-then-redirect to the returned id

The button must POST to `/api/audits`, read `auditId` from the response, and push to that real UUID.
Match the existing client-component / toast / loading-state patterns already used elsewhere in the app.

```tsx
async function handleRunAudit() {
  setRunning(true);                         // reuse the existing loading-state pattern
  try {
    const res = await fetch('/api/audits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandId }),    // brandId from props/params; add scenario only if already used
    });
    if (!res.ok) {
      // reuse the app's existing error-toast pattern; surface a friendly message
      return;
    }
    const { auditId } = await res.json();   // NOT { id } — the route returns { auditId, auditNumber }
    router.push(`/audits/${auditId}`);      // a real UUID, never "new"
  } finally {
    setRunning(false);
  }
}
```

- Do **not** introduce or keep an `/audits/new` route — it is not part of the design.
- If the button currently is a plain `<Link>`, convert it to a client action with the handler above
  (the brand-detail page can stay a server component; extract just the button into a small client
  component if needed — follow whatever client/server split the codebase already uses).

## Step 3 — Fix 2: guard the audit routes against non-UUID params (defense in depth)

Never cast an arbitrary route string to `uuid`. Add a shared validator and use it in both the
audit-detail page and the GET API route, returning a clean 404 for anything that is not a UUID.

Add (or reuse if one already exists) a tiny helper, e.g. `lib/validation/uuid.ts`:

```ts
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: string | undefined | null): v is string {
  return !!v && UUID_RE.test(v);
}
```

In `app/(auth)/**/audits/[auditId]/page.tsx` (top of the server component, BEFORE any DB query and
before/after `await params` as appropriate for the Next version in use):

```tsx
import { notFound } from 'next/navigation';
import { isUuid } from '@/lib/validation/uuid';

export default async function AuditPage({ params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params;
  if (!isUuid(auditId)) notFound();   // 'new', garbage, etc. → 404, never reaches Postgres
  // ...existing getCurrentUser() + setRlsContext(db, organizationId) + audit query...
}
```

In `app/api/audits/[auditId]/route.ts` (GET): apply the same guard and return `404` (NextResponse,
status 404) for a non-UUID `auditId`, before the DB call. Keep the existing `getCurrentUser()` +
`setRlsContext(db, currentUser.organizationId)` calls — do not remove or reorder them; the RLS
backstop on `audits`/`citations` must still fire.

## Step 4 — Sweep for the same class of bug (security + scalability)

Grep the codebase for other dynamic routes that read a `[*Id]` param and pass it straight into a
Drizzle `eq(table.id, param)` (or similar) without validation — especially the Phase 2-adjacent
brand-scoped pages (`brands/[brandId]/...`). Apply the same `isUuid(...) → notFound()` /404 guard to
any page or route handler that casts a URL segment to a `uuid` column. Report the list of files you
touched.

## Constraints (must hold)

- Do not change the `POST /api/audits` response contract (`{ auditId, auditNumber }`).
- Do not weaken or skip `getCurrentUser()` / `setRlsContext(...)` anywhere you edit.
- Cross-org access must still resolve to 404 (not 401/500), consistent with the existing pattern.
- Match the codebase's existing client/server component split, toast/loading patterns, and import
  style. No new dependencies.
- Page routes use `[brandId]`; API routes use `[id]` — do not "normalise" one into the other.

## Verification (run and report results)

1. `pnpm typecheck` (or the project's tsc script) — clean.
2. `pnpm lint` — clean (no unused vars introduced).
3. Manual flow: from Brand Detail, click **Run audit** → confirm it POSTs, then redirects to
   `/audits/<real-uuid>` and the detail page renders without the Drizzle error.
4. Hit `/audits/new` (and `/audits/not-a-uuid`) directly → confirm a 404, not a 500.
5. Run any existing audit-related unit/integration tests; add a small test asserting that the
   audit-detail route returns 404 for a non-UUID `auditId` if the test setup supports it.

When done, summarise: which file caused the `"new"` id, the exact change made to the button, the
files that received the UUID guard, and the verification output.
