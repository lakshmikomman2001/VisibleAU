# Claude Code — REFACTOR: LocalStorageAdapter reads BASE_DIR at module-load → read at call time (fixes 2I seam + real fragility)

## Why (this is a real code fix, not just a test fix)
`LocalStorageAdapter` reads `BASE_DIR` from `process.env.STORAGE_LOCAL_DIR` in a TOP-LEVEL const (module-eval time). Two
problems, one real, one test:
- **Real fragility:** any context where the env isn't set before first import gets the STALE default `./storage/reports`
  — the same "config captured at import → silently wrong elsewhere" class as this session's Supabase-driver-default bug
  and the download-route `getStorage()`-at-module-top bug. Config read at load time is a latent footgun.
- **Test blocker:** vitest evaluates modules before lifecycle hooks, so tests can't set `STORAGE_LOCAL_DIR` before the
  const captures it; a dynamic import returns the cached module. This is why 2I's upload test had to bypass the adapter
  with raw fs.writeFile — leaving bug 1's ADAPTER PATH-JOINING seam uncovered.

Fix: read the base dir at CALL time inside each method (or via a getter), not once at module load. Then the adapter is
configurable per-context AND per-test, and 2I's upload test can hit the REAL adapter.

Env: Windows repo `C:\startup\VisibleAU\src\`. Files: `lib/storage/local-adapter.ts` (+ `types.ts`, `index.ts` factory
for the interface). Dev DB `visibleau`, never prod.

## STEP 1 — Read the current adapter + interface
```bash
cat lib/storage/local-adapter.ts
sed -n '1,40p' lib/storage/types.ts        # the StorageAdapter interface both adapters satisfy
grep -n "STORAGE_LOCAL_DIR\|BASE_DIR\|baseDir\|process.env\|const .*=.*env" lib/storage/local-adapter.ts lib/storage/supabase-adapter.ts lib/storage/index.ts
```
Report: where BASE_DIR is captured (the top-level const), and the interface methods the adapter must satisfy (upload,
getDownloadUrl, exists, etc.). Confirm the SupabaseAdapter does NOT have the same module-load-env issue (if it does,
note it — same fix applies).

## STEP 2 — Refactor: read the base dir at CALL time (not module load)
Replace the top-level const with a per-call read. Prefer a private getter so path logic stays DRY:
```ts
// BEFORE (module-eval capture — the bug):
const BASE_DIR = process.env.STORAGE_LOCAL_DIR ?? './storage/reports';
export class LocalStorageAdapter implements StorageAdapter {
  async upload(path: string, buf: Buffer, contentType: string) {
    const full = join(BASE_DIR, path); /* ... */
  }
}

// AFTER (read at call time — configurable per-context AND per-test):
export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly baseDir?: string) {}          // optional override for tests/DI
  private get base(): string {
    return this.baseDir ?? process.env.STORAGE_LOCAL_DIR ?? './storage/reports';
  }
  async upload(path: string, buf: Buffer, contentType: string) {
    const full = join(this.base, path);                      // reads env NOW, not at import
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, buf);
    return path;                                             // or whatever the interface returns (a path/url)
  }
  async getDownloadUrl(path: string) { /* uses this.base */ }
  // ...other methods use this.base
}
```
- Constructor takes an OPTIONAL `baseDir` — lets tests inject a temp dir directly (cleanest), while prod/dev still use
  the env. Both paths read the same `this.base` getter.
- BEHAVIOR-PRESERVING for the app: with no constructor arg + env set, it resolves identically to before. Only the
  TIMING of the env read changes (call-time vs load-time).
- Apply the same fix to any OTHER method that used the module-level BASE_DIR.
- If SupabaseAdapter has an analogous top-level env capture, fix it the same way (call-time read).
- Confirm the `index.ts` factory still constructs `new LocalStorageAdapter()` (no arg) for the app — unchanged.

## STEP 3 — Now REWRITE 2I's upload test to hit the REAL adapter (close bug 1's seam)
The whole point: exercise `adapter.upload()` path-joining, not raw fs.
```ts
import { tmpdir } from 'node:os';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

