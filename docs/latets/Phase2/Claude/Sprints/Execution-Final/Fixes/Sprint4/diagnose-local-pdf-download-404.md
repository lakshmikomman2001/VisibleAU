# Claude Code — DIAGNOSE+FIX: local PDF download 404 "Not available" (path mismatch write vs read)

Report generated + status "Ready" (pdf_url set) — but **downloading the PDF fails**:
`GET /api/reports/file/{orgId}/{reportId}.pdf → 404 {"error":"Not available"}`. The local download route runs but
can't find the file. Everything upstream WORKS (generate → narrative → render-report-pdf fired → status Ready). This
is the LAST link: the local file route can't locate/serve the written PDF. Likely a **path mismatch** between where
the LocalStorageAdapter WRITES and where the download route READS.

## STEP 1 — Is the PDF actually on disk, and WHERE?
```bash
# Find any PDFs that were written:
find . -path ./node_modules -prune -o -name "*.pdf" -print 2>/dev/null | grep -v node_modules
ls -laR ./storage 2>/dev/null || echo "no ./storage dir"
# The specific file the download expected:
ls -la ./storage/reports/3b2c8e19-70e6-4b67-8faa-127a8278919b/ 2>/dev/null
# What is STORAGE_LOCAL_DIR set to?
grep -nE "STORAGE_LOCAL_DIR|STORAGE_DRIVER" .env.local | cat -A
```
Report: was ANY PDF written to disk? WHERE (exact path)? Does the file exist at
`{STORAGE_LOCAL_DIR}/{orgId}/{reportId}.pdf`? Is STORAGE_LOCAL_DIR the same value the ADAPTER and the ROUTE both use?

## STEP 2 — Compare WRITE path (adapter) vs READ path (route)
```bash
cat lib/storage/local-adapter.ts        # where does upload() WRITE? (base dir + path join)
cat "app/api/reports/file/[...path]/route.ts"   # where does the route READ from? (base dir + how it reassembles [...path])
```
Report the exact path each computes:
- **Adapter upload:** `${STORAGE_LOCAL_DIR}/${path}` — what's the resolved absolute path? Does it `mkdir -p` the dirs?
  Does `path` include a "reports/" prefix or not? (The upload was called with path `reports/{orgId}/{reportId}.pdf`
  OR `{orgId}/{reportId}.pdf` — which?)
- **Download route:** how does it build the file path from the `[...path]` URL segments + STORAGE_LOCAL_DIR? Does it
  ADD a "reports/" prefix that the URL doesn't have (or vice versa)? Does it use the same base dir?
**The prime suspect: a "reports/" prefix mismatch** — e.g. the adapter writes to
`./storage/reports/reports/{orgId}/...` (double "reports") or the route looks in `./storage/{orgId}/...` (missing
the "reports/" segment). OR a relative-path / cwd mismatch. Report the exact discrepancy.

## STEP 3 — The pdf_url stored vs the download URL built
```bash
# What path is stored in pdf_url for this report?
psql "$DATABASE_URL_DEV_OR_WHICHEVER_LOCAL" -c "SELECT id, pdf_url FROM generated_reports ORDER BY created_at DESC LIMIT 2;" 2>/dev/null || echo "use the local dev DB connection string"
```
Report: the stored pdf_url value. Does the download route's URL (`/api/reports/file/{pdf_url}`) correctly map back
to the on-disk file? Is there a prefix added/dropped between: stored path → download URL → file lookup?

## THE FIX (once the mismatch is identified)
Make the WRITE path and the READ path use the **same base dir + same path structure**. Specifically:
- Decide ONE convention for the stored path (recommend: store `{orgId}/{reportId}.pdf` WITHOUT a "reports/" prefix,
  since STORAGE_LOCAL_DIR already = `./storage/reports`; OR store with the prefix and read with it — but be
  CONSISTENT).
- The LocalStorageAdapter.upload writes to `path.join(STORAGE_LOCAL_DIR, storedPath)` and mkdir -p's it.
- The download route reads from `path.join(STORAGE_LOCAL_DIR, ...segments)` using the SAME base + the reassembled
  `[...path]` — no added/dropped prefix.
- Use `path.join` / `path.resolve` (absolute) so cwd differences don't break it.
- Keep the route's auth/org-scoping guard.
Report the exact fix (which side had the wrong prefix/base) and align them.

## VERIFY (local mode)
1. Generate a report → the PDF is written to disk (confirm the exact file exists via `ls`).
2. Click "Download PDF" → the file DOWNLOADS and OPENS as a real PDF (no 404, no "Not available"). Status Ready.
3. **Open the PDF** — real document: narrative + sections + Sprint 3 data + formatting.
4. Confirm the stored pdf_url path → download URL → on-disk file all align.

## REPORT
- STEP 1: was a PDF written? exact path on disk? STORAGE_LOCAL_DIR value.
- STEP 2: the WRITE path (adapter) vs READ path (route) — the exact discrepancy (prefix / base dir / cwd).
- STEP 3: the stored pdf_url + how it maps to the file.
- The fix (align write + read paths) applied.
- **On-screen: Download PDF now works — the file downloads and opens as a real PDF.**
- Confirm: paths aligned; route guard intact; which DB.

## NOTE
Big picture: the generation pipeline WORKS (report Ready, pdf_url set, render-report-pdf fired). This 404 is ONLY
the file-serving last step — a path mismatch between where the LocalStorageAdapter writes the PDF and where the
download route looks for it (most likely a "reports/" prefix or base-dir/cwd difference). Find where the file
actually landed (STEP 1) vs where the route looks (STEP 2), align them. Then local download works, and we move to the
Supabase test (where the same stored-path → signed-URL mapping applies, but Supabase serves the file so this
particular local-path issue won't recur).
