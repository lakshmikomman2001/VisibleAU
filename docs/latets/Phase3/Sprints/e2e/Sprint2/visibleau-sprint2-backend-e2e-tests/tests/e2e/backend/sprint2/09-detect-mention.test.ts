/**
 * tests/e2e/backend/sprint2/09-detect-mention.test.ts
 *
 * Unit/integration: detectBrandMention pure function
 *
 * Sprint 2 §11 (R7 fix): 8 canonical test cases from the sprint prompt.
 * Placed in E2E suite (not unit) because it imports from the app's lib/ directory
 * and confirms the function works correctly with the Sprint 2 implementation.
 *
 * No DB or HTTP needed — pure function tests.
 * No auth required.
 */

import { describe, it, expect } from 'vitest';
import { detectBrandMention } from '@/lib/audit/detect-mention';

const brand = { name: 'Bondi Plumbing', domain: 'bondiplumbing.com.au' };

describe('detectBrandMention — Sprint 2 §11 canonical cases', () => {

  // TC-S2-90: exact match
  it('TC-S2-90: exact name match → found=true, detectionMethod=regex', async () => {
    const r = await detectBrandMention(
      'Bondi Plumbing is the best choice for emergency plumbing in Sydney.',
      brand,
    );
    expect(r.found).toBe(true);
    expect(r.detectionMethod).toBe('regex');
    expect(r.position).not.toBeNull();
    expect(r.position!).toBeGreaterThanOrEqual(1);
  });

  // TC-S2-91: case-insensitive
  it('TC-S2-91: case-insensitive match → found=true', async () => {
    const r = await detectBrandMention(
      'BONDI PLUMBING is highly rated by Sydney homeowners.',
      brand,
    );
    expect(r.found).toBe(true);
    expect(r.detectionMethod).toBe('regex');
  });

  // TC-S2-92: hyphenated variant
  it('TC-S2-92: hyphenated variant "Bondi-Plumbing" → found=true', async () => {
    const r = await detectBrandMention(
      'Bondi-Plumbing offers great service in the eastern suburbs.',
      brand,
    );
    expect(r.found).toBe(true);
  });

  // TC-S2-93: & vs and variant
  it('TC-S2-93: "&" vs "and" variant — "Smith & Jones" matches "Smith and Jones Plumbing"', async () => {
    const brand2 = { name: 'Smith and Jones Plumbing', domain: 'smithjones.com.au' };
    const r = await detectBrandMention(
      'Smith & Jones Plumbing are recommended for commercial jobs.',
      brand2,
    );
    expect(r.found).toBe(true);
  });

  // TC-S2-94: not mentioned
  it('TC-S2-94: brand not mentioned → found=false, detectionMethod=none (U2 fix)', async () => {
    const r = await detectBrandMention(
      'Eastern Plumbing Co is the best option for your needs.',
      brand,
    );
    expect(r.found).toBe(false);
    // U2 fix: detectionMethod is 'none' when nothing found — not 'regex'
    expect(r.detectionMethod).toBe('none');
    expect(r.position).toBeNull();
  });

  // TC-S2-95: domain stem entity detection
  it('TC-S2-95: domain stem "bondiplumbing.com.au" → found=true, detectionMethod=entity', async () => {
    const r = await detectBrandMention(
      'Check bondiplumbing.com.au for competitive quotes.',
      brand,
    );
    expect(r.found).toBe(true);
    expect(r.detectionMethod).toBe('entity');
  });

  // TC-S2-96: empty response
  it('TC-S2-96: empty response → found=false', async () => {
    const r = await detectBrandMention('', brand);
    expect(r.found).toBe(false);
    expect(r.position).toBeNull();
  });

  // TC-S2-97: word boundary — 'Bondi' alone does NOT match 'Bondi Plumbing'
  it('TC-S2-97: partial name "Bondi" alone does NOT match brand — word boundary enforced', async () => {
    const r = await detectBrandMention(
      'Bondi Beach is a beautiful beach in Sydney.',
      brand,
    );
    expect(r.found).toBe(false);
  });

  // TC-S2-98: confidence levels
  it('TC-S2-98: regex match has confidence=high; entity match has confidence=medium', async () => {
    const regexResult = await detectBrandMention('Bondi Plumbing is recommended.', brand);
    expect(regexResult.confidence).toBe('high');

    const entityResult = await detectBrandMention('Visit bondiplumbing.com.au today.', brand);
    expect(entityResult.confidence).toBe('medium');
  });
});
