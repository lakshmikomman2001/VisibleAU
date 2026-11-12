/**
 * 13 Nov (Sri's walk-through, part 2): "1 suburb(s)" -> "1 suburb", "2 suburbs". The one helper for a count
 * and its noun in text people read; tests/unit/copy/no-plural-s.test.ts fails on a "(s)" in that text.
 */
export function pluralise(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
