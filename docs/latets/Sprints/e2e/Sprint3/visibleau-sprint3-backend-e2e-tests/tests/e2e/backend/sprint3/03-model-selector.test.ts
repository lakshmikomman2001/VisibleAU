/**
 * tests/e2e/backend/sprint3/03-model-selector.test.ts
 *
 * Sprint 3 §6 + §12 acceptance: selectModel() 72-combination matrix.
 * 6 tiers × 4 engines × 3 tasks = 72 combinations.
 * Sprint 3 CLAUDE.md: "Do not skip these tests." (AA1 fix)
 */

import { describe, it, expect } from 'vitest';
import { selectModel } from '@/lib/llm/model-selector';
import type { Tier } from '@/db/schema';

const TIERS:   Tier[]       = ['free', 'starter', 'growth', 'agency', 'agency_pro', 'enterprise'];
const ENGINES: string[]     = ['chatgpt', 'claude', 'gemini', 'perplexity'];
const TASKS:   string[]     = ['brand_mention', 'sentiment', 'context'];

describe('selectModel — Sprint 3 §6 (72-combination matrix)', () => {

  // ── §12 acceptance criteria ────────────────────────────────────────────────

  it('TC-S3-30: AC — selectModel("agency_pro", "chatgpt", "brand_mention") = "gpt-4o"', () => {
    expect(selectModel('agency_pro', 'chatgpt', 'brand_mention')).toBe('gpt-4o');
  });

  it('TC-S3-31: AC — selectModel("free", "chatgpt", "brand_mention") = "gpt-4o-mini"', () => {
    expect(selectModel('free', 'chatgpt', 'brand_mention')).toBe('gpt-4o-mini');
  });

  it('TC-S3-32: AC — selectModel(<any tier>, "chatgpt", "sentiment") = "gpt-4o-mini" (derived = cheapest)', () => {
    for (const tier of TIERS) {
      expect(selectModel(tier as Tier, 'chatgpt', 'sentiment'), `${tier} sentiment`).toBe('gpt-4o-mini');
    }
  });

  // ── Tier quality escalation for brand_mention ──────────────────────────────

  it('TC-S3-33: agency uses gpt-4o for ChatGPT (not gpt-4o-mini)', () => {
    expect(selectModel('agency', 'chatgpt', 'brand_mention')).toBe('gpt-4o');
  });

  it('TC-S3-34: free/starter use gpt-4o-mini for ChatGPT', () => {
    expect(selectModel('free',    'chatgpt', 'brand_mention')).toBe('gpt-4o-mini');
    expect(selectModel('starter', 'chatgpt', 'brand_mention')).toBe('gpt-4o-mini');
  });

  it('TC-S3-35: agency uses sonar-pro for Perplexity', () => {
    expect(selectModel('agency', 'perplexity', 'brand_mention')).toBe('sonar-pro');
  });

  it('TC-S3-36: free/starter use sonar for Perplexity', () => {
    expect(selectModel('free',    'perplexity', 'brand_mention')).toBe('sonar');
    expect(selectModel('starter', 'perplexity', 'brand_mention')).toBe('sonar');
  });

  // ── Derived tasks always cheapest regardless of tier ──────────────────────

  it('TC-S3-37: sentiment + context tasks return same model for agency_pro and free (cheapest model invariant)', () => {
    for (const engine of ENGINES) {
      const agencyProSentiment = selectModel('agency_pro', engine as any, 'sentiment');
      const freeSentiment      = selectModel('free',       engine as any, 'sentiment');
      expect(agencyProSentiment, `${engine} sentiment: agency_pro vs free`).toBe(freeSentiment);

      const agencyProContext   = selectModel('agency_pro', engine as any, 'context');
      const freeContext        = selectModel('free',       engine as any, 'context');
      expect(agencyProContext, `${engine} context: agency_pro vs free`).toBe(freeContext);
    }
  });

  // ── Agency Pro value prop (v1: same models as agency; Opus reserved for v1.1) ─

  it('TC-S3-38: agency_pro uses same models as agency for brand_mention in v1 (Opus reserved for v1.1)', () => {
    for (const engine of ENGINES) {
      expect(
        selectModel('agency_pro', engine as any, 'brand_mention'),
        `${engine}: agency_pro should equal agency in v1`
      ).toBe(selectModel('agency', engine as any, 'brand_mention'));
    }
  });

  // ── Claude models ──────────────────────────────────────────────────────────

  it('TC-S3-39: free/starter use claude-3-5-haiku-20241022 (cheapest Claude)', () => {
    expect(selectModel('free',    'claude', 'brand_mention')).toBe('claude-3-5-haiku-20241022');
    expect(selectModel('starter', 'claude', 'brand_mention')).toBe('claude-3-5-haiku-20241022');
  });

  it('TC-S3-40: agency uses claude-3-5-sonnet-20241022 (NOT Opus — anti-pattern §13)', () => {
    const model = selectModel('agency', 'claude', 'brand_mention');
    expect(model).toBe('claude-3-5-sonnet-20241022');
    expect(model).not.toContain('opus');
  });

  // ── Unknown tier fallback ──────────────────────────────────────────────────

  it('TC-S3-41: unknown tier falls back to starter models (gpt-4o-mini for chatgpt)', () => {
    const model = selectModel('unknown' as Tier, 'chatgpt', 'brand_mention');
    expect(model).toBe('gpt-4o-mini');
  });

  // ── Exhaustive 72-combination matrix ──────────────────────────────────────

  describe('exhaustive 72-combination matrix', () => {
    it.each(
      TIERS.flatMap(tier =>
        ENGINES.flatMap(engine =>
          TASKS.map(task => ({ tier, engine, task }))
        )
      )
    )('$tier / $engine / $task → non-empty model string', ({ tier, engine, task }) => {
      const model = selectModel(tier as Tier, engine as any, task as any);
      expect(typeof model).toBe('string');
      expect(model.length).toBeGreaterThan(0);
    });
  });
});
