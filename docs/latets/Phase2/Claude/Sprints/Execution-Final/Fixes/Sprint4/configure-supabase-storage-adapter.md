# Claude Code — IMPLEMENT: pluggable storage adapter (local + Supabase) + wire the PDF step

Implement PDF storage with TWO swappable backends — **local filesystem** and **Supabase Storage** — selected by an
explicit env var (NOT inferred from the database). Then wire the missing PDF step so report generation renders →
uploads → sets pdf_url → status flips 'generating'→'ready'.

## ⚠️ KEY CORRECTIONS (read first)
- **Use the `service_role` (SECRET) key, NOT the Publishable/anon key.** Uploading to a PRIVATE bucket from the
  server requires the service_role key (bypasses RLS). The Publishable key will FAIL on private-bucket writes. Env
  var: `SUPABASE_SERVICE_ROLE_KEY`. (Sri: get the SECRET key from Project Settings → API, not Publishable.)
- **The Direct Connection string is NOT needed** — that's for Supabase Postgres, which we're NOT using (app DB is
  local Postgres). Storage only needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
- **Storage backend is chosen by `STORAGE_DRIVER`, NOT by which DB is active.** This lets Sri run local-DB +
  Supabase-storage to TEST the real storage path before production. Do NOT tie storage selection to the database.

## Context
- App DB = local Postgres. Supabase = storage ONLY.
- `@supabase/supabase-js` v2.106.2 already installed. NO existing Supabase client (net-new).
- `buildReportPdf(params): Promise<Buffer>` exists (lib/communication/pdf-builder.tsx) — params: `{organizationId,
  headline, narrativeText, sections, tone, brandId?}`. Currently has ZERO callers.
- `generate-narrative-report.ts` inserts the report + narrative, emits `report/generated` — but NOTHING listens on
  that event, and there's no PDF/upload/set-pdf_url step. pdf_url column: `generated_reports.pdf_url` (nullable text).
- Bucket (per golive-checklist): **`reports`** (PRIVATE, pre-signed URLs, 7-day expiry).
- LLD 8369: row inserted first, pdf_url populated after (async). Derived status: pdf_url NULL → 'generating';
  pdf_url set → 'ready'.

## PART 1 — Env vars
Add to `.env.local` (Sri will fill values):
```
STORAGE_DRIVER=supabase          # 'local' or 'supabase' — controls which backend; independent of the DB
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role SECRET key>   # NOT the publishable/anon key
STORAGE_LOCAL_DIR=./storage/reports   # used only when STORAGE_DRIVER=local
```
Add the same keys (names only, no values) to `.env.example` so the contract is documented. **Confirm `.env.local` is
gitignored** (Sri commits to GitHub daily — the service_role key must NEVER be committed).

## PART 2 — The storage adapter (swappable, production-ready)
Create `lib/storage/` with a thin interface + two implementations:

`lib/storage/types.ts`:
```ts
export interface StorageAdapter {
  // upload a buffer to a logical path (e.g. "reports/{orgId}/{reportId}.pdf")
  upload(path: string, buffer: Buffer, contentType: string): Promise<void>;
  // return a URL the browser can download from; for private/remote, a fresh signed URL
  getDownloadUrl(path: string, expirySeconds?: number): Promise<string>;
}
```

`lib/storage/local-adapter.ts` — **LocalStorageAdapter**:
- `upload`: write the buffer to `${STORAGE_LOCAL_DIR}/${path}` (mkdir -p the dirs).
- `getDownloadUrl`: return a URL served by a local route (see PART 4) e.g. `/api/reports/file/${path}` — local files
  don't expire; ignore expirySeconds.

