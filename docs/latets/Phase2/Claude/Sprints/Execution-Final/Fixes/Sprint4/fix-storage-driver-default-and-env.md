# Claude Code — DIAGNOSE+FIX: getStorage() throws "requires SUPABASE_*" in local mode (STORAGE_DRIVER not read as 'local')

**Root cause (from the stack trace):** `getStorage()` (lib/storage/index.ts:14) throws *"STORAGE_DRIVER=supabase
requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"* → 500 on GET /reports, 404 on POST generate. The factory only
picks LocalStorageAdapter when `STORAGE_DRIVER === 'local'` EXACTLY; anything else (including unset) falls through to
Supabase, which then throws because the keys aren't set. Sri is testing in LOCAL mode — so `STORAGE_DRIVER` is NOT
reaching the process as the string `'local'`.

## STEP 1 — What is STORAGE_DRIVER actually, at runtime?
```bash
# What's in the env file(s) — exact bytes (watch for quotes / trailing spaces / wrong file):
grep -nE "STORAGE_DRIVER|SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|STORAGE_LOCAL_DIR" .env.local .env .env.test.local .env.development 2>/dev/null | cat -A
# Which env file does the running dev server actually load? (Next loads .env.local by default; but Sri has a
# two-env setup — confirm which file the CURRENT process reads, and whether STORAGE_DRIVER is in THAT file.)
grep -rn "STORAGE_DRIVER\|dotenv\|loadEnv\|.env" next.config.* package.json 2>/dev/null | head
```
Report: the EXACT value of STORAGE_DRIVER in each env file (cat -A shows quotes/spaces/CRLF). Is it literally
`STORAGE_DRIVER=local` with NO quotes and NO trailing space/CR? Is it in the file the running process loads? (Sri's
two-DB setup may load a different env file per environment — confirm the one in use for THIS local run has it.)

## STEP 2 — Read the factory + confirm the exact comparison
```bash
cat lib/storage/index.ts
```
Report: the exact `getStorage()` logic — does it default to Supabase for any non-'local' value (including
undefined)? That's the fragility: an UNSET STORAGE_DRIVER silently means "use Supabase" → throws on missing keys.

## THE FIX (two parts)

### Fix A (config) — ensure STORAGE_DRIVER=local reaches the running process
- Make sure `STORAGE_DRIVER=local` is in the env file the CURRENT (local-mode) dev server loads, with NO quotes, NO
  trailing whitespace/CR. Sri restarts the dev server after (env only loads on restart).
- (Sri's setup: local env file → `STORAGE_DRIVER=local`; production env file → `STORAGE_DRIVER=supabase` +
  SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.)

### Fix B (code robustness) — safer default + clearer failure
Change the factory so an UNSET/unknown STORAGE_DRIVER does NOT silently pick the secret-key backend:
```ts
export function getStorage(): StorageAdapter {
  const driver = (process.env.STORAGE_DRIVER ?? 'local').trim().toLowerCase();
  if (driver === 'supabase') {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("STORAGE_DRIVER=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    }
    return new SupabaseStorageAdapter();
  }
  if (driver === 'local') return new LocalStorageAdapter();
  // unknown value → fail loudly, don't silently default to a secret-key backend
  throw new Error(`Unknown STORAGE_DRIVER "${driver}" (expected 'local' or 'supabase')`);
}
```
Key changes:
- **Default to `'local'`** when unset (safe — no secret keys needed) instead of defaulting to Supabase.
- **`.trim().toLowerCase()`** so trailing spaces / casing don't break the match (defensive against the exact class of
  bug that likely caused this).
- **Unknown value throws a clear error** naming the bad value — not a silent fall-through to Supabase.
This means: local mode works even if STORAGE_DRIVER is momentarily unset; supabase mode still requires its keys;
typos fail loudly.

### Fix C — lazy Supabase client (prevent import-time throw)
Confirm the Supabase client (lib/supabase.ts) is created LAZILY (only inside SupabaseStorageAdapter's methods / when
actually used), NOT at module import. So importing the storage chain in local mode never touches Supabase.
```bash
cat lib/supabase.ts   # createClient must be lazy (inside a function/getter), not at top-level
```
If it's eager, make it lazy (a getter/singleton that inits on first use).

## VERIFY (local mode first)
1. `STORAGE_DRIVER=local` confirmed in the loaded env file (cat -A clean). Restart dev server.
2. **GET /reports → 200** (no more 500), **POST /reports/generate works** (no more 404). The routes that broke are
   fixed.
3. Click "Generate report" (local mode) → report generates → render-report-pdf writes the PDF to
   `./storage/reports/{orgId}/{reportId}.pdf` → pdf_url set → status flips to 'ready' → download via the local route
   opens a real PDF.
4. THEN switch `STORAGE_DRIVER=supabase` (+ SUPABASE_URL + service_role key) in the production env, restart, and test
   the Supabase path (PDF appears in the Supabase `reports` bucket).
5. Core tsc clean; 78 tests green.

## REPORT
- STEP 1: exact STORAGE_DRIVER value in each env file (cat -A) + which file the running process loads + whether it's
  in that file.
- The factory fix (default local, trim/lowercase, unknown throws) + the lazy Supabase client confirmation.
- **On-screen: GET /reports 200, generate works, PDF written locally, status 'ready', download opens** (local mode).
- Confirm: local mode works without any Supabase keys; supabase mode still validated; core tsc clean; 78 green.

## NOTE
The bug: the factory defaulted to Supabase for any non-'local' STORAGE_DRIVER (including unset), so a missing/mis-set
env var made getStorage() throw on the absent keys — breaking the routes even in local mode. The fix: default to the
SAFE backend (local, no secrets), trim/lowercase the value, and fail loudly on unknown values — plus lazy Supabase
client init so local mode never touches Supabase. Then local works standalone, and supabase is opt-in via the env
var with its keys.
