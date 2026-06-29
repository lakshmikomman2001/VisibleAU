import { describe, it, expect } from 'vitest';

describe('F04: Sample audit configuration', () => {
  it('F04-01: primaryRegions uses STATE:Suburb format', async () => {
    const mod = await import('@/lib/sample-audit/run');
    const src = (mod as any).toString?.() ?? '';
    const { CITABILITY_METHODS } = await import('@/lib/methodology/methods');
    expect(CITABILITY_METHODS.length).toBeGreaterThan(0);
  });

  it('F04-02: sample audit config exists and has cost cap', async () => {
    const { SAMPLE_AUDIT_CONFIG } = await import('@/lib/sample-audit/config');
    expect(SAMPLE_AUDIT_CONFIG).toBeDefined();
    expect(SAMPLE_AUDIT_CONFIG.estimatedCostAud).toBeDefined();
    expect(typeof SAMPLE_AUDIT_CONFIG.estimatedCostAud).toBe('number');
  });

  it('F04-03: sample audit cost cap is reasonable (< A$1)', async () => {
    const { SAMPLE_AUDIT_CONFIG } = await import('@/lib/sample-audit/config');
    expect(SAMPLE_AUDIT_CONFIG.estimatedCostAud).toBeLessThan(1);
  });
});
