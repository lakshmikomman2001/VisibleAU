# Claude Code — DISCOVER (report-first, NO fixes): what Supabase Storage config does the code expect?

We're wiring the PDF step (render `buildReportPdf` → upload to Supabase Storage → pre-signed URL → set pdf_url).
Before setting up Supabase, find EXACTLY what the existing code + spec expect, so the bucket + env vars are created
correctly the first time (no guessing/redoing). **DISCOVER ONLY — change NO source. Just report findings.**

Context: the app's DB is LOCAL Postgres (NOT Supabase). Supabase will be used ONLY for file storage. `buildReportPdf`
exists in lib/communication/pdf-builder.tsx (renders a react-pdf Buffer) but has zero callers; no upload code exists
yet. §4 line 111-112 says "PDF storage uses the existing Supabase Storage bucket (pre-signed URLs, 7-day expiry);
confirm the bucket/credentials Phase 1 Sprint 9 already configured" — so Sprint 9 MAY have left some Supabase config.

## STEP 1 — What Supabase env vars does the code already reference?
```bash
grep -rnE "SUPABASE_URL|SUPABASE_SERVICE_ROLE|SUPABASE_ANON|SUPABASE_KEY|STORAGE_BUCKET|NEXT_PUBLIC_SUPABASE" . --include=*.ts --include=*.tsx --include=*.js 2>/dev/null | grep -v node_modules | head -30
# What's ALREADY in the env files (from Sprint 9)?
grep -nE "SUPABASE|STORAGE" .env.local .env.test.local .env .env.example 2>/dev/null
```
Report: which Supabase env var NAMES the code reads (exact casing), and which are already set (or empty) in the env
files. (So we create the env vars with the names the code expects.)

## STEP 2 — Is there an existing Supabase client / storage helper (from Sprint 9)?
```bash
grep -rln "createClient\|@supabase/supabase-js\|supabase.storage\|storage.from\|createSignedUrl\|getSignedUrl" . --include=*.ts --include=*.tsx 2>/dev/null | grep -v node_modules | head
# The supabase client init, if any:
find . -path ./node_modules -prune -o -iname "*supabase*" -print 2>/dev/null | head
grep -rn "createClient(" lib/ app/ 2>/dev/null | grep -i supabase | head
# Is @supabase/supabase-js even installed?
grep -n "@supabase/supabase-js" package.json
```
Report: is there an existing Supabase client (Sprint 9)? Where? Is `@supabase/supabase-js` installed? Is there any
existing storage-upload helper we should reuse (Sprint 9 was supposed to configure the bucket — did it leave upload
code)?

## STEP 3 — What BUCKET NAME does the code expect / reference anywhere?
```bash
grep -rnE "storage.from\(['\"]|bucket|BUCKET|reports.*bucket|report.*pdf" . --include=*.ts --include=*.tsx 2>/dev/null | grep -v node_modules | grep -iE "bucket|storage.from|reports|pdf" | head
# The LLD's expected bucket name:
grep -nE "bucket|Storage.*report|report.*Storage|storage.*path" /mnt/user-data/uploads/1782892169295_visibleau-7layer-lld.md 2>/dev/null | grep -iE "bucket|report" | head
```
Report: does any code reference a specific bucket NAME (e.g. 'reports', 'report-pdfs')? Does the LLD name the bucket?
(So we create the bucket with the EXACT name the code will use — critical, or the upload targets a non-existent
bucket.)

## STEP 4 — What does buildReportPdf return + what does the PDF path/naming look like?
```bash
sed -n '1,80p' lib/communication/pdf-builder.tsx
grep -n "export\|renderToBuffer\|Buffer\|return\|buildReportPdf\|path\|filename\|\.pdf" lib/communication/pdf-builder.tsx lib/communication/index.ts
```
Report: buildReportPdf's signature (what args it takes, what it returns — a Buffer?). Is there any storage-path or
filename convention (e.g. `{orgId}/{reportId}.pdf`)? (So the upload step names files sensibly + the pre-signed URL is
scoped per org/report.)

## STEP 5 — The generated_reports pdf_url column + the update path
```bash
grep -n "pdf_url\|pdfUrl\|generated_reports\|generatedReports" lib/db/schema*/*.ts inngest/functions/generate-narrative-report.ts 2>/dev/null | head
```
Report: the pdf_url column type + how the function currently ends (so the new step can UPDATE generated_reports SET
pdf_url = <signed_url> WHERE id = reportId).

## REPORT — the setup spec for Supabase
Summarize what I need to create in Supabase so it matches the code:
- **Env var names** the code expects (exact) + which are already set/empty.
- **Bucket name** the code references (or, if none, recommend one + note we'll use it consistently).
- Whether `@supabase/supabase-js` is installed + whether a Supabase client already exists (Sprint 9) to reuse, or
  we need to add one.
- `buildReportPdf` signature + return type + any path/filename convention.
- The pdf_url update target.
- **Whether Sprint 9 left ANY Supabase storage config/code** (or if this is all net-new).
- No source/data changed — discovery only.

## NOTE
Goal: set up Supabase Storage ONCE, correctly, matching what the code expects (bucket name + env var names), so the
PDF-upload fix wires cleanly. The app DB stays on local Postgres; Supabase is storage-only. After this discovery,
Sri creates the bucket + keys to match, then I write the fix (storage adapter + wire buildReportPdf → upload →
signed URL → pdf_url), designed swappable for the 2-week production deploy.
