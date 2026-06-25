import { describe, it, expect } from 'vitest';

const GST_RATE = 0.10;

function addGst(exGst: number): number {
  return Math.round(exGst * (1 + GST_RATE) * 100) / 100;
}
function removeGst(incGst: number): number {
  return Math.round((incGst / (1 + GST_RATE)) * 100) / 100;
}
function displayPrice(exGstAud: number, opts: { incGst: boolean; interval?: 'monthly'|'annual' }): string {
  const price  = opts.incGst ? addGst(exGstAud) : exGstAud;
  const suffix = opts.incGst ? ' inc. GST' : ' ex. GST';
  const period = opts.interval === 'annual' ? '/yr' : '/mo';
  return `A$${price.toFixed(0)}${period}${suffix}`;
}

describe('F05: GST math and display (HC2, HG1 — no double-charge)', () => {
  it('F05-01: addGst(90) → 99', () => { expect(addGst(90)).toBe(99); });
  it('F05-02: addGst(270) → 297', () => { expect(addGst(270)).toBe(297); });
  it('F05-03: addGst(450) → 495', () => { expect(addGst(450)).toBe(495); });
  it('F05-04: addGst(1350) → 1485', () => { expect(addGst(1350)).toBe(1485); });
  it('F05-05: removeGst(99) → 90', () => { expect(removeGst(99)).toBe(90); });
  it('F05-06: removeGst(297) → 270', () => { expect(removeGst(297)).toBe(270); });
  it('F05-07: displayPrice(90, incGst=true, monthly) → "A$99/mo inc. GST"', () => {
    expect(displayPrice(90, { incGst: true, interval: 'monthly' })).toBe('A$99/mo inc. GST');
  });
  it('F05-08: displayPrice(90, incGst=false, monthly) → "A$90/mo ex. GST"', () => {
    expect(displayPrice(90, { incGst: false, interval: 'monthly' })).toBe('A$90/mo ex. GST');
  });
  it('F05-09: displayPrice(900, incGst=true, annual) → "A$990/yr inc. GST"', () => {
    expect(displayPrice(900, { incGst: true, interval: 'annual' })).toBe('A$990/yr inc. GST');
  });
  it('F05-10: PRD §7 — annual = 10× monthly (2 months free)', () => {
    const monthlyExGst = 90;
    const annualExGst  = monthlyExGst * 10;
    expect(annualExGst).toBe(900);
    expect(addGst(annualExGst)).toBe(990);
  });
});
