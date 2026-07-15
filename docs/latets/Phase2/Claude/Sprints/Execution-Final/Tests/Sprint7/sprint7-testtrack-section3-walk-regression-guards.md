# Claude Code — S7 §11 test track — SECTION 3 of 5: Walk regression guards (the 7 findings the walk + real audit caught)

Section-by-section: SECTIONS 1 (Backend Unit, 20) + 2 (Backend Integration, ~62) DONE. This is SECTION 3 — regression
guards for the 7 findings the MANUAL WALK + REAL AUDIT caught that the build's 44 tests missed. IMPORTANT: findings 5
(null org_id), 6 (dot-vs-slash), 7 (CPR-01/s3-benchmark) are ALREADY GUARDED in Section 2 (dual-emit orgId,
comparison-prompts audit.complete, s3-benchmark strengthened) — do NOT duplicate them. Section 3 = the UI/config/seed
guards NOT in Sections 1-2. Several were added during the fixes — INVENTORY, verify each fires on re-break, fill gaps.
Do NOT jump to Sections 4-5.

Env: Windows repo `C:\startup\VisibleAU\src\`. Dev DB `visibleau`. LLM_MODE=mock. Never prod. tests/phase2/sprint7/ +
scripts/qa/sprint7-invariants.sh.

## SECTION 3 — the guards (each maps to a walk finding NOT covered by Sections 1-2):

### Guard 1 — Discovery tile NAV-ORPHAN (Finding 1; the 3rd occurrence: S5/S6/S7)
A REPO-WIDE grep guard was added during the fix: the brand-page nav (brand-detail-client.tsx) references each layer's
route. Verify it exists and is repo-wide (asserts /discovery AND /retrieval AND /trust — backfilling S5/S6 too), gated
Agency+ on subscriptions.tier.
```bash
grep -rn "discovery-hub\|'/discovery'\|/discovery\|Compass\|AGENCY_PLUS" components/domain/brand/brand-detail-client.tsx
grep -rn "discovery\|retrieval\|trust" scripts/qa/sprint7-invariants.sh | head
```
Re-break: remove the Discovery tile from brand-detail-client.tsx → the grep guard returns 0 → FAILS. (The guard that
would have caught all three nav-orphans.)

### Guard 2 — Discovery layer color CYAN not orange (Finding 2)
A guard was added: --layer-discovery is #06b6d4 (dark) / #0e7490 (light), and the orange #f97316/#ea580c is GONE. Verify.
```bash
grep -n "06b6d4\|0e7490\|f97316\|ea580c\|layer-discovery" app/globals.css scripts/qa/sprint7-invariants.sh
```
Re-break: set --layer-discovery back to #f97316 → the "cyan present / orange absent" guard FAILS.

### Guard 3 — MANDATORY prebuilt-journeys seed (Finding 3; the §5.5 acceptance criterion)
A DB-count guard should assert conversation_journeys has ≥3 per vertical seeded (the §5.5 acceptance criterion). Verify
it exists (or add it):
```bash
grep -rn "conversation_journeys\|prebuilt\|3.*vertical\|per.vertical\|count" scripts/qa/sprint7-invariants.sh
psql "$DEV_URL" -c "SELECT vertical, count(*) FROM conversation_journeys WHERE organization_id IS NULL GROUP BY vertical;"
```
The guard: ≥3 global template journeys per vertical (tradies must have 3). Re-break: (conceptually) an un-seeded DB →
guard fails. Since this is a seed/DB guard, assert it as a §12 psql-count check that fails when the seed is absent.

### Guard 4 — canonical empty-state COPY (Finding 4)
A guard should assert the canonical empty-state strings: journeys = "clone a pre-built" (NOT "via the API"); comparisons
= "Add competitors to your brand". Verify/add:
```bash
grep -rn "clone a pre-built\|via the API\|Add competitors to your brand\|Coming soon\|No journeys" "app/(auth)/brands/[brandId]/discovery/journeys/page.tsx" components/domain/discovery/ scripts/qa/sprint7-invariants.sh
```
Re-break: change the journeys empty copy back to "via the API" → the "clone a pre-built" grep guard FAILS.

### Guard 5 — Discovery page-module-export / route-resolves smoke (the S6-style compile-break catcher — likely NEW)
Like S6's guards 6+7 (rewritten to runtime import()): for the 3 Discovery pages (discovery hub, journeys, comparisons),
a RUNTIME import test that EXECUTES the module and asserts a default export function — catches a broken export / compile
error without a server. (S6 proved the regex/existsSync version is hollow; use runtime import().)
```ts
const DISCOVERY_PAGES = [
  'app/(auth)/brands/[brandId]/discovery/page',
  'app/(auth)/brands/[brandId]/discovery/journeys/page',
  'app/(auth)/brands/[brandId]/discovery/comparisons/page',
];
for (const p of DISCOVERY_PAGES) {
  it(`imports ${p} and default export is a function`, async () => {
    const mod = await import(`@/${p}`);
    expect(typeof mod.default).toBe('function');
  });
}
```
Re-break: break a Discovery page's default export (or add a syntax error) → the runtime import THROWS / default undefined
→ FAILS (the regex version would PASS a syntax error — demonstrate the import fails).

### Guard 6 — DOT-vs-SLASH event-name consistency (the footgun that silently broke 4 functions)
The dot-vs-slash mismatch (run-audit emits "audit.complete" but 4 fns listened on "audit/complete") is a repo footgun.
Add a standing convention guard: assert no Inngest function listens on the SLASH form of an event that's EMITTED as the
DOT form (or vice-versa). Practically:
```bash
# every fn that triggers on audit.* should use the DOT form matching the emit (audit.complete):
grep -rn "audit/complete\|audit\.complete" inngest/functions/*.ts
# assert: the fns that should chain off audit completion use 'audit.complete' (dot), matching run-audit's emit — 0 on 'audit/complete' (slash) for the audit-completion consumers.
```
Re-break: point a consumer back at "audit/complete" (slash) while run-audit emits "audit.complete" (dot) → the
consistency guard FAILS. (The guard that would have caught Finding 6 + the 3 collateral fns.)
NOTE: the technical-audit dual-emit is INTENTIONAL (both dot+slash) — the guard is about the audit.complete consumers
matching run-audit's emit form, not the deliberate dual-emit. Scope carefully.

## STEP 1 — Inventory: which guards exist (from the fixes) vs need building?
```bash
cat scripts/qa/sprint7-invariants.sh | grep -nE "discovery|nav|layer|06b6d4|f97316|prebuilt|conversation_journeys|clone|Add competitors|audit.complete|default"
ls tests/phase2/sprint7/ | grep -iE "walk|regression|guard|smoke|page"
```
Report which of guards 1-6 already exist (the fixes added several) vs need building.

## STEP 2 — Verify each fires on re-break; build the missing ones
Go through guards 1-6 ONE AT A TIME. Confirm the assertion, prove re-break (reintroduce the bug → FAILS → restore). The
grep/psql guards live in sprint7-invariants.sh; the runtime-import smoke (Guard 5) is a test file. Priority (most likely
to recur or not-yet-built): Guard 5 (page-module-export smoke — likely NEW), Guard 6 (dot-vs-slash convention — likely
NEW), Guard 3 (seed-count psql).

## STEP 3 — Run Section 3 + report, then STOP
```bash
bash scripts/qa/sprint7-invariants.sh; echo "exit: $?"
<repo test cmd> run tests/phase2/sprint7/   # the runtime-import smoke
```
- The 6 guards: which existed (from fixes) / built new. Re-break fired for each (esp. Guard 5 syntax-error, Guard 6
  slash-mismatch).
- Section 3 green; invariant script exit 0.
STOP — do NOT start Section 4. Report, and Section 4 (Frontend Unit) next.

## Constraints
- SECTION 3 ONLY (the UI/config/seed guards). Findings 5/6/7 are ALREADY guarded in Section 2 (dual-emit orgId,
  comparison-prompts audit.complete, s3-benchmark) — do NOT duplicate; Section 3's Guard 6 is the standing dot-vs-slash
  CONVENTION guard (repo-wide consistency), which is broader than Section 2's specific comparison guard.
- Guard 5 (page-module-export) must be a RUNTIME import() that EXECUTES the module (S6 proved regex/existsSync is hollow)
  — the syntax-error re-break must FAIL.
- The nav-orphan grep (Guard 1) is repo-wide (asserts each layer route) — the guard that catches this class going forward
  (it shipped 3×). Backfills S5/S6.
- LLM_MODE=mock. Dev DB `visibleau`, never prod. LLD v8.70 / prototype / §5.5 / §6U win.

## NOTE
Section 3 of 5 — the regression guards for the 7 walk/audit findings, MINUS the 3 (null org_id, dot-vs-slash,
CPR-01/s3-benchmark) already guarded in Section 2 (don't duplicate). Section 3 = the UI/config/seed guards: nav-orphan
repo-wide grep (Finding 1, 3rd occurrence — the guard that catches it going forward + backfills S5/S6), cyan-not-orange
token (Finding 2), the §5.5 prebuilt-seed ≥3/vertical psql-count (Finding 3, acceptance criterion), canonical
empty-state copy (Finding 4), a RUNTIME-import page-module-export smoke for the 3 Discovery pages (S6-style compile-break
catcher — regex is hollow, use import()), and the DOT-vs-SLASH standing convention guard (audit.complete consumers must
match run-audit's emit form — the footgun that silently broke 4 fns; scope it to NOT flag the intentional
technical-audit dual-emit). Several exist from the fixes — INVENTORY, verify + re-break, fill gaps (Guards 5 + 6 likely
new). STOP after Section 3 and report; Sections 4 (Frontend Unit), 5 (Frontend E2E), then QA follow.