`lib/storage/supabase-adapter.ts` — **SupabaseStorageAdapter**:
- Lazily create the Supabase client from `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (server-only). Put the client
  init in `lib/supabase.ts` (or inline in the adapter) — service_role, `auth: { persistSession: false }`.
- `upload`: `supabase.storage.from('reports').upload(path, buffer, { contentType, upsert: true })`.
- `getDownloadUrl`: `supabase.storage.from('reports').createSignedUrl(path, expirySeconds ?? 604800)` (7 days =
  604800s per §4). Return the signed URL. (Private bucket → signed URLs.)

`lib/storage/index.ts` — **the factory**:
```ts
export function getStorage(): StorageAdapter {
  return process.env.STORAGE_DRIVER === 'local'
    ? new LocalStorageAdapter()
    : new SupabaseStorageAdapter();   // default to supabase
}
```
(Fail clearly if STORAGE_DRIVER=supabase but SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing — throw a helpful
error, don't silently no-op.)

## PART 3 — ⚠️ IMPORTANT: store the PATH, sign on download (don't store an expiring URL)
Signed URLs EXPIRE (7 days). If we store the signed URL in `pdf_url`, downloads BREAK after 7 days. So:
- **Store the stable storage PATH in a column** (either put the path in `pdf_url`, OR add a `pdf_path` column and
  keep `pdf_url` for a freshly-signed URL). Simplest: store the **path** in `pdf_url` (e.g.
  `reports/{orgId}/{reportId}.pdf`), and generate a fresh signed URL **at download time** via
  `getDownloadUrl(path)`.
- The derived status only checks pdf_url IS NULL vs NOT NULL — storing the path (non-null) correctly flips it to
  'ready'. 
- The report DETAIL / download action calls `getStorage().getDownloadUrl(pathFromPdfUrl)` to get a fresh link each
  time — never a stale/expired one.
- (If the codebase strongly expects pdf_url to BE a URL, add a `pdf_path` column for the stable path and set pdf_url
  to a freshly-signed URL on write + re-sign on read. But the path-in-pdf_url + sign-on-download approach is
  cleaner — prefer it unless it breaks an existing consumer. Report which you chose.)

## PART 4 — Wire the PDF step (new Inngest function listening on report/generated)
`generate-narrative-report` already emits `report/generated` into the void — use that as the hook (keeps generation
fast; separates concerns). Create a NEW Inngest function `render-report-pdf` (or similar):
- **Trigger:** `report/generated` (the event the generator already emits — confirm its data shape: it should carry
  reportId / organizationId / brandId; if not, add them to the emit).
- **Steps:**
  1. Load the report row (narrative_text, headline, sections, tone, organizationId, brandId) from generated_reports
     by reportId.
  2. `const buffer = await buildReportPdf({ organizationId, headline, narrativeText, sections, tone, brandId })`.
  3. `const path = ` + "`reports/${organizationId}/${reportId}.pdf`" + `;`
  4. `await getStorage().upload(path, buffer, 'application/pdf')`.
  5. `await db.update(generatedReports).set({ pdfUrl: path }).where(eq(generatedReports.id, reportId))` (store the
     PATH per PART 3; use withRlsContext if the codebase pattern requires it — but this runs server-side/service).
  6. (optional) bump updated_at.
- Register the new function in the serve() array (app/api/webhooks/inngest/route.ts) — confirm it's added (serve
  count +1).
- **Surface errors** — do NOT swallow render/upload failures in a silent try/catch. If the upload throws, let the
  Inngest step FAIL (so it's visible in the dashboard + retries), rather than completing green with pdf_url still
  null (the exact silent-failure trap we've hit).

For the **local download route** (PART 2 LocalStorageAdapter): add `app/api/reports/file/[...path]/route.ts` that
streams the local file from `STORAGE_LOCAL_DIR` (only when STORAGE_DRIVER=local). Guard it (auth + scope to the
org's reports) so it's not an open file server.

## PART 5 — The report list/detail download action uses getDownloadUrl
Wherever the UI links to the PDF (reports list "download" / report detail), it must call
`getStorage().getDownloadUrl(pdfUrlPath)` to produce a fresh link (signed for Supabase, local route for local) —
NOT link directly to a stored (expiring) URL. Confirm the download action resolves the URL at click/render time.

## INVARIANTS
- `STORAGE_DRIVER` selects the backend; storage is INDEPENDENT of the database (Sri can run local-DB +
  supabase-storage). Default to supabase if unset.
- Use `SUPABASE_SERVICE_ROLE_KEY` (secret) for uploads — never the publishable/anon key. Server-side only.
- `.env.local` gitignored; service_role key never committed; `.env.example` has names only.
- Bucket `reports`, private, 7-day (604800s) signed URLs. Path `reports/{orgId}/{reportId}.pdf`.
- Store the stable PATH (not an expiring URL); sign on download. Derived status flips on pdf_url non-null.
- Surface render/upload errors (fail the step) — no silent swallow.
- Keep generation fast (PDF in the separate report/generated listener, not inline). selectModel/tier logic unchanged.
- TS strict, no any; full `tsc --noEmit` clean (core); don't reintroduce the fixed errors; 78 tests green.

## VERIFY (on screen, with STORAGE_DRIVER=supabase)
1. `STORAGE_DRIVER=supabase` in .env.local (+ SUPABASE_URL + service_role key). Restart dev.
2. Click "Generate report" → report row created ('generating') → the `render-report-pdf` function fires on
   report/generated (check Inngest :8288 — it COMPLETES, not skipped/failed) → uploads to the `reports` bucket →
   sets pdf_url (the path) → **status flips to 'ready'** on refresh.
3. In the Supabase dashboard → Storage → `reports` bucket → the file `reports/{orgId}/{reportId}.pdf` EXISTS.
4. **Download/open the PDF** from the UI → it's a real PDF with the narrative + sections + Sprint 3 data + (if set)
   white-label theme. The download uses a freshly-signed URL.
5. **Test the switch:** set `STORAGE_DRIVER=local`, restart, generate → PDF written to `./storage/reports/...`,
   pdf_url set, status 'ready', download via the local route works. (Both modes functional.)
6. Full core `tsc --noEmit` clean; 78 tests green; Inngest serve count +1 (new function registered).

## REPORT
- The adapter files created + the factory (STORAGE_DRIVER switch).
- lib/supabase.ts / the Supabase client (service_role, no session persist).
- The new render-report-pdf Inngest function (trigger report/generated, the steps, error-surfacing) + serve
  registration.
- PART 3 decision: path-in-pdf_url + sign-on-download (or pdf_path column) — which, and why.
- The download action resolving a fresh URL.
- **On-screen: report generates → PDF uploads to Supabase `reports` bucket → status 'ready' → PDF downloads and
  opens** (with STORAGE_DRIVER=supabase). AND the local mode works (STORAGE_DRIVER=local).
- Confirm: service_role key (not publishable); .env.local gitignored; path stored not expiring URL; errors surfaced;
  core tsc clean; 78 green; serve +1.

## NOTE — production-readiness (Sri's 2-week deploy)
This adapter design means the production deploy needs only `STORAGE_DRIVER=supabase` + the Supabase env vars set on
the host — the code is identical local vs prod. When Sri picks hosting, storage already works (external object
storage works on Vercel/containers/VPS alike). The local driver stays available for offline dev. Store-path +
sign-on-download avoids the 7-day-expiry download-break. This is the production-correct pattern, tested locally now.
