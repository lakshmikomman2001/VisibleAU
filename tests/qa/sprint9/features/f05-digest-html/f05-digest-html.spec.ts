import { describe, it, expect } from 'vitest';
import { buildDigestHtml }       from '@/lib/digest/compose';

const BRANDS = [
  { brandName: '[S9QA] Bondi Plumbing',   scoreComposite: 73 },
  { brandName: '[S9QA] Coogee Electrics', scoreComposite: 61 },
  { brandName: '[S9QA] Score-null Brand', scoreComposite: null },
];

describe('[S9QA] F05 — buildDigestHtml — portfolio weekly email (T3)', () => {

  it('F05-01: returns non-empty HTML string', () => {
    const html = buildDigestHtml(BRANDS);
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(200);
    expect(html).toMatch(/<html/i);
  });

  it('F05-02: contains all brand names', () => {
    const html = buildDigestHtml(BRANDS);
    expect(html).toContain('[S9QA] Bondi Plumbing');
    expect(html).toContain('[S9QA] Coogee Electrics');
    expect(html).toContain('[S9QA] Score-null Brand');
  });

  it('F05-03: numeric scores rendered', () => {
    const html = buildDigestHtml(BRANDS);
    expect(html).toContain('73');
    expect(html).toContain('61');
  });

  it('F05-04: null scoreComposite renders dash or N/A — not the text "null"', () => {
    const html = buildDigestHtml(BRANDS);
    expect(html).not.toMatch(/>\s*null\s*</);
  });

  it('F05-05: contains /settings/notifications unsubscribe link (T3)', () => {
    const html = buildDigestHtml(BRANDS);
    expect(html).toContain('settings/notifications');
  });

  it('F05-06: empty brand array -> still returns valid HTML', () => {
    const html = buildDigestHtml([]);
    expect(html).toMatch(/<html/i);
    expect(html.length).toBeGreaterThan(50);
  });

  it('F05-07: single brand renders without error', () => {
    const html = buildDigestHtml([{ brandName: '[S9QA] Solo', scoreComposite: 88 }]);
    expect(html).toContain('[S9QA] Solo');
    expect(html).toContain('88');
  });
});
