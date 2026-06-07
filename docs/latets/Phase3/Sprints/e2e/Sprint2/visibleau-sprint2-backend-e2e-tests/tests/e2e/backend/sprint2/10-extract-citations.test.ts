/**
 * tests/e2e/backend/sprint2/10-extract-citations.test.ts
 *
 * Unit/integration: extractCitations pure function
 *
 * Sprint 2 §6.6 (P4 fix): lib/audit/extract-citations.ts — 3-format URL extraction.
 * Canonical test cases from Sprint 2 §11.
 */

import { describe, it, expect } from 'vitest';
import { extractCitations } from '@/lib/audit/extract-citations';

describe('extractCitations — Sprint 2 §11 canonical cases', () => {

  it('TC-S2-100: extracts markdown link URL', () => {
    const result = extractCitations(
      'See [Bondi Plumbing](https://bondiplumbing.com.au) for details.',
    );
    expect(result).toContainEqual(
      expect.objectContaining({ domain: 'bondiplumbing.com.au' }),
    );
  });

  it('TC-S2-101: extracts bare https:// URL', () => {
    const result = extractCitations(
      'Visit https://bondiplumbing.com.au for a quote.',
    );
    expect(result).toContainEqual(
      expect.objectContaining({ domain: 'bondiplumbing.com.au' }),
    );
  });

  it('TC-S2-102: extracts domain-only .com.au reference', () => {
    const result = extractCitations(
      'You can also try bondiplumbing.com.au directly.',
    );
    expect(result).toContainEqual(
      expect.objectContaining({ domain: 'bondiplumbing.com.au' }),
    );
  });

  it('TC-S2-103: deduplicates same domain across formats', () => {
    const result = extractCitations(
      '[Bondi Plumbing](https://bondiplumbing.com.au) and also bondiplumbing.com.au',
    );
    const matches = result.filter((s) => s.domain === 'bondiplumbing.com.au');
    expect(matches).toHaveLength(1);
  });

  it('TC-S2-104: empty response returns empty array', () => {
    expect(extractCitations('')).toEqual([]);
  });

  it('TC-S2-105: strips www. prefix from domain', () => {
    const result = extractCitations('Visit https://www.bondiplumbing.com.au today.');
    const match = result.find((s) => s.domain === 'bondiplumbing.com.au');
    expect(match).toBeDefined();
  });

  it('TC-S2-106: extracts multiple distinct domains', () => {
    const result = extractCitations(
      'Options include https://bondiplumbing.com.au and https://sydneyplumbers.com.au',
    );
    const domains = result.map((s) => s.domain);
    expect(domains).toContain('bondiplumbing.com.au');
    expect(domains).toContain('sydneyplumbers.com.au');
  });

  it('TC-S2-107: cited source has both domain and url fields', () => {
    const result = extractCitations('See https://bondiplumbing.com.au for details.');
    expect(result[0]).toHaveProperty('domain');
    expect(result[0]).toHaveProperty('url');
    expect(result[0].url).toContain('bondiplumbing.com.au');
  });

  it('TC-S2-108: plain text without URLs returns empty array', () => {
    const result = extractCitations(
      'I recommend Bondi Plumbing for your needs. They have great reviews.',
    );
    // No URLs → no cited sources (brand mention detection is separate)
    expect(result).toEqual([]);
  });
});
