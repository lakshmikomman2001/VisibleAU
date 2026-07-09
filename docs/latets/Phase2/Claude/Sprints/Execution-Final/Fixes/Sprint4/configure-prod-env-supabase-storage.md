# Claude Code — CONFIGURE: local-prod environment to use Supabase Storage for report PDFs

The storage env vars are missing from ALL env files, so every environment (including local-prod) defaults to `local`
filesystem storage. Per the design, the **prod/real environment should use Supabase Storage** (Supabase is a real
integration, alongside real LLM/Stripe/ABN), while dev/mock uses local. Configure `.env.prod` for Supabase; keep
dev/local on local storage.

## ⚠️ SAFETY FIRST — gitignore check (Sri commits to GitHub daily)
The `service_role` key is a full-admin SECRET that bypasses RLS. Before adding it:
```bash
# Confirm ALL env files are gitignored — NONE should appear as tracked/committable:
git check-ignore .env.prod .env.local .env.dev 2>/dev/null   # each should print (= ignored)
git status --porcelain | grep -E "\.env" || echo "no .env files staged (good)"
cat .gitignore | grep -E "\.env"
```
Report: are `.env.prod`, `.env.local`, `.env.dev` ALL gitignored? If ANY is NOT ignored → STOP, add it to
`.gitignore` FIRST (do not add the secret key until the file is confirmed ignored). The service_role key must NEVER
be committed.

## STEP 1 — Confirm the current state + which env file local-prod loads
```bash
# What env file does the PROD/real environment actually load? (Sri's two-env setup — via start script or NODE_ENV)
grep -rnE "\.env\.prod|\.env\.dev|dotenv|NODE_ENV|loadEnv|--env" package.json next.config.* START-*.bat scripts/ 2>/dev/null | head
# Current storage-related vars in each env file:
for f in .env.prod .env.dev .env.local; do echo "== $f =="; grep -nE "STORAGE_DRIVER|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|STORAGE_LOCAL_DIR|DATABASE_URL|LLM_MODE" "$f" 2>/dev/null; done
```
Report: which env file is loaded when Sri runs in PROD/real mode? (So we add the Supabase vars to the RIGHT file —
the one prod actually loads. If prod loads `.env.prod`, add there; confirm it's not actually `.env.local` with a
prod DATABASE_URL, etc.)

## STEP 2 — Add Supabase storage config to the PROD env file
Add to `.env.prod` (the file the prod/real environment loads — confirm from STEP 1):
```
STORAGE_DRIVER=supabase
SUPABASE_URL=https://urnauxnijjxvppexknar.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<Sri's service_role SECRET key — the one from Project Settings → API, NOT publishable>
```
And ensure the DEV/mock env file explicitly has (so it stays on local — not relying on the default):
```
STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=./storage/reports
```
(Setting it explicitly in BOTH files is clearer than relying on the unset→local default — avoids the ambiguity that
caused the earlier 500.)
Add the var NAMES (no values) to `.env.example` if not already there.

> Sri must paste the actual `service_role` key — do NOT invent it. If Sri hasn't provided it, add the other two vars
> + a placeholder and tell Sri to fill SUPABASE_SERVICE_ROLE_KEY.

## STEP 3 — Verify the config loads + the bucket is reachable (prod mode)
```bash
# After adding + restarting the prod-mode dev server:
# Confirm the vars are visible to the process (add a temporary log or check via a quick node eval — do NOT log the key value):
node -e "console.log('STORAGE_DRIVER=', process.env.STORAGE_DRIVER, '| SUPABASE_URL set:', !!process.env.SUPABASE_URL, '| KEY set:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)" 2>/dev/null || echo "check via the app's env loading"
```
Report: does the prod-mode process see STORAGE_DRIVER=supabase + both Supabase vars set (booleans only — never print
the key)? Confirm the `reports` bucket exists in the Supabase project (private).

## INVARIANTS
- The `service_role` key goes ONLY in `.env.prod` (gitignored). Never in code/`.env.example`/a commit.
- PROD env → STORAGE_DRIVER=supabase; DEV/mock env → STORAGE_DRIVER=local (set explicitly in both).
- Add to the env file the prod environment ACTUALLY loads (confirm from STEP 1 — don't assume).
- Don't change the storage adapter code (it's built + working in local mode) — this is config only.
- Do NOT print the service_role key value anywhere (logs/output).

## VERIFY (prod mode — but note the tier-gate caveat below)
1. `.env.prod` has STORAGE_DRIVER=supabase + SUPABASE_URL + service_role key; all env files gitignored.
2. Restart the prod-mode dev server (env only loads on restart). Confirm the process sees STORAGE_DRIVER=supabase.
3. Generate a report in prod mode → the PDF should upload to the Supabase `reports` bucket (check the Supabase
   dashboard → Storage → reports → the file `{orgId}/{reportId}.pdf` appears) → status 'ready' → download via signed
   URL opens the PDF.
   ⚠️ **CAVEAT:** Sri is currently BLOCKED by a tier-gate ("Growth plan required" on the Reports page for an Agency
   user) — report generation may be inaccessible until that's resolved SEPARATELY. If the Reports page is locked,
   this Supabase test can't run yet. Storage config and the tier gate are INDEPENDENT issues.
4. Then test DEV mode (STORAGE_DRIVER=local) still works (PDF → ./storage/reports).

## REPORT
- Gitignore check: all .env files ignored? (safety gate)
- Which env file prod loads; the vars added (names only — NOT the key value).
- Prod-mode process sees STORAGE_DRIVER=supabase + both vars set.
- If reachable: PDF uploads to the Supabase `reports` bucket + downloads. If blocked by the tier gate: note it
  (storage config is done; report generation is blocked by the separate tier issue).
- Confirm: key only in .env.prod (gitignored); both modes set explicitly; config-only (no code change); key never
  printed.

## NOTE — two independent things
1. **Storage config (this prompt):** makes prod use Supabase for report PDFs. Config-only; the adapter code already
   works.
2. **Tier gate (SEPARATE):** the Reports page shows "Growth plan required" for an Agency user — a tier-source issue
   (likely organizations.tier vs subscriptions.tier) blocking report generation. This prompt does NOT fix that; it's
   diagnosed separately. Both must be resolved to test end-to-end report generation in prod mode: storage config
   (here) + tier access (separate). Configuring Supabase alone won't let Sri generate a report while the page is
   locked.
