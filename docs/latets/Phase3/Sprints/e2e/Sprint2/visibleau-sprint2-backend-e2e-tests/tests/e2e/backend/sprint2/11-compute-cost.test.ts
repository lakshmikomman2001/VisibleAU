/**
 * tests/e2e/backend/sprint2/11-compute-cost.test.ts
 *
 * Unit/integration: computeCostUsd pure function
 *
 * Sprint 2 §6 (P5 fix): lib/audit/compute-cost.ts — model pricing table.
 * Canonical test cases from Sprint 2 §11.
 */

import { describe, it, expect } from 'vitest';
import { computeCostUsd } from '@/lib/audit/compute-cost';

describe('computeCostUsd — Sprint 2 §11 canonical cases', () => {

  it('TC-S2-110: gpt-4o-mini: 1000 input + 1000 output tokens', () => {
    const cost = computeCostUsd('gpt-4o-mini', 1000, 1000);
    // 1K input × $0.00015 + 1K output × $0.0006 = $0.00075
    expect(cost).toBeCloseTo(0.00075, 6);
  });

  it('TC-S2-111: unknown model returns 0 without throwing', () => {
    expect(() => computeCostUsd('unknown-model-xyz', 1000, 1000)).not.toThrow();
    expect(computeCostUsd('unknown-model-xyz', 1000, 1000)).toBe(0);
  });

  it('TC-S2-112: zero tokens = zero cost for any model', () => {
    expect(computeCostUsd('gpt-4o-mini', 0, 0)).toBe(0);
    expect(computeCostUsd('gpt-4o', 0, 0)).toBe(0);
  });

  it('TC-S2-113: gpt-4o is more expensive than gpt-4o-mini', () => {
    const miniCost = computeCostUsd('gpt-4o-mini', 1000, 1000);
    const fullCost = computeCostUsd('gpt-4o', 1000, 1000);
    expect(fullCost).toBeGreaterThan(miniCost);
  });

  it('TC-S2-114: Sprint 2 10-call audit cost < $0.10 (§12 acceptance)', () => {
    // 10 calls × 85 input tokens + 100 output tokens each (typical mock response)
    let totalCost = 0;
    for (let i = 0; i < 10; i++) {
      totalCost += computeCostUsd('gpt-4o-mini', 85, 100);
    }
    expect(totalCost).toBeLessThan(0.10);
  });

  it('TC-S2-115: claude-3-5-haiku-20241022 pricing (Sprint 3 engine — AC1 fix)', () => {
    // Sprint 3 adds Claude — verify Sprint 2 compute-cost.ts includes the model
    const cost = computeCostUsd('claude-3-5-haiku-20241022', 1000, 1000);
    // Should be non-zero (model is in the pricing table)
    expect(cost).toBeGreaterThan(0);
  });

  it('TC-S2-116: input tokens contribute less than output tokens (output is more expensive)', () => {
    const inputOnly  = computeCostUsd('gpt-4o-mini', 1000, 0);
    const outputOnly = computeCostUsd('gpt-4o-mini', 0, 1000);
    expect(outputOnly).toBeGreaterThan(inputOnly);
  });
});
