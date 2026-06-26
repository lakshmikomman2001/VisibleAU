import { describe, it, expect } from 'vitest';
import { calculateNextRun }     from '@/lib/scheduling/calculate-next-run';

const FROM = new Date('2026-01-07T02:00:00.000Z');

function diffDays(a: Date, b: Date)  { return (b.getTime() - a.getTime()) / 86_400_000; }
function diffHours(a: Date, b: Date) { return (b.getTime() - a.getTime()) / 3_600_000;  }

describe('[S9QA] F02 — calculateNextRun — 5 frequencies', () => {

  it('F02-01: daily -> next is exactly 1 day later', () => {
    const next = calculateNextRun('daily', FROM);
    expect(diffDays(FROM, next)).toBeCloseTo(1, 1);
  });

  it('F02-02: weekly -> next is exactly 7 days later', () => {
    const next = calculateNextRun('weekly', FROM);
    expect(diffDays(FROM, next)).toBeCloseTo(7, 1);
  });

  it('F02-03: 3x_weekly -> next is ceil(7/3) = 3 days later', () => {
    const next = calculateNextRun('3x_weekly', FROM);
    expect(diffDays(FROM, next)).toBeCloseTo(3, 1);
  });

  it('F02-04: 2x_daily -> next is 12 hours later', () => {
    const next = calculateNextRun('2x_daily', FROM);
    expect(diffHours(FROM, next)).toBeCloseTo(12, 1);
  });

  it('F02-05: monthly -> next has same day-of-month, next calendar month', () => {
    const next = calculateNextRun('monthly', FROM);
    expect(next.getTime()).toBeGreaterThan(FROM.getTime());
    expect(next.getUTCDate()).toBe(FROM.getUTCDate());
    expect(next.getUTCMonth()).toBe((FROM.getUTCMonth() + 1) % 12);
  });

  it('F02-06: result is always a future Date object for all valid frequencies', () => {
    const frequencies = ['daily', 'weekly', '3x_weekly', '2x_daily', 'monthly'];
    for (const freq of frequencies) {
      const next = calculateNextRun(freq, FROM);
      expect(next).toBeInstanceOf(Date);
      expect(next.getTime()).toBeGreaterThan(FROM.getTime());
    }
  });

  it('F02-07: later `from` -> later `next` (monotonic)', () => {
    const from2  = new Date(FROM.getTime() + 48 * 3_600_000);
    const next1  = calculateNextRun('daily', FROM);
    const next2  = calculateNextRun('daily', from2);
    expect(next2.getTime()).toBeGreaterThan(next1.getTime());
  });

  it('F02-08: 2x_daily result is always less than daily result (shorter interval)', () => {
    const next_2x  = calculateNextRun('2x_daily', FROM);
    const next_1x  = calculateNextRun('daily',    FROM);
    expect(next_2x.getTime()).toBeLessThan(next_1x.getTime());
  });
});
