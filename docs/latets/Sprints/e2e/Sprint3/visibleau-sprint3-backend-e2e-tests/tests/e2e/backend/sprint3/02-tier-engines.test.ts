/**
 * tests/e2e/backend/sprint3/02-tier-engines.test.ts
 *
 * Sprint 3 §6.5 + AC3b: enginesForTier() pure function tests.
 * Free tier = exactly ['chatgpt', 'perplexity'] (2 engines per PRD §7).
 * All paid tiers = all 4 engines.
 *
 * No DB or HTTP needed — pure function.
 */

import { describe, it, expect } from 'vitest';
import { enginesForTier, TIER_ENGINES } from '@/lib/llm/tier-engines';

describe('enginesForTier — Sprint 3 §6.5 tier-engine allowlist', () => {

  // ── AC3b canonical assertions ──────────────────────────────────────────────

  it('TC-S3-20: AC3b — Free tier returns exactly ["chatgpt", "perplexity"] (2 engines, PRD §7)', () => {
    const engines = enginesForTier('free');
    expect(engines).toEqual(['chatgpt', 'perplexity']);
    expect(engines).toHaveLength(2);
  });

  it('TC-S3-21: Free tier does NOT include claude or gemini', () => {
    const engines = enginesForTier('free');
    expect(engines).not.toContain('claude');
    expect(engines).not.toContain('gemini');
  });

  it.each(['starter', 'growth', 'agency', 'agency_pro', 'enterprise'] as const)(
    'TC-S3-22: %s (paid) tier returns all 4 engines',
    (tier) => {
      const engines = enginesForTier(tier);
      expect(engines).toEqual(['chatgpt', 'claude', 'gemini', 'perplexity']);
      expect(engines).toHaveLength(4);
    }
  );

  // ── TIER_ENGINES map coverage ──────────────────────────────────────────────

  it('TC-S3-23: TIER_ENGINES map covers all 6 tier enum values', () => {
    const tiers = ['free', 'starter', 'growth', 'agency', 'agency_pro', 'enterprise'] as const;
    for (const tier of tiers) {
      expect(TIER_ENGINES[tier], `${tier} must be defined`).toBeDefined();
      expect(TIER_ENGINES[tier].length, `${tier} must have ≥2 engines`).toBeGreaterThanOrEqual(2);
    }
  });

  it('TC-S3-24: enginesForTier falls back to free (most restrictive) for unknown tier', () => {
    // Runtime guard — TypeScript prevents at compile time but test the fallback
    const engines = enginesForTier('unknown' as any);
    expect(engines).toEqual(['chatgpt', 'perplexity']);
    expect(engines).toHaveLength(2);
  });

  // ── Call count arithmetic ──────────────────────────────────────────────────

  it('TC-S3-25: Free tier: 2 engines × 10 prompts × 5 runs = 100 calls', () => {
    const engines = enginesForTier('free');
    const totalCalls = engines.length * 10 * 5;
    expect(totalCalls).toBe(100);
  });

  it('TC-S3-26: Paid tier: 4 engines × 10 prompts × 5 runs = 200 calls', () => {
    const engines = enginesForTier('agency');
    const totalCalls = engines.length * 10 * 5;
    expect(totalCalls).toBe(200);
  });

  // ── Do NOT hardcode 4 engines (X6 fix) ────────────────────────────────────

  it('TC-S3-27: engine count is tier-derived (not hardcoded 4) — Free tier proves this', () => {
    // If someone hardcodes 4, Free tier would return 4, failing AC3b
    const freeEngines = enginesForTier('free');
    const agencyEngines = enginesForTier('agency');
    expect(freeEngines.length).not.toBe(agencyEngines.length);
    expect(freeEngines.length).toBe(2);
    expect(agencyEngines.length).toBe(4);
  });
});
