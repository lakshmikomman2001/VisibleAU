# Claude Code — FIX: reports list stuck showing "Generating…" until manual reload (add poll-until-ready)

## What this is (NOT a generation bug)
Report generation works — `render-report-pdf` completes, `pdf_url` populates, other rows show **Ready** with working
**Download PDF**. The problem is purely UI: after clicking **Generate report**, the just-created row shows
**Generating…** and STAYS there because **the reports list fetches once on mount and never re-queries**. The row is
already Ready in the DB within a few seconds (pdf_url set → CM-01 derives 'ready'); the page just doesn't know. A manual
reload flips it. This is the banked item (handoff line 181): *"reports list doesn't auto-update after clicking Generate
— add poll-until-ready. Minor."*

**Canon backing (verified):**
- Sprint 4 §6U.3 (report DETAIL) already specifies the generating state with **poll/refresh** — the list should match.
- Sprint 4 §6U.2 (report LIST) defines the `generating` state but its STATES line omits polling → that's the gap.
- LLD line 104 (FIX 13 a11y): status transitions (generating→ready) belong in an `aria-live="polite"`/`role="status"`
  region with `aria-busy` — the poll must announce the flip for screen readers.
- Status stays UI-DERIVED (CM-01): `pdf_url IS NULL → generating`; `pdf_url set & email_sent_at NULL → ready`;
  `email_sent_at set → published`. **Do NOT add a status column** — just re-fetch and re-derive.

Env: local PROD DB, real LLMs, Supabase storage. Reports list route
`app/(auth)/brands/[brandId]/reports/page.tsx`; detail `.../reports/[reportId]/page.tsx`; API
`GET /api/brands/[id]/reports`.

## STEP 1 — Confirm the current fetch pattern (before changing it)
```bash
sed -n '1,140p' "app/(auth)/brands/[brandId]/reports/page.tsx"
grep -n "fetch\|useEffect\|useState\|useSWR\|useQuery\|revalidate\|refresh\|router.refresh\|setInterval\|'use client'\|generating\|pdf_url" "app/(auth)/brands/[brandId]/reports/page.tsx"
# The list-fetching component (if the page is a server component that passes data to a client list):
grep -rn "reports\|generated_reports\|report-card\|report-status-badge" components/domain/communication/ | head
```
Report: is the list a **server component** (fetches once, no client refetch) or a **client component** (has a fetch
hook)? Where does the status badge derive its value? Identify the exact file that owns the report array + renders the
rows, so the poll goes in the right place.

## STEP 2 — Add poll-until-ready to the LIST (the fix)
Poll ONLY while at least one visible report is in the `generating` state; stop when none remain. Do NOT poll forever,
do NOT poll when everything is already Ready/Published.

Implementation (adapt to the repo's actual data-fetching approach — pick the ONE that matches the codebase; do not
introduce a new data lib):

**If the list already uses a client fetch hook (SWR / React Query):**
- Add a `refreshInterval` that is ACTIVE only while any row is generating:
  - SWR: `useSWR(key, fetcher, { refreshInterval: (data) => data?.some(r => !r.pdfUrl) ? 4000 : 0 })`
  - React Query: `refetchInterval: (query) => query.state.data?.some(r => !r.pdfUrl) ? 4000 : false`
- 4s interval (matches the ~2–6s render time seen in logs). Stops automatically when the predicate goes false.

**If the list is a server component (fetch once):** convert the ROW LIST to a small client child (`'use client'`) that
takes the initial server-fetched array as a prop and polls the API only while a row is generating:
```tsx
'use client';
import { useState, useEffect, useRef } from 'react';

export function ReportsListLive({ brandId, initialReports }: { brandId: string; initialReports: Report[] }) {
  const [reports, setReports] = useState(initialReports);
  const anyGenerating = reports.some(r => !r.pdfUrl);        // CM-01: pdf_url null ⇒ generating
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!anyGenerating) return;                               // nothing pending → don't poll
    timer.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/brands/${brandId}/reports`, { cache: 'no-store' });
        if (res.ok) setReports(await res.json());             // re-derive status from fresh pdf_url/email_sent_at
      } catch { /* transient; keep last known */ }
    }, 4000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [anyGenerating, brandId]);

  // render rows + the derived status badge from `reports` (unchanged badge logic)
}
```
- Keep the SERVER component doing the initial fetch (fast first paint) and pass its result as `initialReports` — do NOT
  make the whole page client-side.
- The badge/derive logic is UNCHANGED (still `pdf_url` → generating/ready). Only the DATA refreshes.
- Guard the interval: clear on unmount; never leave a running interval; stop as soon as `anyGenerating` is false.

## STEP 3 — a11y: announce the flip (FIX 13 / LLD 104)
- Wrap the status-badge cell (or a visually-hidden live region) in `role="status" aria-live="polite"`, and set
  `aria-busy={true}` on a row while it's generating (cleared when ready). So a screen reader hears the row go
  "Generating → Ready" without a manual reload.
- The disabled Download action must ENABLE (not just visually) the moment `pdf_url` arrives (already tied to
  `pdf_url` presence — confirm it re-renders on the polled update).

## STEP 4 — (Optional, if trivial) mirror on the DETAIL page
§6U.3 already specs poll/refresh on the detail page's generating state. If the detail page ALSO shows a stuck
Generating (open a just-generated report's detail), apply the same interval pattern there ("Your report is being
generated…" → auto-flips to the rendered report + enabled download). If the detail page already polls, leave it. Report
which.

## STEP 5 — VERIFY (watch it actually flip — no manual reload)
1. Click **Generate report** on Bondi Plumbing. The new row appears as **Generating…**.
2. **Without reloading**, within ~4–8s the badge flips to **Ready** and **Download PDF** becomes clickable. Confirm
   this happens on its own.
3. Confirm the interval STOPS once all rows are Ready (no continued `GET /api/brands/.../reports` in the network tab /
   server log after everything resolves — check the terminal: the repeated `GET …/reports` should cease).
4. Screen-reader / DOM check: the generating row had `aria-busy`, and the status region announced the change.
5. No status column was added; badge still derives from pdf_url/email_sent_at.

## Constraints
- **No status column** — CM-01 derivation stays; only the client re-fetches + re-derives.
- **Bounded polling** — poll ONLY while a row is generating; stop when none are; clear interval on unmount. No infinite
  background polling, no polling a fully-Ready list.
- Use the repo's EXISTING data-fetching approach (don't add SWR/React Query if the app doesn't already use it — the
  server-component-plus-client-child pattern above needs neither).
- Keep the server component's initial fetch for first paint; only the row list becomes live.
- Match the existing report-card / report-status-badge components — don't restyle; only wire the refresh + a11y.
- The PostHog 404s in the console (`config.js`, `/array/local-disabled/config`, `/flags?v=2`, `/e?ip=0`) are unrelated
  telemetry noise — ignore them; not part of this fix.

## Verification greps
```bash
grep -rn "no-store\|refreshInterval\|refetchInterval\|setInterval" "app/(auth)/brands/[brandId]/reports/" components/domain/communication/ | head
grep -rn "aria-live\|role=\"status\"\|aria-busy" components/domain/communication/ "app/(auth)/brands/[brandId]/reports/" | head
grep -rn "status.*column\|reportStatus\b" db/schema/generated-reports.ts   # → still no status column
```
