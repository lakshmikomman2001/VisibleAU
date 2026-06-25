import { describe, it, expect } from 'vitest';

const TIER_AUDIT_LIMITS: Record<string, { auditsPerMonth: number }> = {
  free:       { auditsPerMonth: 3 },
  starter:    { auditsPerMonth: 20 },
  growth:     { auditsPerMonth: 60 },
  agency:     { auditsPerMonth: 200 },
  agency_pro: { auditsPerMonth: 500 },
  enterprise: { auditsPerMonth: Infinity },
};

describe('F06: TIER_AUDIT_LIMITS per PRD §7 (HE1)', () => {
  it('F06-01: free = 3 audits/month', () => { expect(TIER_AUDIT_LIMITS.free.auditsPerMonth).toBe(3); });
  it('F06-02: starter = 20 audits/month', () => { expect(TIER_AUDIT_LIMITS.starter.auditsPerMonth).toBe(20); });
  it('F06-03: growth = 60 audits/month', () => { expect(TIER_AUDIT_LIMITS.growth.auditsPerMonth).toBe(60); });
  it('F06-04: agency = 200 audits/month', () => { expect(TIER_AUDIT_LIMITS.agency.auditsPerMonth).toBe(200); });
  it('F06-05: agency_pro = 500 audits/month', () => { expect(TIER_AUDIT_LIMITS.agency_pro.auditsPerMonth).toBe(500); });
  it('F06-06: enterprise = Infinity', () => { expect(TIER_AUDIT_LIMITS.enterprise.auditsPerMonth).toBe(Infinity); });
  it('F06-07: tiers in ascending quota order', () => {
    const limits = [
      TIER_AUDIT_LIMITS.free.auditsPerMonth,
      TIER_AUDIT_LIMITS.starter.auditsPerMonth,
      TIER_AUDIT_LIMITS.growth.auditsPerMonth,
      TIER_AUDIT_LIMITS.agency.auditsPerMonth,
      TIER_AUDIT_LIMITS.agency_pro.auditsPerMonth,
    ];
    for (let i = 1; i < limits.length; i++) {
      expect(limits[i]).toBeGreaterThan(limits[i - 1]);
    }
  });
  it('F06-08: free < starter', () => {
    expect(TIER_AUDIT_LIMITS.free.auditsPerMonth)
      .toBeLessThan(TIER_AUDIT_LIMITS.starter.auditsPerMonth);
  });
});
