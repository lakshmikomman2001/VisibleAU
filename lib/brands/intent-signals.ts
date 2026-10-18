/**
 * Vunnara Build 1, Part C.7: our API calls carry no real user location
 * (Build 2 will add an explicit per-level location to grounded search
 * requests), so a classifier-supplied intentSignal phrased as "near me"
 * doesn't ask anything coherent -- the model has no "me" to be near.
 * Strips the location-dependent phrase from each signal (keeping the
 * rest, if any remains meaningful) rather than dropping the whole
 * signal outright, since most real intentSignals are still useful
 * without it ("plumber near me Bondi" -> "plumber Bondi").
 */
const LOCATION_DEPENDENT_RE = /\b(?:near me|nearby|in my area|close to me)\b/gi;

export function sanitizeIntentSignal(signal: string): string | null {
  // .replace() with a global regex doesn't read/mutate lastIndex across
  // calls the way .test()/.exec() would -- safe to call repeatedly with
  // this one shared module-level regex, including as a no-op when
  // nothing matches.
  const stripped = signal.replace(LOCATION_DEPENDENT_RE, "").replace(/\s+/g, " ").trim();
  return stripped.length > 0 ? stripped : null;
}

export function sanitizeIntentSignals(signals: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const signal of signals) {
    const cleaned = sanitizeIntentSignal(signal);
    if (cleaned === null) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}
