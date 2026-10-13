/**
 * Task #46 (7th follow-up): integration test bootstrap. Runs ONCE
 * before the "integration" vitest project's test files (wired via
 * vitest.config.ts's globalSetup). Three jobs:
 *
 * 1. Refuse to run at all unless DATABASE_URL points at a disposable
 *    local database -- the same guard scripts/db/migrate-local.ts uses
 *    (scripts/db/local-db-guard.ts). This is the structural fix for "a
 *    test suite that seeds and truncates must never point at anything
 *    called *_prod, and one config slip away from Neon is one slip too
 *    many" -- it's a backstop for the env-level config, not a
 *    replacement for tests/helpers/test-db-url.ts (which guards each
 *    file that resolves its OWN connection string independently).
 *
 * 2. Fail fast with every missing column/table listed, instead of
 *    letting dozens of unrelated tests fail later one at a time with
 *    confusing 42703 errors (exactly how competitor_cited and
 *    youtube_channel_url went unnoticed). Launch-readiness invariants
 *    (RLS policy count, vertical-pack seed rows) are deliberately
 *    excluded from this gate -- they're prod-launch checks, not "will
 *    a query crash" checks, and a local test DB was never meant to
 *    satisfy them.
 *
 * 3. Idempotently seed the fixed-ID org/brand/user rows that several
 *    pre-existing integration tests assume already exist (previously
 *    only true on the local visibleau_prod mirror -- see the 5 files
 *    fixed in this same follow-up) via ./shared-fixtures.ts's
 *    `ensureSharedFixtures()`. ON CONFLICT DO NOTHING -- never
 *    overwrites a row a real test seeded under the same id. Also seeds
 *    the global (non-org-scoped) AU_EN platform reference data
 *    (metric_quality_gates, provider_market_capabilities, one
 *    market_ai_budget_policies row) that e2e-rls-fk-services.integration.test.ts
 *    depends on -- reusing db/seed/metric-quality-gates.ts and
 *    db/seed/provider-market-capabilities.ts's own exported constants
 *    (no seed script exists anywhere for the budget_policy row, so its
 *    one value is inlined here, copied verbatim from the local
 *    visibleau_prod mirror).
 *
 * This one-time seed is NOT sufficient on its own: discovered that
 * tests/phase2/sprint4/helpers/test-db.ts's `truncateAll()` (used by
 * two sprint4 integration tests for their own full-isolation strategy)
 * runs `TRUNCATE organizations, brands, ... CASCADE` against this same
 * database, wiping these fixtures out mid-suite depending on file
 * execution order. Every file that depends on these rows ALSO calls
 * `ensureSharedFixtures()` defensively in its own `beforeAll` -- see
 * shared-fixtures.ts's own docstring.
 *
 * See docs/ops/post-launch-db-hardening.md section 46 (7th follow-up).
 */
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import postgres from "postgres";
import { AU_EN_QUALITY_GATES } from "../../db/seed/metric-quality-gates";
import { AU_EN_PROVIDERS } from "../../db/seed/provider-market-capabilities";
import { assertLocalSafeDatabaseUrl } from "../../scripts/db/local-db-guard";
import { checkSchemaDrift } from "../../scripts/qa/schema-drift";
import { ensureSharedFixtures } from "./shared-fixtures";

// Plain `vitest run` does NOT load .env.test.local into process.env on
// its own -- every pre-existing test file that needs a DB connection
// either hardcodes a literal fallback or calls dotenv itself. Centralize
// it here instead: this runs before every other setupFile/test file in
// the "integration" project, so process.env.DATABASE_URL/TEST_DATABASE_URL
// are reliably populated by the time tests/helpers/test-db-url.ts (or
// anything else) reads them. Never overrides a value the shell already
// set (`override: false`, dotenv's default).
loadDotenv({ path: resolve(__dirname, "../../.env.test.local") });

export default async function globalSetup(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("integration bootstrap: DATABASE_URL is not set.");
  }
  assertLocalSafeDatabaseUrl(dbUrl);

  const { fatals } = await checkSchemaDrift(dbUrl);
  const schemaFatals = fatals.filter((f) => !f.startsWith("launch invariant:"));
  if (schemaFatals.length > 0) {
    const dbName = new URL(dbUrl).pathname.replace(/^\//, "");
    throw new Error(
      `integration bootstrap: schema drift detected against "${dbName}" -- run ` +
        `'pnpm db:migrate:local' before running the integration suite:\n` +
        schemaFatals.map((f) => `  - ${f}`).join("\n"),
    );
  }

  const sql = postgres(dbUrl, { max: 1 });
  try {
    await ensureSharedFixtures(sql);

    for (const gate of AU_EN_QUALITY_GATES) {
      await sql`
        INSERT INTO metric_quality_gates (metric_key, market_code, minimum_samples, minimum_provider_count)
        VALUES (${gate.metricKey}, ${gate.marketCode}, ${gate.minimumSamples}, ${gate.minimumProviderCount})
        ON CONFLICT (metric_key, market_code) DO NOTHING
      `;
    }

    for (const p of AU_EN_PROVIDERS) {
      await sql`
        INSERT INTO provider_market_capabilities (
          provider_key, model_key, market_code, locale, supports_web_retrieval,
          supports_citations, supports_location_context, supports_query_fan_out,
          max_fan_out_sub_queries, is_enabled
        )
        VALUES (
          ${p.providerKey}, ${p.modelKey}, ${p.marketCode}, ${p.locale}, ${p.supportsWebRetrieval},
          ${p.supportsCitations}, ${p.supportsLocationContext}, ${p.supportsQueryFanOut},
          ${p.maxFanOutSubQueries}, ${p.isEnabled}
        )
        ON CONFLICT (provider_key, model_key, market_code, locale) DO NOTHING
      `;
    }

    await sql`
      INSERT INTO market_ai_budget_policies (
        market_code, segment, use_case, max_prompts_per_audit, max_models_per_audit,
        max_repeated_samples, max_estimated_cost_cents, max_fan_out_sub_queries, hard_stop_on_budget
      )
      VALUES ('AU_EN', 'smb', 'brand_audit', 50, 4, 5, 550, 12, true)
      ON CONFLICT (market_code, segment, use_case) DO NOTHING
    `;
  } finally {
    await sql.end();
  }
}
