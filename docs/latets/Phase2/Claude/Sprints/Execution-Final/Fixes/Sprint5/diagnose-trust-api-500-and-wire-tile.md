# Claude Code — DIAGNOSE the trust API 500 (the real bug) + wire the missing Trust tile

Direct-URL `/brands/{id}/trust` LOADS (route + gate fine, Agency org sees it) but the console shows
`GET /api/brands/{id}/trust... 500 (Internal Server Error)` from page.tsx:40 — the hub renders its empty-state shell
because its DATA FETCH is ERRORING, not because there's no data (the brand has 7 audits). So TWO issues:
(A) the trust API 500s — the real bug, feature doesn't actually work; (B) no Trust tile on the brand hub (nav-orphan).
Fix A first (it's why the feature is dead), then B.

Env: Windows repo `C:\startup\VisibleAU\src\`. Dev DB `visibleau`, never prod. Brand
418f321f-2489-4560-aaa9-895728580465 (Agency org, 7 audits). (/e?ip=0 + array/local-disabled 404s = PostHog noise,
ignore.)

## PART A — DIAGNOSE the trust API 500 (get the STACK TRACE, then fix the root)

### A1 — Capture the server-side error (the browser only shows "500"; the stack is in the terminal)
```bash
# Reload /brands/{id}/trust and capture the dev-server terminal output for the failing GET.
# Identify WHICH route page.tsx:40 calls (the trust hub data route):
sed -n '30,55p' "app/(auth)/brands/[brandId]/trust/page.tsx"
grep -rn "fetch\|/api/brands\|/trust" "app/(auth)/brands/[brandId]/trust/page.tsx" | head
# Then read that route handler:
cat "app/api/brands/[brandId]/trust/route.ts" 2>/dev/null || find app/api -path "*trust*route.ts" | head
```
Report the STACK TRACE from the terminal. Classify the error into ONE:
- **Postgres "column/relation does not exist"** → a migration didn't apply (one of the 6 trust tables or the
  brand_entity_scores ALTER). Sprint 4 had this exact class. → A2.
- **`.toFixed is not a function` / NaN / "cannot read of string"** → Drizzle NUMERIC-as-STRING on a score column
  (trust-scorer, entity score, consistency_score, citation_share) — the 7000%-bug class as a 500. → A3.
- **null/undefined throw in a pure fn** → hallucination-risk read-time computation throwing on real/empty data. → A4.
- **ExplainabilityService.annotate() throwing** → the platform-contract fn erroring instead of degrading. → A5.
- **Something else** → report the trace.

### A2 — If migration missing: verify the 6 tables + the ALTER actually exist in the DEV DB
```bash
psql "$DATABASE_URL" -c "\dt" | grep -iE "hallucination_incidents|evidence_snapshots|brand_consensus_checks|linkedin_presence_audits|citation_source_intelligence|youtube_presence_audits"
psql "$DATABASE_URL" -c "\d brand_entity_scores" | grep -iE "knowledge_panel|wikidata|citation_share|gap_severity"
```
Report which tables/columns are MISSING. If a migration didn't run, run it (0016 trust, 0017 entity ALTER) against DEV
and re-check. (Sprint 4: "all 3 tables nonexistent despite build report" — verify, don't assume the migration applied.)

### A3 — If Drizzle-string: find the as-number cast / .toFixed on the score that 500s
```bash
grep -rn "as number\|\.toFixed\|Number(" lib/trust/trust-scorer.ts lib/trust/hallucination-risk.ts app/api/brands/**/trust* | grep -iE "score|share|consistency|risk|of_10|/100"
```
The fix is the Sprint-4 pattern: `Number(value)` coercion before any `.toFixed()`/math on a NUMERIC-returned-as-string.
Report the offending line + apply Number() coercion. (This is the 7000% bug resurfacing as a 500 — exactly what the
audit predicted for S5 scores.)

### A4/A5 — If pure-fn or annotate throw: report the throwing line + the input that triggers it
Report what null/edge input causes it and the fix (guard the null; make annotate degrade, not throw — per §0.4 it
should fail CI on empty rationale, but a runtime 500 on a real request is a bug).

### A6 — After the root fix: confirm the hub renders REAL trust data (not the error-fallback empty state)
Reload `/brands/{id}/trust` → the Hallucination Risk card / trust score (§6U.2) shows REAL numbers from the 7 audits,
NOT "Run an audit to see trust intelligence". Report the rendered score + that the 500 is gone.

## PART B — WIRE the missing Trust tile (nav-orphan, after A works)
The route loads, so it's purely the missing hub tile.
```bash
# Find the tile grid (13 tiles) + add a 14th:
grep -rn "Technical Audit\|Brand Entity\|Local SEO\|Audit Schedule\|/reports\|tile\|SectionCard" "app/(auth)/brands/[brandId]/page.tsx" components/ | head
```
Add a Trust tile matching the existing 13: title **Trust**, subtitle e.g. "Hallucination risk & authority", href
`/brands/${brandId}/trust`, a shield-style icon from the same lucide set, Growth+ gate reading **subscriptions.tier**
(never organizations.tier — the invariant). Place near Brand Entity. Verify ON SCREEN: reload brand page → 14 tiles,
Trust appears → click → reaches the (now-working) trust hub.

## STEP — Report
1. PART A: the stack trace + which class (migration / Drizzle-string / null / annotate) + the fix + the hub now shows
   REAL data (500 gone).
2. PART B: Trust tile added, appears on the brand page, click reaches the working hub.
3. Confirm the tier gate reads subscriptions.tier.

## Constraints
- Fix the 500 ROOT (A) before the tile (B) — a tile linking to a 500ing hub is worse than no tile.
- Get the actual STACK TRACE — do not guess the 500's cause; the terminal has it.
- Dev DB `visibleau`, never prod. If a migration must run, run it against DEV only.
- Drizzle NUMERIC → Number() coercion (the 7000%/500 class). Tier gate → subscriptions.tier.
- Verify the hub renders REAL data on screen, not the error-fallback empty state.
- LLD v8.70 / §6U.2 win on conflict.

## NOTE
The empty state "Run an audit to see trust intelligence" is MISLEADING here — the brand has 7 audits; the hub shows that
fallback because its API 500s (page.tsx:40 GET → 500). So the trust feature is not actually working, just rendering a
shell. The 500's cause is almost certainly one the audit flagged: a missing S5 migration (Sprint-4 class) or Drizzle
NUMERIC-as-string on a trust score (7000% class) or a throwing read-time risk fn. Get the stack trace, fix the root,
confirm REAL trust data renders — THEN wire the tile. The tile is cosmetic; the 500 is the feature being dead.
