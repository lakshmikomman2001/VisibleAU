/**
 * Vunnara Build 1, Part E.1: a brand's prompt pack is frozen and
 * reused, so selecting it can never depend on Math.random() -- the
 * same seed must always produce the same order. seededShuffle swaps
 * in a tiny deterministic PRNG (mulberry32, seeded by an FNV-1a hash
 * of the seed string) for the Fisher-Yates shuffle buildPromptPack
 * used to do with Math.random().
 */
function seedFromString(s: string): number {
  let h = 2166136261 >>> 0; // FNV-1a basis
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(arr: T[], seed: string): T[] {
  const rand = mulberry32(seedFromString(seed));
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
