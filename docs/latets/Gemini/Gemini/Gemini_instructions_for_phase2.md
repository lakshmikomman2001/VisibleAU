Save this file into your project's root folder as your development task log.Markdown# Phase 2 — Sprint 1: Platform Foundation Task Spec

**Target Audience:** Programmatic Build Context for Claude Code  
**System Posture:** Multi-tenant, async-heavy B2B SaaS platform tracking AI search visibility[cite: 1, 3].  
**Scope Baseline:** Injecting Phase 2 core platform capabilities with zero user-facing UI alterations.  
**Drift Mitigation:** Strictly preserves Phase 1 Sprint 10 built invariants, tests, and E2E automation suites[cite: 3, 5].

---

## 1. Architectural Guardrails & Invariants

You must strictly enforce these platform execution rules during code generation and migration building[cite: 5]:
*   **Additive Schema Pattern:** Do not delete, rename, drop, or modify any existing Phase 1 database columns or tables[cite: 5]. All database modifications must be purely additive using `ADD COLUMN IF NOT EXISTS` patterns[cite: 5].
*   **Defensive Multi-Tenant RLS:** Every mutable tenant table must enable Row-Level Security (RLS) using a compound query enforcing BOTH `USING` and `WITH CHECK` clauses[cite: 5]. `WITH CHECK` is a non-negotiable backstop to prevent cross-tenant parameter modification on writes[cite: 5].
*   **Strict Inline Styling Syntax (`RT-01`):** Never append hex-alpha strings directly onto template variables holding CSS custom property tokens (e.g., `border: 1px solid var(--token)30` is invalid syntax and drops the border declaration completely)[cite: 4, 5]. Always use theme-aware `color-mix` styling properties: `color-mix(in srgb, var(--token) 19%, transparent)`[cite: 4, 5].
*   **Strict Token Quota Source:** Budget calculations and tier authentication checks must always join and read the `subscriptions.tier` column—never `organizations.tier`—as it is the absolute, stable billing source of truth[cite: 5].
*   **Data Retention Rules (`RT-01b`):** High-volume tables must carry explicit indexing and remain governed by the Sunday background retention cron (`0 4 * * 0`) to enforce rolling cleanup windows and prevent database storage bloat[cite: 5].
*   **No Projected Lift:** Never fabricate or project estimated traffic, revenue, or conversion liftoffs[cite: 3, 5]. Real GA4 session mappings and actual historical re-audits form the entire analytical contribution matrix[cite: 3, 5].
File 2: db/schema/phase2-platform.tsCreate this new database schema file using Drizzle ORM to specify your baseline table metrics[cite: 5].TypeScriptimport { pgTable, uuid, text, integer, boolean, timestamp, uniqueIndex, jsonb, numeric } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations } from './organizations';
import { audits } from './audits';

// Caches operational config versions per market, locale, and customer segment[cite: 5]
export const configBundleCache = pgTable('config_bundle_cache', {
  id: uuid('id').defaultRandom().primaryKey(),
  marketCode: text('market_code').notNull(),           // 'AU_EN' | 'NZ_EN' | 'UK_EN'[cite: 5]
  locale: text('locale').notNull(),               // 'en-AU' | 'en-NZ' | 'en-GB'[cite: 5]
  segment: text('segment').notNull(),              // 'smb' | 'agency' | 'enterprise'[cite: 5]
  bundleVersion: integer('bundle_version').notNull(),
  configDigest: text('config_digest').notNull(),
  resolvedConfig: jsonb('resolved_config').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueBundleVersion: uniqueIndex('config_bundle_version_unique_idx').on(table.marketCode, table.locale, table.segment, table.bundleVersion),
}));

// Hard ceiling token limits used to enforce budget controls per market and segment[cite: 5]
export const marketAiBudgetPolicies = pgTable('market_ai_budget_policies', {
  id: uuid('id').defaultRandom().primaryKey(),
  marketCode: text('market_code').notNull(),
  segment: text('segment').notNull(),
  useCase: text('use_case').notNull(),
  maxPromptsPerAudit: integer('max_prompts_per_audit').notNull().default(50),
  maxModelsPerAudit: integer('max_models_per_audit').notNull().default(4), // Paid tier 4 engine ceiling[cite: 3, 5]
  maxRepeatedSamples: integer('max_repeated_samples').notNull().default(5), // 5 runs per prompt[cite: 3, 5]
  maxEstimatedCostCents: integer('max_estimated_cost_cents').notNull().default(500),
  maxFanOutSubQueries: integer('max_fan_out_sub_queries').notNull().default(12),
  hardStopOnBudget: boolean('hard_stop_on_budget').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniquePolicyKey: uniqueIndex('budget_policy_market_segment_usecase_idx').on(table.marketCode, table.segment, table.useCase),
}));

