/**
 * tests/e2e/backend/sprint3/07-dimension-scoring.test.ts
 *
 * Sprint 3 §7 + §12 — Dimension scoring pure function tests.
 * Critical: commodified=25 NOT 0 (Round 29 fix — anti-pattern §13).
 * AA2 fix: these test bodies were previously missing; they catch regressions.
 */

import { describe, it, expect } from 'vitest';
import { frequencyDimensionScore }  from '@/lib/scoring/frequency';
import { positionDimensionScore }   from '@/lib/scoring/position';
import { sentimentDimensionScore }  from '@/lib/scoring/sentiment';
import { contextDimensionScore }    from '@/lib/scoring/context';
import { accuracyDimensionScore }   from '@/lib/scoring/accuracy';
import { compositeVisibilityScore } from '@/lib/scoring/composite';
import { DIMENSION_WEIGHTS, CONTEXT_SCORE_MAP, SENTIMENT_SCORE_MAP } from '@/lib/scoring/constants';

describe('Sprint 3 §7 — Dimension scoring', () => {

  // ── CONTEXT_SCORE_MAP constants (most critical — Round 29 fix) ─────────────

  it('TC-S3-90: CRITICAL — commodified = 25, NOT 0 (Round 29 fix — do not regress)', () => {
    // This is the most important constant assertion in Sprint 3.
    // An earlier version had commodified=0 which was corrected in Round 29.
    expect(CONTEXT_SCORE_MAP.commodified).toBe(25);
  });

  it('TC-S3-91: contextDimensionScore(["commodified"]) = 25, NOT 0', () => {
    expect(contextDimensionScore(['commodified'])).toBe(25);
  });

  it('TC-S3-92: Full CONTEXT_SCORE_MAP: recommended=100, listed=50, mentioned=25, commodified=25', () => {
    expect(CONTEXT_SCORE_MAP.recommended).toBe(100);
    expect(CONTEXT_SCORE_MAP.listed).toBe(50);
    expect(CONTEXT_SCORE_MAP.mentioned).toBe(25);
    expect(CONTEXT_SCORE_MAP.commodified).toBe(25);
  });

  // ── Frequency dimension ────────────────────────────────────────────────────

  it('TC-S3-93: frequencyDimensionScore(0, 0) = 0 (zero denominator guard)', () => {
    expect(frequencyDimensionScore(0, 0)).toBe(0);
  });

  it('TC-S3-94: frequencyDimensionScore(10, 10) = 100 (all calls mention brand)', () => {
    expect(frequencyDimensionScore(10, 10)).toBe(100);
  });

  it('TC-S3-95: frequencyDimensionScore(28, 200) ≈ 14 (PRD §7: 14% mention rate reference)', () => {
    expect(frequencyDimensionScore(28, 200)).toBeCloseTo(14, 1);
  });

  it('TC-S3-96: frequencyDimensionScore(0, 200) = 0 (no mentions)', () => {
    expect(frequencyDimensionScore(0, 200)).toBe(0);
  });

  // ── Position dimension ─────────────────────────────────────────────────────

  it('TC-S3-97: positionDimensionScore([]) = 0 (no mentions)', () => {
    expect(positionDimensionScore([])).toBe(0);
  });

  it('TC-S3-98: positionDimensionScore([null, null]) = 0 (all not-mentioned)', () => {
    expect(positionDimensionScore([null, null])).toBe(0);
  });

  it('TC-S3-99: positionDimensionScore([1]) = 100 (position 1 = highest score)', () => {
    expect(positionDimensionScore([1])).toBe(100);
  });

  it('TC-S3-100: positionDimensionScore([11]) = 50 (mid-range position)', () => {
    // (1 - (11-1)/20) × 100 = (1 - 0.5) × 100 = 50
    expect(positionDimensionScore([11])).toBeCloseTo(50, 1);
  });

  it('TC-S3-101: positionDimensionScore([21]) = 0 (position beyond max cap)', () => {
    expect(positionDimensionScore([21])).toBe(0);
  });

  // ── Sentiment dimension ────────────────────────────────────────────────────

  it('TC-S3-102: SENTIMENT_SCORE_MAP: positive=100, neutral=50, negative=0', () => {
    expect(SENTIMENT_SCORE_MAP.positive).toBe(100);
    expect(SENTIMENT_SCORE_MAP.neutral).toBe(50);
    expect(SENTIMENT_SCORE_MAP.negative).toBe(0);
  });

  it('TC-S3-103: sentimentDimensionScore([]) = 0', () => {
    expect(sentimentDimensionScore([])).toBe(0);
  });

  it('TC-S3-104: sentimentDimensionScore(["positive"]) = 100', () => {
    expect(sentimentDimensionScore(['positive'])).toBe(100);
  });

  it('TC-S3-105: sentimentDimensionScore(["positive", "negative"]) = 50 (average)', () => {
    expect(sentimentDimensionScore(['positive', 'negative'])).toBe(50);
  });

  // ── Context dimension ──────────────────────────────────────────────────────

  it('TC-S3-106: contextDimensionScore([]) = 0', () => {
    expect(contextDimensionScore([])).toBe(0);
  });

  it('TC-S3-107: contextDimensionScore(["recommended"]) = 100', () => {
    expect(contextDimensionScore(['recommended'])).toBe(100);
  });

  it('TC-S3-108: contextDimensionScore(["listed"]) = 50', () => {
    expect(contextDimensionScore(['listed'])).toBe(50);
  });

  it('TC-S3-109: contextDimensionScore(["recommended", "listed"]) = 75 (average)', () => {
    expect(contextDimensionScore(['recommended', 'listed'])).toBe(75);
  });

  // ── Accuracy dimension ─────────────────────────────────────────────────────

  it('TC-S3-110: accuracyDimensionScore — no mentions → 0', () => {
    const rows = [{ brandMentioned: false, citedSources: [] }];
    expect(accuracyDimensionScore(rows)).toBe(0);
  });

  it('TC-S3-111: accuracyDimensionScore — mention with source → 100', () => {
    const rows = [{ brandMentioned: true, citedSources: [{ domain: 'example.com', url: 'https://example.com' }] }];
    expect(accuracyDimensionScore(rows)).toBe(100);
  });

  it('TC-S3-112: accuracyDimensionScore — mention without source → 0', () => {
    const rows = [{ brandMentioned: true, citedSources: [] }];
    expect(accuracyDimensionScore(rows)).toBe(0);
  });

  // ── Composite visibility score ─────────────────────────────────────────────

  it('TC-S3-113: DIMENSION_WEIGHTS sum to exactly 1.00', () => {
    const sum = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('TC-S3-114: compositeVisibilityScore — all-100 inputs → 100', () => {
    expect(compositeVisibilityScore({ frequency: 100, position: 100, sentiment: 100, context: 100, accuracy: 100 })).toBe(100);
  });

  it('TC-S3-115: compositeVisibilityScore — all-0 inputs → 0', () => {
    expect(compositeVisibilityScore({ frequency: 0, position: 0, sentiment: 0, context: 0, accuracy: 0 })).toBe(0);
  });

  it('TC-S3-116: compositeVisibilityScore — prototype fixture values ≈ 63.4 (AA5 fix)', () => {
    // AA5 fix: Frequency=14, Position=90, Sentiment=79, Context=73, Accuracy=71
    // 14×0.25 + 90×0.25 + 79×0.20 + 73×0.15 + 71×0.15
    // = 3.5 + 22.5 + 15.8 + 10.95 + 10.65 = 63.4
    const result = compositeVisibilityScore({ frequency: 14, position: 90, sentiment: 79, context: 73, accuracy: 71 });
    expect(result).toBeCloseTo(63.4, 1);
  });

  it('TC-S3-117: compositeVisibilityScore — DIMENSION_WEIGHTS per spec (25/25/20/15/15)', () => {
    expect(DIMENSION_WEIGHTS.frequency).toBe(0.25);
    expect(DIMENSION_WEIGHTS.position).toBe(0.25);
    expect(DIMENSION_WEIGHTS.sentiment).toBe(0.20);
    expect(DIMENSION_WEIGHTS.context).toBe(0.15);
    expect(DIMENSION_WEIGHTS.accuracy).toBe(0.15);
  });
});
