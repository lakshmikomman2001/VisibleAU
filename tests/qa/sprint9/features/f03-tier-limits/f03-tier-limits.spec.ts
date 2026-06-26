import { describe, it, expect } from 'vitest';
import { TIER_AUDIT_LIMITS }    from '@/lib/scheduling/tier-limits';

describe('[S9QA] F03 — TIER_AUDIT_LIMITS exact PRD S7 values (T1)', () => {

  it('F03-01: free — 1 audit/month, 1 brand, manual, 0 scheduled', () => {
    const t = TIER_AUDIT_LIMITS.free;
    expect(t.auditsPerMonth).toBe(1);
    expect(t.brandsMax).toBe(1);
    expect(t.frequency).toBe('manual');
    expect(t.maxScheduled).toBe(0);
  });

  it('F03-02: starter — 4 audits/month, 1 brand, weekly, 1 scheduled', () => {
    const t = TIER_AUDIT_LIMITS.starter;
    expect(t.auditsPerMonth).toBe(4);
    expect(t.brandsMax).toBe(1);
    expect(t.frequency).toBe('weekly');
    expect(t.maxScheduled).toBe(1);
  });

  it('F03-03: growth — 12 audits/month, 1 brand, 3x_weekly, 1 scheduled', () => {
    const t = TIER_AUDIT_LIMITS.growth;
    expect(t.auditsPerMonth).toBe(12);
    expect(t.brandsMax).toBe(1);
    expect(t.frequency).toBe('3x_weekly');
    expect(t.maxScheduled).toBe(1);
  });

  it('F03-04: agency — 30 audits/brand/month, 5 brands, daily, 5 scheduled', () => {
    const t = TIER_AUDIT_LIMITS.agency as any;
    expect(t.auditsPerBrandPerMonth).toBe(30);
    expect(t.brandsMax).toBe(5);
    expect(t.frequency).toBe('daily');
    expect(t.maxScheduled).toBe(5);
  });

  it('F03-05: agency_pro — 60 audits/brand/month, 25 brands, 2x_daily, 25 scheduled', () => {
    const t = TIER_AUDIT_LIMITS.agency_pro as any;
    expect(t.auditsPerBrandPerMonth).toBe(60);
    expect(t.brandsMax).toBe(25);
    expect(t.frequency).toBe('2x_daily');
    expect(t.maxScheduled).toBe(25);
  });

  it('F03-06: enterprise — Infinity limits on everything', () => {
    const t = TIER_AUDIT_LIMITS.enterprise as any;
    expect(t.auditsPerBrandPerMonth).toBe(Infinity);
    expect(t.brandsMax).toBe(Infinity);
    expect(t.maxScheduled).toBe(Infinity);
  });

  it('F03-07: exactly 6 tiers defined — no extra or missing keys', () => {
    const keys = Object.keys(TIER_AUDIT_LIMITS);
    expect(keys).toHaveLength(6);
    for (const k of ['free','starter','growth','agency','agency_pro','enterprise'])
      expect(keys).toContain(k);
  });
});