// Threshold parameters governing the transition of an audit's data quality status[cite: 5]
export const metricQualityGates = pgTable('metric_quality_gates', {
  id: uuid('id').defaultRandom().primaryKey(),
  metricKey: text('metric_key').notNull(),
  marketCode: text('market_code').notNull(),
  minimumSamples: integer('minimum_samples').notNull(),
  minimumProviderCount: integer('minimum_provider_count').notNull().default(2),
  insufficientDataLabel: text('insufficient_data_label').notNull().default('Insufficient data'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueGateKey: uniqueIndex('metric_quality_gate_market_key_idx').on(table.metricKey, table.marketCode),
}));

// Append-only operational table logging financial cost tracking per completed audit
export const auditCostSnapshots = pgTable('audit_cost_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  auditId: uuid('audit_id').references(() => audits.id, { onDelete: 'cascade' }), // Cleans up with audit retention[cite: 5]
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  marketCode: text('market_code').notNull(),
  locale: text('locale').notNull(),
  estimatedCostCents: integer('estimated_cost_cents').notNull().default(0),
  actualCostCents: integer('actual_cost_cents').notNull().default(0),
  promptCount: integer('prompt_count').notNull().default(0),
  providerCallCount: integer('provider_call_count').notNull().default(0),
  budgetPolicyId: uuid('budget_policy_id').references(() => marketAiBudgetPolicies.id, { onDelete: 'set null' }), // Keeps facts intact if policy changes[cite: 5]
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});
File 3: db/seed/phase2-foundations.tsSave this seeding snippet to build your default system constraints.TypeScriptimport { db } from '../client';
import { metricQualityGates, marketAiBudgetPolicies } from '../schema';
import { sql } from 'drizzle-orm';

export async function seedPhase2Foundations() {
  // 1. Seed Mandatory Analytical Quality Gates — Protects audits from pending loops[cite: 5]
  await db.execute(sql`
    INSERT INTO metric_quality_gates (metric_key, market_code, minimum_samples, minimum_provider_count) VALUES
      ('frequency',       'AU_EN', 10, 2),
      ('sentiment',       'AU_EN', 10, 2),
      ('accuracy',        'AU_EN',  5, 2),
      ('position',        'AU_EN', 10, 2),
      ('context',         'AU_EN', 10, 2),
      ('composite',       'AU_EN',  3, 2),
      ('citation_source', 'AU_EN',  5, 2)
    ON CONFLICT (metric_key, market_code) DO NOTHING;
  `);

  // 2. Seed AU_EN Core AI Budget Policies[cite: 5]
  await db.execute(sql`
    INSERT INTO market_ai_budget_policies (market_code, segment, use_case, max_prompts_per_audit, max_models_per_audit, max_repeated_samples, max_estimated_cost_cents, hard_stop_on_budget) VALUES
      ('AU_EN', 'smb',    'standard_audit', 50, 4, 5, 500, true),
      ('AU_EN', 'agency', 'standard_audit', 100, 4, 5, 1000, true)
    ON CONFLICT (market_code, segment, use_case) DO NOTHING;
  `);
}
File 4: tests/unit/platform-foundations.test.tsAdd this validation specification to preserve test coverage.  TypeScriptimport { describe, it, expect, beforeEach, vi } from 'vitest';
import { QualityGateService } from '@/lib/platform/quality-gate.service';
import { db } from '@/db/client';

vi.mock('@/db/client', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) }))
  }
}));

describe('Phase 2 Foundation Verification Gates', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('should flag an audit as sufficient if metric constraints pass baseline parameters', async () => {
    vi.spyOn(db, 'select').mockResolvedValueOnce([
      { id: 'uuid-1', promptsCount: 12, engines: ['chatgpt', 'perplexity'], marketCode: 'AU_EN' }
    ]);

    const result = await QualityGateService.evaluate('uuid-1');
    expect(result.status).toBe('sufficient');
  });
});
Prompt for Claude Code to Execute:Once you have created these files locally, you can pass this command to kick off development:claude "Read visibleau-phase2-sprint1.md and execute the migrations using db/schema/phase2-platform.ts. Append the nullable fields to the audits and brands tables, run the seeder script, and execute the unit tests."[cite: 2, 5]