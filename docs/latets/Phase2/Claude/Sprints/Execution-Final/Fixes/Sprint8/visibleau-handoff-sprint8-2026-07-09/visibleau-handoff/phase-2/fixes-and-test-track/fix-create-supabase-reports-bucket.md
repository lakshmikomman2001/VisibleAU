# Claude Code — FIX: create the missing Supabase `reports` Storage bucket → unblock report PDF generation

## Root cause (confirmed from the Inngest step trace — not a guess)
```
Error: Supabase Storage upload failed: Bucket not found
    at SupabaseStorageAdapter.upload (lib/storage/supabase-adapter.ts:15:13)
    at async (inngest/functions/render-report-pdf.ts:116:7)   stepId: 'render-and-upload'
```
The whole chain works — `generate-narrative-report` inserts the row + emits `report/generated`, `render-report-pdf`
fires, `renderToBuffer()` succeeds — then the **Supabase upload throws `Bucket not found`** and Inngest retries 3× then
fails permanently (final `400`). Because the upload never sets `pdf_url`, CM-01 leaves the report badge on
**Generating…** forever. **The private `reports` bucket does not exist in the Supabase project.** The adapter code is
correct; the bucket was never created ("file exists ≠ applied", applied to infra). Storage config + service_role key
are otherwise working — the client authenticated far enough to get a specific "Bucket not found", not an auth error.

This is a local **PROD** env: local Postgres, real LLMs, `STORAGE_DRIVER=supabase`, Supabase project
`https://urnauxnijjxvppexknar.supabase.co`, private bucket `reports`, pre-signed 7-day URLs.

---

## STEP 1 — Confirm the EXACT bucket name + which Supabase client the adapter uses (before creating anything)
Do not assume `reports`; read it from the code so the created bucket matches byte-for-byte.
```bash
sed -n '1,60p' lib/storage/supabase-adapter.ts
grep -n "\.from(['\"]\|bucket\|createClient\|SUPABASE_SERVICE_ROLE\|SUPABASE_URL\|SUPABASE_STORAGE_BUCKET\|upload(\|createSignedUrl\|getPublicUrl" lib/storage/supabase-adapter.ts lib/supabase.ts
grep -nE "STORAGE_DRIVER|SUPABASE_URL|SUPABASE_SERVICE_ROLE|SUPABASE_STORAGE_BUCKET" .env.prod
```
Confirm and report:
1. **Bucket name** the adapter uploads to — is it the literal `'reports'`, or read from `SUPABASE_STORAGE_BUCKET`? Use
   whatever the code actually uses as the name to create. If it's an env var, note its value in `.env.prod`.
2. **Which key** the Supabase client uses — it MUST be `SUPABASE_SERVICE_ROLE` (server-side, RLS-bypassing) for
   uploads from an Inngest function, NOT the anon key. Confirm `lib/supabase.ts` (or wherever the storage client is
   built) uses the service role key. **If it uses the anon key → flag it; that's a separate bug to fix in this pass.**
3. **Download pattern** — the LLD (8518) + handoff §4 require `pdf_url` to store the stable **path**, with a fresh
   **pre-signed** URL minted on download (`createSignedUrl`), because the bucket is PRIVATE. Confirm the download route
   uses `createSignedUrl`, NOT `getPublicUrl`. **If it uses getPublicUrl / assumes a public bucket → flag it.** (If the
   code genuinely expects a PUBLIC bucket, tell me before proceeding — the two must agree. Default per canon: PRIVATE +
   signed URL.)

## STEP 2 — Create the bucket idempotently via a COMMITTED script (not a one-off dashboard click)
The bucket must be reproducible on deploy, so create it with a script using the service_role key (buckets are a
storage-admin operation — the service role can create them). Put it where the repo keeps setup scripts (match existing
convention — likely `scripts/`).

