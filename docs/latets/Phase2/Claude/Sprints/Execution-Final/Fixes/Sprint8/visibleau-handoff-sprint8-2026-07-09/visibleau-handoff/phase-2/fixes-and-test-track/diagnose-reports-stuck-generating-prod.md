# Claude Code — DIAGNOSE ONLY (NO fixes): reports stuck "Generating…" in PROD mode (pdf_url never populates)

**Context / environment (from Sri):** local **PROD** database on this machine, **real LLMs**, **Supabase for Reports storage**
(`STORAGE_DRIVER=supabase`, private bucket `reports`, pre-signed 7-day URLs). Two reports on
`/brands/0f531803-b529-4d09-9fd6-b6272b5baba8/reports` (brand "Bondi Plumbing", org "Test Org Agency 1", **Agency tier**)
are stuck on **Generating…** with **Pending…** actions, both period `2026-W01`, created 04/07/2026.

**What that means (verified against canon — do not re-litigate):**
- Status is UI-DERIVED (CM-01, LLD 8371–8375): `pdf_url IS NULL → 'generating'`. So both rows were **INSERTed** but
  **`pdf_url` was never set**. The "Pending…" action = download gated on `pdf_url` present.
- The report ROWS exist → the trigger + row-insert hop **succeeded**. The failure is in the **PDF render → Supabase
  upload → UPDATE pdf_url** hop.
