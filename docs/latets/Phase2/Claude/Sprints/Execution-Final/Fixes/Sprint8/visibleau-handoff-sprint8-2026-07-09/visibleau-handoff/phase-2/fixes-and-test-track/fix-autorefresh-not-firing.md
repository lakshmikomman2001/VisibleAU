# Claude Code — DIAGNOSE then FIX: reports list not auto-refreshing (poll code present but badge doesn't flip)

The poll fix is in the code (setInterval + no-store + aria-busy — greps pass) but behaviorally the badge does NOT flip
Generating→Ready without a manual reload. So one of three things is wrong. FIND which (STEP 1-3), then fix ONLY that.
Don't rewrite the whole thing blind.

Env: local PROD DB, real LLMs, Supabase. List: `app/(auth)/brands/[brandId]/reports/page.tsx` + the client child that
polls; API `GET /api/brands/[id]/reports`; badge via `deriveReportStatus()`.

## The 3 candidates (each a different fix)
- **A — interval never starts:** `anyGenerating` is false at mount because the polled/initial data's pdf_url field is
  read wrong → condition never true → no polling.
- **B — polls but UI doesn't update:** re-fetch runs, but the response shape ≠ what the badge reads, OR the badge reads
  an initial prop instead of the polled state → new data arrives, row doesn't re-derive.
- **C — stale closure / wrong deps:** effect captured initial `reports`, never re-runs; interval frozen or never cleared.

## STEP 1 — The field-name mismatch check (most common cause — do this FIRST)
The API response shape vs what the client reads is the usual culprit.
```bash
# What does the API actually RETURN — pdf_url (snake) or pdfUrl (camel)? And the row shape?
sed -n '1,80p' "app/api/brands/[brandId]/reports/route.ts" 2>/dev/null || find app/api -path "*reports/route.ts"
grep -n "pdf_url\|pdfUrl\|select\|json\|map\|return NextResponse\|deriveReportStatus" "app/api/brands/[brandId]/reports/route.ts"
# What does the CLIENT check to decide 'generating' + to derive the badge?
grep -rn "pdfUrl\|pdf_url\|anyGenerating\|some(\|deriveReportStatus\|generating\|setReports\|initialReports" "app/(auth)/brands/[brandId]/reports/" components/domain/communication/
```
Report the EXACT field name in three places: (1) the API JSON response, (2) the client's `!r.pdfUrl` / `some(...)`
generating check, (3) what `deriveReportStatus()` reads. **If they disagree (snake vs camel, or `pdfUrl` vs
`pdf_url`), that's the bug:**
- If the client's generating-check field is ALWAYS falsy (e.g. checks `r.pdfUrl` but API returns `pdf_url`, so it's
  `undefined` → `!undefined` = true forever) → it polls forever but the BADGE derive also reads the wrong field so it
  never shows Ready → **B/A hybrid**. 
- If the check field is ALWAYS truthy → `anyGenerating` false at mount → never polls → **A**.
Either way: normalize the field. Make the API response, the generating check, and deriveReportStatus all read the SAME
field name (map snake→camel at the API boundary, or read snake consistently). This is the likely one-line root cause.

## STEP 2 — If fields match: is the interval actually running? (A vs C)
Add a temporary console.log in the interval + the effect (or check via React DevTools):
```bash
sed -n '1,60p' components/domain/communication/*reports-list*live* 2>/dev/null || grep -rln "setInterval" "app/(auth)/brands/[brandId]/reports/" components/domain/communication/
```
Look at the effect: 
- Is the `setInterval` inside a `useEffect` whose deps include `anyGenerating` + `brandId`? 
- Does `anyGenerating = reports.some(r => !r.pdfUrl)` recompute on each render (it should, it's derived) — or was it
  captured once?
- In the browser Network tab after clicking Generate: does `GET /api/brands/.../reports` fire every 4s? 
  - **Fires every 4s but badge stays Generating** → data arrives but UI doesn't re-derive → **B** (STEP 3).
  - **Never fires** → interval never started → **A** (anyGenerating false at mount — recheck STEP 1 field, or the row
    initially has pdf_url set wrong).
  - **Fires forever even after Ready** → auto-stop broken (the other failure mode) → the `some()` never goes false →
    STEP 1 field again.

## STEP 3 — If it polls but UI doesn't update (B)
```bash
grep -n "setReports\|useState\|\.map(\|status=\|deriveReportStatus\|r.pdfUrl\|report.pdfUrl" components/domain/communication/*.tsx "app/(auth)/brands/[brandId]/reports/"*.tsx
```
Check:
- Does the interval call `setReports(await res.json())` with the SAME shape the initial state used? If the API returns
  `{ reports: [...] }` but the client does `setReports(json)` (the whole object, not `json.reports`), state becomes
  malformed → rows don't render/derive. Match the shape.
- Does the badge derive from the polled `reports` STATE, or from the original `initialReports` PROP? It must read the
  live state. If a row component memoizes on a stale prop, it won't re-derive.
- Does `deriveReportStatus()` get the fresh row? Confirm the row passed to the badge is from the polled state.

## STEP 4 — Apply the ONE fix the diagnosis points to, then VERIFY BEHAVIORALLY
Fix only the identified cause (most likely STEP 1 field normalization). Then — NOT a grep — actually watch:
1. Click **Generate report** (Metropolitan). Row appears **Generating…**.
2. WITHOUT reloading: within ~4–8s the badge flips to **Ready**, Download enables. **Watch it happen.**
3. Network tab: `GET …/reports` fires every ~4s WHILE generating, then STOPS once Ready (no endless polling).
Report: (a) which of A/B/C it was + the exact field/shape mismatch, (b) the badge now flips without reload, (c) polling
stops after Ready.

## Constraints
- Diagnose before fixing — name A, B, or C with evidence (the field names / the Network behavior). No blind rewrite.
- Keep status CM-01-derived (no status column). Keep the bounded-poll (stop when none generating; clear on unmount).
- Fix the ROOT (field/shape mismatch) — don't paper over by, e.g., removing the stop condition so it polls forever.
- Remove any temporary console.logs before finishing.

## NOTE
Greps proved the poll CODE exists; they can't prove it FIRES or that the field it checks matches the API. The classic
cause is a snake_case/camelCase mismatch between the API response (pdf_url) and the client check (pdfUrl) — making the
generating-condition permanently true or permanently false, so it either polls forever with a badge that never updates,
or never polls at all. STEP 1 finds that in one look. Fix the field alignment, then WATCH the badge flip and the polling
stop — behavioral confirmation, not a grep.
