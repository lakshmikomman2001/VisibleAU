# Claude Code — FIX: reports list stays "Generating…" until manual reload (add poll-until-ready)

## What this is
Report generation works — the row shows **Generating…** and stays there because the reports LIST fetches once on mount
and never re-queries. The row is Ready in the DB within a few seconds (pdf_url populates → CM-01 derives 'ready'); the
page just doesn't know until a manual reload. Confirmed live multiple times. Banked item — close it.

## Canon (spec-backed — verified)
- Sprint 4 §6U.3 (report DETAIL) already specifies the generating state **with poll/refresh** — the list should match.
- §6U.2 (report LIST) defines the `generating` state (badge + disabled download from pdf_url null) but its STATES line
  OMITS polling → that's the gap.
- LLD line 104 (FIX 13): the generating→ready transition belongs in `aria-live="polite"`/`role="status"` with
  `aria-busy` — the poll must announce the flip for screen readers.
- Status stays UI-DERIVED (§0.5 / line 761): `pdf_url IS NULL → generating`; set & email_sent_at NULL → ready;
  email_sent_at set → published. **Do NOT add a status column** — re-fetch and re-derive.

Env: local PROD DB, real LLMs, Supabase. List route `app/(auth)/brands/[brandId]/reports/page.tsx`; API
`GET /api/brands/[id]/reports`; components `report-card.tsx` / `report-status-badge.tsx`.

## STEP 1 — Confirm the current fetch pattern
```bash
sed -n '1,140p' "app/(auth)/brands/[brandId]/reports/page.tsx"
grep -n "fetch\|useEffect\|useState\|useSWR\|useQuery\|revalidate\|router.refresh\|setInterval\|'use client'\|generating\|pdfUrl\|pdf_url" "app/(auth)/brands/[brandId]/reports/page.tsx"
grep -rn "pdfUrl\|pdf_url\|generating\|report-status-badge\|report-card" components/domain/communication/ | head
```
Report: is the list a SERVER component (fetch once) or CLIENT (has a fetch hook / SWR / React Query)? Where does the
status badge derive its value (must be from pdf_url)? Identify the exact file that owns the report array + renders rows.

## STEP 2 — Poll ONLY while a row is generating; stop when none remain
Pick the ONE approach matching the codebase — do NOT introduce a new data lib.

**If the list already uses SWR / React Query:** make the refresh interval conditional on any row generating:
- SWR: `useSWR(key, fetcher, { refreshInterval: (data) => data?.some(r => !r.pdfUrl) ? 4000 : 0 })`
- React Query: `refetchInterval: (q) => q.state.data?.some(r => !r.pdfUrl) ? 4000 : false`

**If the list is a SERVER component (fetch once):** keep the server fetch for first paint, and move the ROW LIST into a
small `'use client'` child that takes the server-fetched array as `initialReports` and polls only while a row is
generating:
```tsx
'use client';
import { useState, useEffect, useRef } from 'react';

export function ReportsListLive({ brandId, initialReports }: { brandId: string; initialReports: Report[] }) {
  const [reports, setReports] = useState(initialReports);
  const anyGenerating = reports.some(r => !r.pdfUrl);         // CM-01: pdf_url null ⇒ generating
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

  // render rows + the derived status badge from `reports` (badge logic UNCHANGED)
}
```
- 4s interval (matches the ~2–6s render seen in logs). Stops automatically the moment `anyGenerating` is false.
- Badge/derive logic UNCHANGED — only the DATA refreshes. Clear the interval on unmount; never leave one running; never
  poll a fully-Ready list.

## STEP 3 — a11y: announce the flip (FIX 13 / LLD 104)
- Wrap the status-badge cell (or a visually-hidden live region) in `role="status" aria-live="polite"`; set `aria-busy`
  on a row while generating (cleared when ready).
- Confirm the disabled Download action ENABLES on the polled update the moment pdf_url arrives (it's tied to pdf_url
  presence — verify it re-renders).

## STEP 4 — (if trivial) mirror on the DETAIL page
§6U.3 already specs poll/refresh on the detail page's generating state. If a just-generated report's DETAIL page also
sits on "Your report is being generated…", apply the same interval there (auto-flips to the rendered report + enabled
download). If it already polls, leave it. Report which.

## STEP 5 — VERIFY (watch it flip — no manual reload)
1. Click **Generate report** (Metropolitan) → new row appears **Generating…**.
2. WITHOUT reloading, within ~4–8s the badge flips to **Ready** and **Download PDF** becomes clickable — on its own.
3. The interval STOPS once all rows are Ready — confirm `GET …/reports` requests CEASE in the terminal/network tab
   after everything resolves (no endless polling).
4. a11y: the generating row had `aria-busy`; the status region announced the change.
5. No status column added; badge still derives from pdf_url/email_sent_at.
Report: does it auto-flip, and does polling stop afterward?

## Constraints
- **No status column** — CM-01 derivation stays; client only re-fetches + re-derives.
- **Bounded polling** — only while a row is generating; stop when none are; clear on unmount. No infinite background
  polling, no polling a Ready-only list.
- Use the repo's EXISTING data approach (the server-component-plus-client-child pattern needs no new lib).
- Keep the server component's initial fetch for first paint; only the row list becomes live.
- Match existing report-card / report-status-badge components — don't restyle; only wire refresh + a11y.
- PostHog 404s in console (config.js, /array/local-disabled, /flags, /e) are unrelated telemetry noise — ignore.

## Verification greps
```bash
grep -rn "no-store\|refreshInterval\|refetchInterval\|setInterval" "app/(auth)/brands/[brandId]/reports/" components/domain/communication/ | head
grep -rn "aria-live\|role=\"status\"\|aria-busy" components/domain/communication/ "app/(auth)/brands/[brandId]/reports/" | head
grep -rn "status.*column\|reportStatus\b" db/schema/generated-reports.ts   # → still no status column
```

## NOTE
Poll the list only while a row is generating, stop when all resolve, keep status CM-01-derived, announce the flip per
FIX 13. The detail page already specs poll/refresh (§6U.3) — the list just needs to match. Verify the badge flips
WITHOUT a manual reload AND that polling stops afterward (no endless GET …/reports). This closes the banked auto-refresh
gap and removes the "looks stuck but isn't" confusion.