it('LocalStorageAdapter.upload writes to the correct joined path (bug 1: adapter path handling)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vau-storage-'));
  const adapter = new LocalStorageAdapter(dir);                 // inject temp dir — now possible
  const buf = Buffer.from('%PDF-1.4 test');
  const returned = await adapter.upload('org123/brand456/report.pdf', buf, 'application/pdf');
  // the REAL seam: assert the adapter joined baseDir + path correctly and wrote the bytes
  const written = await readFile(join(dir, 'org123/brand456/report.pdf'));
  expect(written.equals(buf)).toBe(true);
  expect(returned).toMatch(/org123\/brand456\/report\.pdf/);
});
it('upload creates nested dirs that did not exist (bug 1: mkdir recursive)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vau-storage-'));
  const adapter = new LocalStorageAdapter(dir);
  await adapter.upload('newOrg/newBrand/r.pdf', Buffer.from('x'), 'application/pdf');
  expect((await stat(join(dir, 'newOrg/newBrand/r.pdf'))).isFile()).toBe(true);
});
```
- Uses a real temp dir via the new constructor param — the adapter's OWN upload/path-join/mkdir runs. This is the seam
  bug 1 lived in (missing bucket = wrong/absent path handling).
- Keep the getDownloadUrl test (already real). Remove the raw-fs.writeFile stand-in (it tested disk, not the adapter) —
  or keep it as a sanity check but the ADAPTER test is now the bug-1 coverage.
- Delete the `it.todo` for the adapter seam — it's covered now.

## STEP 4 — Verify: refactor is behavior-preserving + the new test catches bug 1
```bash
<repo test cmd> run lib/storage tests/**/report-pipeline.integration.test.ts
```
- The refactor changed NO app behavior: with env set / factory default, paths resolve as before. Confirm the storage
  routes + report pipeline still work (getStorage() → LocalStorageAdapter with env default).
- **Bug-1 re-introduce proof:** break the adapter's path join (e.g. use `path` instead of `join(this.base, path)`, or
  drop the mkdir) → the new upload test FAILS (wrong path / ENOENT). Revert. This proves the test now covers the
  adapter seam a raw-fs test couldn't.
- Run the FULL unfiltered suite (not just tests/phase2/) → confirm 120 files still pass, and the count is unchanged
  (~1822). Report the full total, not a scoped run.

## STEP 5 — (while here) note the parallel-fork DB deadlock
The earlier full-suite run had 1 failure: a Postgres deadlock from concurrent TRUNCATE CASCADE (fan-out-resilience vs
report-pipeline racing the same tables in parallel forks). NOT part of this refactor — but report whether it still
occurs on the full run. If it does, the fix is test-isolation (run those DB-touching integration files serially, or
per-file schema/transaction) — flag it as a banked item, don't fix it in this refactor unless trivial.

## Report back
1. The refactor: BASE_DIR now read at call time (getter + optional constructor param); SupabaseAdapter checked for the
   same issue.
2. 2I upload test now hits the REAL adapter (temp-dir injected); the it.todo removed.
3. Behavior-preserving confirmed: full unfiltered suite still 120 files / ~1822, 0 code failures.
4. Bug-1 re-introduce proof: breaking the adapter path join fails the new upload test.
5. The parallel-fork deadlock: still present on full run? (banked, not fixed here.)

## Constraints
- Behavior-preserving for the app — only the env-read TIMING changes (call-time not load-time); factory + default path
  identical.
- Read at call time via a getter; optional constructor baseDir for tests/DI. No breaking the StorageAdapter interface.
- Run the FULL suite unfiltered to confirm 120/1822 — do NOT report a scoped tests/phase2/ run as the total again.
- Dev DB visibleau, never prod.
- The LLD/handoff storage contract stands: STORAGE_DRIVER=local → ./storage/reports/{orgId}/{reportId}.pdf; factory
  defaults to local.

## NOTE
This fixes real code, not just a test: reading env at module-load is the same footgun as the Supabase-driver default
and the getStorage()-at-module-top download-route bug — config captured at import is silently wrong wherever env isn't
set first. Reading at call time (getter + optional constructor arg) fixes the fragility AND unblocks 2I to test the real
adapter.upload() path-joining seam — the actual location of bug 1. The bug-1 re-introduce proof (break the path join →
upload test fails) is what confirms the seam is finally covered. And run the FULL suite — 120/1822 — not a scoped subset.
