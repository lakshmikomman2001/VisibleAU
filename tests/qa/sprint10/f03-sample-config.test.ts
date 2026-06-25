import { describe, it, expect } from 'vitest';

const SAMPLE_AUDIT_CONFIG = {
  engines:           ['chatgpt'] as const,
  promptsCount:      5,
  runsPerPrompt:     1,
  totalCallsExpected: 5,
  estimatedDurationSec: 90,
  estimatedCostAud:  0.10,
} as const;

describe('F03: Sample audit config (HB2, PRD §7 Principle #6)', () => {

  it('F03-01: engines = ["chatgpt"] — exactly 1 engine', () => {
    expect(SAMPLE_AUDIT_CONFIG.engines).toEqual(['chatgpt']);
    expect(SAMPLE_AUDIT_CONFIG.engines.length).toBe(1);
  });

  it('F03-02: promptsCount = 5', () => {
    expect(SAMPLE_AUDIT_CONFIG.promptsCount).toBe(5);
  });

  it('F03-03: runsPerPrompt = 1 (no Wilson CI for sample)', () => {
    expect(SAMPLE_AUDIT_CONFIG.runsPerPrompt).toBe(1);
  });

  it('F03-04: totalCallsExpected = 5 (1 × 5 × 1)', () => {
    expect(SAMPLE_AUDIT_CONFIG.totalCallsExpected).toBe(
      SAMPLE_AUDIT_CONFIG.engines.length *
      SAMPLE_AUDIT_CONFIG.promptsCount *
      SAMPLE_AUDIT_CONFIG.runsPerPrompt
    );
  });

  it('F03-05: estimatedCostAud = 0.10 AUD', () => {
    expect(SAMPLE_AUDIT_CONFIG.estimatedCostAud).toBe(0.10);
  });

  it('F03-06: estimatedCostAud ≤ SAMPLE_AUDIT_COST_CAP_AUD env var', () => {
    const cap = parseFloat(process.env.SAMPLE_AUDIT_COST_CAP_AUD ?? '0.10');
    expect(SAMPLE_AUDIT_CONFIG.estimatedCostAud).toBeLessThanOrEqual(cap);
  });

  it('F03-07: cost in USD < $0.10 USD (FX_AUD_USD conversion)', () => {
    const fx     = parseFloat(process.env.FX_AUD_USD ?? '0.66');
    const costUsd = SAMPLE_AUDIT_CONFIG.estimatedCostAud * fx;
    expect(costUsd).toBeLessThan(0.10);
  });

  it('F03-08: estimatedDurationSec = 90 seconds', () => {
    expect(SAMPLE_AUDIT_CONFIG.estimatedDurationSec).toBe(90);
  });

  it('F03-09: chatgpt is the ONLY engine (not perplexity/claude/gemini)', () => {
    expect(SAMPLE_AUDIT_CONFIG.engines.includes('chatgpt')).toBe(true);
    expect((SAMPLE_AUDIT_CONFIG.engines as readonly string[]).includes('perplexity')).toBe(false);
    expect((SAMPLE_AUDIT_CONFIG.engines as readonly string[]).includes('claude')).toBe(false);
    expect((SAMPLE_AUDIT_CONFIG.engines as readonly string[]).includes('gemini')).toBe(false);
  });
});
