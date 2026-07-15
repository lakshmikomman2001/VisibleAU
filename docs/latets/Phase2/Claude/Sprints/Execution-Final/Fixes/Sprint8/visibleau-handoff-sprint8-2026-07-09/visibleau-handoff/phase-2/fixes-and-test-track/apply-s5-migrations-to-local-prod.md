# Claude Code — Apply S5 migrations (0016 + 0017) to LOCAL PROD, then verify trust + audit both work

## Context (root cause is clear — not a code bug)
The app is being run against LOCAL PROD (`visibleau_prod`), but the S5 migrations (0016 trust, 0017 entity ALTER) were
only applied to LOCAL DEV (`visibleau`). So local prod is missing the entire Sprint 5 schema. That single gap causes all
three symptoms: (1) trust API 500 (trust tables absent in prod), (2) audit insert into `citations` fails (the S5 columns
is_accurate/hallucination_flags/cited_source_type/cited_source_engine_affinity that the CODE now writes don't exist in
prod's citations table → "column does not exist"). Fix: apply 0016 + 0017 to local prod so its schema matches the code.

⚠️ This is a deliberate migration against a PROD database (local prod). Migrations normally go dev→prod intentionally;
this one was missed. Proceed carefully.

## STEP 1 — Confirm the target + that the migrations are idempotent (safe to run on prod)
```bash
# Confirm the LOCAL PROD connection string (visibleau_prod, NOT the real hosted prod if one exists):
grep -nE "visibleau_prod|DATABASE_URL|PROD.*DATABASE" .env.local .env.production .env 2>/dev/null
# Verify 0016 + 0017 are idempotent (IF NOT EXISTS / IF EXISTS guards) — required before running on prod:
grep -nE "IF NOT EXISTS|IF EXISTS|CREATE TABLE|ADD COLUMN|DROP POLICY|CREATE POLICY" db/migrations/0016*.sql db/migrations/0017*.sql | head -40
```
Report: the exact local-prod connection string, and confirm BOTH migrations use IF NOT EXISTS / IF EXISTS (idempotent →
re-runnable, safe). If either is NOT idempotent, STOP and report — do not run a non-idempotent migration against prod.

## STEP 2 — Show current prod schema gap (what's missing)
```bash
# Point at LOCAL PROD for these checks (use the visibleau_prod URL):
PROD_URL="<visibleau_prod connection string from STEP 1>"
psql "$PROD_URL" -c "\dt" | grep -iE "hallucination_incidents|evidence_snapshots|brand_consensus_checks|linkedin_presence_audits|citation_source_intelligence|youtube_presence_audits"
psql "$PROD_URL" -c "\d citations" | grep -iE "is_accurate|hallucination_flags|cited_source_type|cited_source_engine_affinity"
psql "$PROD_URL" -c "\d brand_entity_scores" | grep -iE "knowledge_panel|wikidata|citation_share"
```
Report what's MISSING in local prod (should be: the 6 trust tables absent, the citations S5 columns absent, the entity
ALTER columns absent) — confirming the gap.

## STEP 3 — Apply 0016 + 0017 to LOCAL PROD
Use the project's migration runner pointed at local prod (preferred — same path as dev), or apply the SQL directly:
```bash
# Preferred: the repo's migrate command with the prod DB URL (however the project runs migrations):
#   e.g. DATABASE_URL=$PROD_URL npm run db:migrate   (or drizzle-kit / the project's script)
# Confirm which migrations run and that 0016 + 0017 apply. If the runner tracks applied migrations per-DB, it will
# apply exactly the ones prod is missing.
```
Report which migrations applied.

## STEP 4 — Verify the gap is closed
```bash
psql "$PROD_URL" -c "\dt" | grep -iE "hallucination_incidents|evidence_snapshots|brand_consensus_checks|linkedin_presence_audits|citation_source_intelligence|youtube_presence_audits"   # → all 6 present
psql "$PROD_URL" -c "\d citations" | grep -iE "is_accurate|hallucination_flags|cited_source_type|cited_source_engine_affinity"   # → all 4 present
psql "$PROD_URL" -c "\d brand_entity_scores" | grep -iE "knowledge_panel|wikidata|citation_share"   # → ALTER cols present
```
Report: 6 tables + citations S5 columns + entity ALTER columns now all present in local prod.

## STEP 5 — Verify BOTH features work on screen (the real test)
1. **Audit:** Retry the failed audit (baa36ba7-...) → it now COMPLETES (citations insert succeeds — the S5 columns
   exist). Watch the audit detail: success, not "Audit failed".
2. **Trust hub:** reload `/brands/418f321f.../trust` → loads REAL trust data (or a legitimate empty state if no trust
   analysis has run yet), NOT a 500.
3. **Trust tile:** the brand page shows the Trust tile (already added) → click → reaches the working hub.
Report all three: audit completes, trust hub loads (no 500), tile reaches hub.

## STEP 6 — Note the process gap (so it doesn't recur)
Both local DBs (dev `visibleau` + prod `visibleau_prod`) must receive migrations. Going forward, when a sprint adds
migrations, apply them to BOTH local DBs (and, eventually, real prod on deploy). Consider a short note/script:
`db:migrate:all` that runs pending migrations against both local DBs, so this dev-applied-but-prod-missing gap can't
recur. Report whether such a convenience exists or should be added (low priority, but it's what caused today's three
symptoms).

## Constraints
- Confirm idempotency (STEP 1) BEFORE running against prod. Only run IF NOT EXISTS-guarded migrations on prod.
- Target LOCAL PROD (`visibleau_prod`) — confirm the connection string is local prod, not a real hosted production DB.
- Verify BOTH audit + trust work after (STEP 5) — the whole point is all three symptoms share this one cause.
- These migrations are the SAME ones already applied to dev — no NEW schema changes; just bringing prod in sync.

## NOTE
Not a code bug — a missed migration. The app runs on local prod; the S5 migrations only hit local dev; so prod lacks the
trust tables AND the new citations columns the code writes → trust 500 + audit-insert failure, same root cause. Apply
0016 + 0017 to local prod (idempotent, so safe to run), verify the 6 tables + citations columns + entity ALTER all land,
then confirm the audit completes AND the trust hub loads. Add a both-DBs migration habit so dev-applied/prod-missing
can't recur.
