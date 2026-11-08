/**
 * Mock-gate and retention follow-ups (9 Nov), part 9 -- "Never show 0 for something that wasn't measured". Omega
 * Services' Trust page showed "Overall Trust Score 0/100" with an empty bar while its own text said no trust data
 * was available; a score nobody measured rendered as a measured zero.
 *
 * The one rule, for every score a page, card, PDF or email shows:
 * - not measured (null, undefined, or not a number) reads NOT_MEASURED -- no number, no bar;
 * - a measured 0 is 0, shown with what was measured.
 * A display never writes `score ?? 0`: it calls measured() and renders NOT_MEASURED for { measured: false }
 * (tests/unit/scoring/not-measured.test.tsx scans for the old pattern).
 */
export const NOT_MEASURED = "Not measured yet";

export type Measured = { measured: false } | { measured: true; value: number };

/** A stored or computed score as measured or not: any finite number (0 included) is measured. */
export function measured(value: number | string | null | undefined): Measured {
  if (value === null || value === undefined || value === "") return { measured: false };
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? { measured: true, value: n } : { measured: false };
}

/** "12/100", "0/100" or "Not measured yet". */
export function scoreText(value: number | string | null | undefined, max?: number): string {
  const m = measured(value);
  if (!m.measured) return NOT_MEASURED;
  return max === undefined ? String(m.value) : `${m.value}/${max}`;
}
