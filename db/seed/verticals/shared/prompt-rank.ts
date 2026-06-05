export function assignRanks<T extends { rank?: number }>(prompts: T[]): (T & { rank: number })[] {
  return prompts.map((p, i) => ({ ...p, rank: p.rank ?? i + 1 }));
}
