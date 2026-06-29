import { describe, it, expect } from 'vitest';

describe('F03: Score display logic (0-100 scale)', () => {
  const roundScore = (v: string | null) =>
    v !== null ? Math.round(Number(v)) : null;

  const formatDimension = (v: string | null) =>
    v !== null ? `${Math.round(Number(v))}/100` : '—';

  const scoreColor = (num: number | null) =>
    num === null ? 'tertiary' : num >= 70 ? 'green' : num >= 40 ? 'amber' : 'red';

  it('F03-01: composite 88.5 rounds to 89', () => {
    expect(roundScore('88.5')).toBe(89);
  });

  it('F03-02: composite 88.4 rounds to 88', () => {
    expect(roundScore('88.4')).toBe(88);
  });

  it('F03-03: dimension 75.3 formats as 75/100', () => {
    expect(formatDimension('75.3')).toBe('75/100');
  });

  it('F03-04: dimension 100.0 formats as 100/100', () => {
    expect(formatDimension('100.0')).toBe('100/100');
  });

  it('F03-05: null score formats as dash', () => {
    expect(formatDimension(null)).toBe('—');
  });

  it('F03-06: score >= 70 is green', () => {
    expect(scoreColor(70)).toBe('green');
    expect(scoreColor(85)).toBe('green');
    expect(scoreColor(100)).toBe('green');
  });

  it('F03-07: score 40-69 is amber', () => {
    expect(scoreColor(40)).toBe('amber');
    expect(scoreColor(55)).toBe('amber');
    expect(scoreColor(69)).toBe('amber');
  });

  it('F03-08: score < 40 is red', () => {
    expect(scoreColor(0)).toBe('red');
    expect(scoreColor(20)).toBe('red');
    expect(scoreColor(39)).toBe('red');
  });

  it('F03-09: null score returns tertiary', () => {
    expect(scoreColor(null)).toBe('tertiary');
  });
});
