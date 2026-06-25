import { describe, it, expect } from 'vitest';

const PRICE_MAP = {
  starter:    { monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY!,    annual: process.env.STRIPE_PRICE_STARTER_ANNUAL! },
  growth:     { monthly: process.env.STRIPE_PRICE_GROWTH_MONTHLY!,     annual: process.env.STRIPE_PRICE_GROWTH_ANNUAL! },
  agency:     { monthly: process.env.STRIPE_PRICE_AGENCY_MONTHLY!,     annual: process.env.STRIPE_PRICE_AGENCY_ANNUAL! },
  agency_pro: { monthly: process.env.STRIPE_PRICE_AGENCY_PRO_MONTHLY!, annual: process.env.STRIPE_PRICE_AGENCY_PRO_ANNUAL! },
} as const;

const ONE_OFF_PRICE_ID = process.env.STRIPE_PRICE_ONE_OFF_AUDIT!;

function getPriceId(tier: string, interval: 'monthly' | 'annual'): string {
  const entry = (PRICE_MAP as any)[tier];
  if (!entry) throw new Error(`Unknown tier: ${tier}`);
  return entry[interval];
}

function tierFromPriceId(priceId: string): string {
  for (const [t, vals] of Object.entries(PRICE_MAP)) {
    if (Object.values(vals).includes(priceId)) return t;
  }
  return 'starter';
}

const tiers     = ['starter', 'growth', 'agency', 'agency_pro'] as const;
const intervals = ['monthly', 'annual'] as const;

describe('F04: Stripe price-map (HA5)', () => {

  it('F04-01: PRICE_MAP has exactly 4 subscription tiers', () => {
    expect(Object.keys(PRICE_MAP)).toEqual(['starter', 'growth', 'agency', 'agency_pro']);
  });

  it('F04-02: ONE_OFF_PRICE_ID is set', () => {
    expect(ONE_OFF_PRICE_ID).toBeTruthy();
  });

  for (const tier of tiers) {
    for (const interval of intervals) {
      it(`F04-03: getPriceId("${tier}", "${interval}") returns a non-empty string`, () => {
        expect(getPriceId(tier, interval)).toBeTruthy();
      });
    }
  }

  it('F04-04: getPriceId throws for unknown tier (enterprise)', () => {
    expect(() => getPriceId('enterprise', 'monthly')).toThrow('Unknown tier');
  });

  it('F04-05: all 8 price IDs are unique (no duplication across tiers)', () => {
    const ids = tiers.flatMap(t => intervals.map(i => getPriceId(t, i)));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('F04-06: tierFromPriceId reverse-lookup — starter monthly', () => {
    const id = getPriceId('starter', 'monthly');
    expect(tierFromPriceId(id)).toBe('starter');
  });

  it('F04-07: tierFromPriceId reverse-lookup — agency_pro annual', () => {
    const id = getPriceId('agency_pro', 'annual');
    expect(tierFromPriceId(id)).toBe('agency_pro');
  });

  it('F04-08: tierFromPriceId unknown priceId defaults to "starter"', () => {
    expect(tierFromPriceId('price_nonexistent_xyz')).toBe('starter');
  });
});