- Per the prior session (handoff bug #7), PDF rendering was split into a **separate `render-report-pdf` Inngest
  function** that listens on `report/generated`, renders, uploads to Supabase, and sets `pdf_url`. (The LLD spec put
  this inline in `generate-narrative-report`; the repo diverged. Confirm which shape the repo actually has — STEP 1.)
- The console `POST /e?ip=0&…&ver=1.376.6 404` is **PostHog autocapture noise — IGNORE IT.** It is not the cause.

**DIAGNOSE ONLY. Change NO source, NO data, NO env.** The error is server-side (Inngest / Supabase), not in the browser.
Report findings with evidence; propose a fix direction for approval but apply nothing.

---

## STEP 0 — Exactly ONE Inngest server? (recurring footgun — resolve trust first)
The prior session repeatedly hit two Inngest dev servers (port conflict 8288 → 8290) with events splitting between them.
```bash
lsof -i :8288 -i :8290 -i :8289 -i :8291 2>/dev/null || netstat -ano | findstr ":8288 :8290 :8289 :8291"
# Which Inngest does the APP register with? (serve endpoint + dev URL)
grep -rnE "8288|8290|INNGEST_DEV|INNGEST_BASE_URL|INNGEST_DEV_SERVER_URL|localhost:8288|localhost:8290" .env.prod .env.local .env inngest/ lib/inngest* 2>/dev/null | head
```
Report: how many Inngest servers are up, on which ports, and which one the app's `serve()` endpoint + the browser
dashboard correspond to. If two are running, that ALONE can strand `report/generated` (emitted to one, consumer
registered on the other). Note it; don't kill anything yet.

## STEP 1 — Which architecture does the repo have: inline render, or a separate render-report-pdf function?
```bash
ls inngest/functions/ | grep -iE "report|pdf"
# Does a separate render function exist and what does it listen on?
grep -rn "report/generated" inngest/functions/ | head
grep -n "renderToBuffer\|pdf-builder\|buildReportPdf\|renderReportPdf\|storage\|upload\|createSignedUrl\|getSignedUrl\|pdf_url\|update.*generated_reports\|\.from(" inngest/functions/render-report-pdf.ts inngest/functions/generate-narrative-report.ts 2>/dev/null
```
Report: is PDF rendering (a) inline in `generate-narrative-report` after the INSERT, or (b) a separate
`render-report-pdf` listening on `report/generated`? Whichever it is, does that code path actually contain
renderToBuffer → Supabase upload → `UPDATE generated_reports SET pdf_url`?

## STEP 2 — Is the PDF-render function REGISTERED in serve()? (prime suspect #2)
```bash
# The serve() registration array — does it include render-report-pdf (or whatever STEP 1 found)?
grep -n "serve(" app/api/webhooks/inngest/route.ts
sed -n '1,60p' app/api/webhooks/inngest/route.ts | grep -nE "generateNarrativeReport|renderReportPdf|render-report-pdf|sendScheduledReports|functions:"
```
Report: list every function in the `serve()` functions array. Is the PDF-render function (STEP 1) present? **If it is
NOT registered, `report/generated` is emitted into the void → hop 2 never runs → stuck 'generating' forever.** (The LLD
only counts the 2 spec'd S4 functions in serve()=11-after-S4; the render-report-pdf function is an EXTRA the session
added, so it is easy to have been left out of the array.)

## STEP 3 — The Inngest run trace: did the render hop fire, and did it error? (decisive)
```bash
# Correct single server from STEP 0 (:8288 or :8290):
curl -s "http://localhost:8288/v1/events?limit=15" 2>&1 | head -60
curl -s "http://localhost:8288/v1/runs?limit=15"   2>&1 | head -100
```
Also read the app/inngest terminal logs for `render-report-pdf` (or `generate-narrative-report` if inline) — the exact
error + stack trace. Report:
- Was a `report/generated` event emitted (STEP 3 events list)?
- Did the render-pdf function RUN? Status **Failed / Running-Retrying / Completed**?
- If Completed in ~1s with pdf_url still null → it no-op-completed (early return or swallowed throw).
- If Failed → the exact error + which step (renderToBuffer vs Supabase upload vs the UPDATE).

## STEP 4 — The report rows' actual DB state (how far the chain got)
```bash
psql "$DATABASE_URL" -c "SELECT id, brand_id, period_label, pdf_url, narrative_text IS NOT NULL AS has_narrative, headline IS NOT NULL AS has_headline, email_sent_at, created_at, updated_at FROM generated_reports WHERE brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8' ORDER BY created_at DESC LIMIT 4;"
```
Report: on both rows — is `narrative_text` populated (→ narrative hop succeeded, only PDF hop is broken) or NULL
(→ died earlier)? Is `pdf_url` NULL (expected — that's the 'generating')? Did `updated_at` bump after `created_at`
(→ something touched the row post-insert) or is it equal (→ nothing ran after insert)?

## STEP 5 — Supabase Storage config + bucket reachability in PROD (prime suspect #1)
The handoff's #1 open item was: **the `service_role` key in `.env.prod` was still a PLACEHOLDER.** Verify it's real now,
and that the `reports` bucket exists.
```bash
# Which storage driver + which env is the running PROD server on?
grep -nE "STORAGE_DRIVER|SUPABASE_URL|SUPABASE_SERVICE_ROLE|SUPABASE_ANON|SUPABASE_STORAGE_BUCKET|reports" .env.prod 2>/dev/null
# Is the service_role key a real JWT (starts eyJ...) or still a placeholder/empty?
#   (DO NOT print the full key — just confirm shape: length + first 6 chars.)
awk -F= '/SUPABASE_SERVICE_ROLE/{print substr($2,1,6)"…  len="length($2)}' .env.prod 2>/dev/null
# What bucket does the upload target, and via which adapter?
grep -rn "\.from(['\"]" lib/storage/ lib/communication/ inngest/functions/ | grep -iE "report|pdf|bucket" | head
sed -n '1,50p' lib/storage/supabase-adapter.ts 2>/dev/null
```
Report:
- Running PROD server: `STORAGE_DRIVER` value? (must be `supabase` for this env.)
- `SUPABASE_SERVICE_ROLE` — real JWT (eyJ… , len ~200+) or placeholder/empty? **If placeholder → the upload throws →
  pdf_url never set → stuck 'generating'. This is the most likely PROD-only cause.**
- Bucket name the adapter uploads to (`reports`?) — and does it exist in the Supabase project? (If Storage is
  reachable, a `storage.from('reports').upload()` against a missing bucket returns a "Bucket not found" error — look
  for that in STEP 3's trace.)

## STEP 6 — If render fired + storage is configured: is renderToBuffer throwing on REAL-LLM data?
Real LLM output can contain shapes the mock fixtures never produced (a null section, an unexpected field) that
@react-pdf chokes on.
```bash
sed -n '1,80p' lib/communication/pdf-builder.tsx 2>/dev/null
grep -n "renderToBuffer\|@react-pdf\|Document\|Page\|\.map(\|undefined\|null" lib/communication/pdf-builder.tsx | head -40
```
Report: does the render walk any section array that could be null/undefined from a missing Sprint-3 row under real
data? Cross-check against STEP 3's error if it pointed at renderToBuffer.

---

## VERDICT (report ONE, with the trace/error as evidence)
- **A — render-report-pdf NOT registered in serve()** (STEP 2) → `report/generated` never consumed → stuck. Fix: add
  it to the serve() functions array.
- **B — Supabase upload failing** (STEP 5): service_role key placeholder/invalid, or `reports` bucket missing, or
  wrong `STORAGE_DRIVER` on the running PROD server → upload throws → pdf_url null. Fix: set the real key / create the
  bucket / correct the driver.
- **C — renderToBuffer throws on real-LLM data** (STEP 6) → react-pdf component error on a null/odd section. Fix the
  component's null-handling.
- **D — two Inngest servers** (STEP 0) → event + consumer split across servers → never delivered. Fix: run exactly one.
- **E — Completed but UI not refreshing** (pdf_url IS actually set in STEP 4) → generation worked; the list just
  doesn't auto-poll → the lesser known auto-refresh gap (banked item), not a generation failure.
- State which, with: STEP 0 server count, STEP 1 architecture, STEP 2 registration, STEP 3 run status+error, STEP 4
  row state, STEP 5 storage config. **No source/data/env changed. Which DB (confirm PROD) + which Inngest port the app
  uses.**

## NOTE
Report ROWS exist → trigger + insert succeeded (real progress). The gap is the PDF-render hop. The two most probable
PROD-only causes, in order: (1) the render-report-pdf function isn't in serve() so `report/generated` is never
consumed, or (2) the Supabase `service_role` key is still the placeholder from the handoff's open item / the `reports`
bucket doesn't exist → the upload throws. STEP 2 (registration) + STEP 3 (run trace) + STEP 5 (storage config) together
pinpoint it in one pass. Don't accept "pdf_url null is expected in this env" — the spec is explicit that 'generating'
is transient and the PDF is the deliverable.
