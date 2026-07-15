# Claude Code — Apply S6 migrations (0018 + 0019) to LOCAL PROD — brands page is 500ing on missing brand_token

## Root cause (SAME as S5 #2 — not a code bug)
The app runs against LOCAL PROD `visibleau_prod`, but the S6 migrations (0018 = 4 tables, 0019 = brands.brand_token ALTER
+ nanoid backfill) were only applied to DEV `visibleau`. The Drizzle schema now expects `brand_token` on the `brands`
table (it's in every brands SELECT), but prod's `brands` table lacks the column → `column "brand_token" does not exist`
(42703) on EVERY brands query → the entire Brands section is down ("Something went wrong", error boundary). Blast radius
is large because brand_token is on the `brands` table that every page queries. Fix: apply 0018 + 0019 to local prod.

⚠️ Deliberate migration against a PROD database (local prod). This is the third time the dev-applied/prod-missing gap has
bitten (S5 trust tables, S5 citations cols, now S6 brand_token) — after this, consider the both-DBs migration habit.

Env: Windows repo `C:\startup\VisibleAU\src\`. Never real/hosted prod.

## STEP 1 — Confirm the local-prod connection + that BOTH S6 migrations are idempotent
```bash
grep -nE "visibleau_prod|DATABASE_URL|PROD.*DATABASE" .env.local .env.production .env 2>/dev/null
# Confirm 0018 + 0019 use IF NOT EXISTS / IF EXISTS guards (required before running on prod):
grep -nE "IF NOT EXISTS|IF EXISTS|CREATE TABLE|ADD COLUMN|CREATE POLICY|DROP POLICY" db/migrations/*sprint6_retrieval.sql db/migrations/*sprint6_brand_token.sql | head -40
```
Report: the local-prod connection string, and confirm BOTH migrations are idempotent (MI-01). If either is NOT
idempotent, STOP and report.

## STEP 2 — Show the prod gap (what's missing)
```bash
PROD_URL="<visibleau_prod connection string>"
# The column the error is about:
psql "$PROD_URL" -c "\d brands" | grep -i "brand_token"       # → likely MISSING (that's the 500)
# The 4 S6 tables (0018) — probably also missing in prod:
psql "$PROD_URL" -c "\dt" | grep -iE "crawler_visit_logs|content_structure_audits|llmstxt_versions|agent_readiness_scores"
```
Report what's missing in local prod (brand_token column + likely the 4 tables).

## STEP 3 — Apply 0018 + 0019 to LOCAL PROD (tables first, then the ALTER — the prompt's order)
```bash
# Use the repo's migration runner pointed at local prod (same path as dev), or apply the SQL directly.
# ORDER MATTERS: 0018 (4 tables) FIRST, then 0019 (brand_token ALTER + backfill).
#   e.g. DATABASE_URL=$PROD_URL <the project's migrate command>
```
- **CRITICAL — the backfill:** 0019 doesn't just ADD the column, it BACKFILLS brand_token with nanoid values for
  existing brands. Confirm the backfill runs against prod too — else existing prod brands have NULL brand_token and the
  Visit API auth won't work for them. Verify after (STEP 4).
Report which migrations applied.

## STEP 4 — Verify the gap is closed + the brands page loads
```bash
psql "$PROD_URL" -c "\d brands" | grep -i "brand_token"       # → present now
psql "$PROD_URL" -c "\dt" | grep -iE "crawler_visit_logs|content_structure_audits|llmstxt_versions|agent_readiness_scores"  # → all 4 present
# Backfill worked — no NULL brand_tokens on existing brands:
psql "$PROD_URL" -c "SELECT count(*) AS null_tokens FROM brands WHERE brand_token IS NULL AND deleted_at IS NULL;"  # → 0
```
Then ON SCREEN:
1. Reload `/brands` → the Brands list LOADS (no "Something went wrong").
2. Open a brand → `/brands/418f321f...` loads (the detail page that was 500ing).
3. A Retrieval screen loads (confirms the 4 tables exist in prod).
Report: brand_token present + backfilled (0 nulls), 4 tables present, Brands pages load.

## STEP 5 — the process habit (so this stops recurring)
This is the 3rd dev-applied/prod-missing incident. Both local DBs (dev `visibleau` + prod `visibleau_prod`) must get
every migration. Report whether a `db:migrate:all` convenience (runs pending migrations against BOTH local DBs) exists or
should be added — it would prevent this exact class.

## Constraints
- Confirm idempotency (STEP 1) BEFORE running against prod. Tables (0018) before the ALTER (0019).
- Ensure the 0019 BACKFILL runs against prod (nanoid tokens for existing brands) — verify 0 NULL tokens after.
- Target LOCAL PROD `visibleau_prod` — confirm it's local prod, not real/hosted prod.
- Verify the Brands pages LOAD on screen after (the whole section was down).
- These are the SAME migrations already on dev — no new schema; just syncing prod.

## NOTE
Not a code bug — the 3rd dev-applied/prod-missing gap (after S5's trust tables + citations cols). The app runs on local
prod; S6's 0018 (4 tables) + 0019 (brands.brand_token ALTER + nanoid backfill) only hit dev; so prod's brands table lacks
brand_token → every brands query 500s → the whole Brands section is down. Apply 0018 + 0019 to local prod (idempotent,
tables first then the ALTER), ensure the backfill populates existing brands' tokens, verify the Brands pages load. Then
add a both-DBs migration habit so this can't recur a 4th time.
