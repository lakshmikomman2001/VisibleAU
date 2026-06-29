import { describe, it, expect } from 'vitest';
import { CITABILITY_METHODS, getMethodsData } from '@/lib/methodology/methods';

describe('F01: Methodology data integrity', () => {
  it('F01-01: every method has a citationUrl', () => {
    for (const m of CITABILITY_METHODS) {
      expect(m.citationUrl, `${m.id} missing citationUrl`).toBeTruthy();
    }
  });

  it('F01-02: no fabricated "AutoGEO" or "ICLR 2026" citations', () => {
    for (const m of CITABILITY_METHODS) {
      expect(m.citation).not.toMatch(/AutoGEO/i);
      expect(m.citation).not.toMatch(/ICLR 2026/i);
      expect(m.description).not.toMatch(/AutoGEO/i);
    }
  });

  it('F01-03: citationUrls point to real domains', () => {
    const allowedDomains = [
      'arxiv.org', 'ahrefs.com', 'foglift.io', 'leapd.ai',
      'superlines.io', 'businesswire.com',
    ];
    for (const m of CITABILITY_METHODS) {
      if (!m.citationUrl) continue;
      const url = new URL(m.citationUrl);
      const matched = allowedDomains.some(d => url.hostname.endsWith(d));
      expect(matched, `${m.id} has unknown domain: ${url.hostname}`).toBe(true);
    }
  });

  it('F01-04: GEO-bench numbers labelled as GEO-bench', () => {
    const geoMethods = CITABILITY_METHODS.filter(m =>
      m.citationUrl?.includes('arxiv.org/abs/2311.09735') &&
      m.effectSizeDelta.includes('%')
    );
    for (const m of geoMethods) {
      expect(m.effectSizeDelta, `${m.id} GEO number not labelled`).toMatch(/GEO-bench/);
    }
  });

  it('F01-05: Ahrefs findings labelled as correlations', () => {
    const ahrefsMethods = CITABILITY_METHODS.filter(m =>
      m.citationUrl?.includes('ahrefs.com')
    );
    for (const m of ahrefsMethods) {
      expect(
        m.effectSizeDelta.toLowerCase().includes('correlat') ||
        m.description.toLowerCase().includes('correlation'),
        `${m.id} Ahrefs finding not labelled as correlation`
      ).toBe(true);
    }
  });

  it('F01-06: getMethodsData returns correct shape', () => {
    const { all, total, top10 } = getMethodsData();
    expect(total).toBe(CITABILITY_METHODS.length);
    expect(all).toHaveLength(total);
    expect(top10).toHaveLength(Math.min(10, total));
    expect(top10).toEqual(all.slice(0, 10));
  });

  it('F01-07: every method has valid dimension', () => {
    const validDimensions = ['frequency', 'position', 'sentiment', 'context', 'accuracy'];
    for (const m of CITABILITY_METHODS) {
      expect(validDimensions).toContain(m.dimension);
    }
  });

  it('F01-08: every method has valid effort', () => {
    const validEfforts = ['low', 'medium', 'high'];
    for (const m of CITABILITY_METHODS) {
      expect(validEfforts).toContain(m.effort);
    }
  });

  it('F01-09: no duplicate method IDs', () => {
    const ids = CITABILITY_METHODS.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