Create `scripts/ensure-report-storage-bucket.ts` (adapt names/imports to the repo's actual Supabase client + env
loading; use the SAME bucket name STEP 1 confirmed):
```ts
/**
 * Ensures the private Storage bucket for report PDFs exists.
 * Idempotent: safe to run repeatedly (skips if the bucket already exists).
 * Uses the SERVICE ROLE key (bucket admin). Run against the target env's Supabase project.
 *   pnpm tsx scripts/ensure-report-storage-bucket.ts
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE;               // MUST be the service role key
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'reports';    // MATCH lib/storage/supabase-adapter.ts (STEP 1)

if (!url || !serviceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE must be set (load .env.prod for the prod project).');
}

const admin = createClient(url, serviceKey);

async function main() {
  const { data: buckets, error: listErr } = await admin.storage.listBuckets();
  if (listErr) throw new Error(`listBuckets failed: ${listErr.message}`);

  if (buckets?.some(b => b.name === BUCKET)) {
    console.log(`✓ Bucket "${BUCKET}" already exists — nothing to do.`);
    return;
  }

  const { error: createErr } = await admin.storage.createBucket(BUCKET, {
    public: false,                          // PRIVATE — downloads use pre-signed URLs (LLD 8518)
    // Optional hardening (safe defaults; adjust only if the adapter needs otherwise):
    allowedMimeTypes: ['application/pdf'],
    fileSizeLimit: '25MB',
  });
  if (createErr) throw new Error(`createBucket("${BUCKET}") failed: ${createErr.message}`);

  console.log(`✓ Created private bucket "${BUCKET}".`);
}

main().catch(err => { console.error(err); process.exit(1); });
```
Then run it against the PROD project (load `.env.prod` the way the repo's other prod scripts do — match START-PROD.bat's
env loading; do NOT hardcode keys):
```bash
# however the repo loads .env.prod for scripts — e.g.:
pnpm tsx -r dotenv/config scripts/ensure-report-storage-bucket.ts dotenv_config_path=.env.prod
# expect: ✓ Created private bucket "reports".   (or "already exists" on re-run)
```
Report the script output. If it printed a permission error instead, report it verbatim (service_role should be allowed
to create buckets — an error here means the key isn't actually the service role).

## STEP 3 — Re-run the two stuck reports (do NOT insert new placeholder rows)
The two existing rows are permanently failed (retries exhausted). Re-drive PDF generation for them by re-emitting
`report/generated` for each (the `render-report-pdf` consumer will now find the bucket). Use the repo's real
event/name + payload shape (`{ organizationId, brandId, reportId }` per WH-01a / LLD 8478):
```bash
# Get the two stuck report IDs:
psql "$DATABASE_URL" -c "SELECT id, organization_id, brand_id, pdf_url, created_at FROM generated_reports WHERE brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8' AND pdf_url IS NULL ORDER BY created_at DESC;"
```
Then re-emit `report/generated` for each stuck reportId. Prefer a tiny committed script
`scripts/reemit-report-generated.ts` that calls `inngest.send({ name: 'report/generated', data: { organizationId,
brandId, reportId } })` for a given reportId (reuse the app's inngest client), OR simply click **Generate report** once
more in the UI to confirm a NET-NEW report now completes end-to-end. Either is acceptable — the point is to prove the
bucket fix closes the loop. (If you re-click, note the older stuck rows can be left as-is or cleaned up; they're
append-only artifacts.)

## STEP 4 — VERIFY the loop is closed (the actual acceptance)
```bash
# 1. Inngest: render-report-pdf now COMPLETES (no 'Bucket not found'); no more 400s.
#    Check the app/inngest terminal for a clean render-report-pdf run + the terminal shows NO Supabase upload error.

# 2. DB: pdf_url now populated on the re-run report(s):
psql "$DATABASE_URL" -c "SELECT id, period_label, pdf_url IS NOT NULL AS has_pdf, pdf_url, updated_at FROM generated_reports WHERE brand_id='0f531803-b529-4d09-9fd6-b6272b5baba8' ORDER BY created_at DESC LIMIT 4;"
#    Expect has_pdf = t; pdf_url = the stable PATH (e.g. reports/<orgId>/<reportId>.pdf), NOT an https URL.

# 3. Supabase: the object exists in the bucket:
#    (via the same admin client / listBuckets+list, or the Supabase dashboard → Storage → reports → <orgId>/)
```
Then in the browser, reload `/brands/0f531803-b529-4d09-9fd6-b6272b5baba8/reports`:
- The re-run report's status flips **Generating… → Ready** (CM-01: pdf_url now set, email_sent_at still null).
- The **Download** action is enabled; clicking it returns the PDF via a freshly-minted **pre-signed** URL (confirm the
  download route mints `createSignedUrl` on demand — STEP 1.3 — and the URL opens the PDF).

Report: (a) render-report-pdf run is clean, (b) pdf_url populated (path form), (c) object present in the bucket,
(d) UI shows Ready + Download works via a signed URL.

---

## Constraints
- **Do NOT** commit any key. The script reads `SUPABASE_SERVICE_ROLE` / `SUPABASE_URL` from `.env.prod` (gitignored) —
  never inline the value. `.env.prod` stays out of git (Sri commits daily).
- **Do NOT** change `SupabaseStorageAdapter.upload`'s throw-on-error behaviour — surfacing the error is correct; it's
  what gave us the clean diagnosis. The adapter needs no code change for this fix (unless STEP 1.2/1.3 found the
  anon-key or getPublicUrl bugs — fix those if present, and report separately).
- Bucket name MUST match `lib/storage/supabase-adapter.ts` exactly (STEP 1) — a mismatched name reproduces the same
  "Bucket not found".
- **Deploy note (report, don't act):** this bucket must also be created in the real production Supabase project at
  deploy time. Wiring `scripts/ensure-report-storage-bucket.ts` into the prod bootstrap (or START-PROD.bat, next to the
  subscription seed) makes the fix reproducible — recommend it, but confirm placement with Sri.

## Verification greps (report results)
```bash
grep -c "createBucket" scripts/ensure-report-storage-bucket.ts                 # → 1
grep -c "public: false" scripts/ensure-report-storage-bucket.ts                # → 1  (private bucket)
grep -Rn "getPublicUrl" app/api/brands/ lib/storage/ lib/communication/        # → expect 0 (must be createSignedUrl)
grep -Rn "createSignedUrl" app/api/brands/ lib/storage/                        # → ≥1 (download mints signed URL)
grep -n "SUPABASE_SERVICE_ROLE" scripts/ensure-report-storage-bucket.ts        # → ≥1 (service role, not anon)
```
