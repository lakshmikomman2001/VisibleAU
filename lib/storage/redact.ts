/**
 * URGENT PDF reports (1 Nov), part 0 -- strips anything that looks like a
 * URL, key, token or JWT from an error's text before it goes into a thrown
 * error (and so into Inngest's run view and the logs). A bare hostname is
 * kept ("getaddrinfo ENOTFOUND <ref>.supabase.co"): it isn't a secret, and
 * it says which project the app is pointing at.
 */
const REDACTIONS: Array<[RegExp, string]> = [
  // Any scheme://... -- https, postgres, redis -- with its path, query and any credentials.
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi, "[url]"],
  // A JWT (Supabase's legacy anon / service-role keys are JWTs).
  [/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, "[jwt]"],
  // Supabase's newer keys.
  [/\bsb_(secret|publishable)_[A-Za-z0-9_-]+/gi, "[key]"],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [token]"],
  [
    /\b(api[_-]?key|token|access_token|secret|password|signature|key)=[^\s&"';,]+/gi,
    "$1=[redacted]",
  ],
  // Any other long opaque string (a 20-character project ref stays).
  [/\b[A-Za-z0-9_-]{32,}\b/g, "[token]"],
];

export function redactSecrets(text: string): string {
  return REDACTIONS.reduce(
    (out, [pattern, replacement]) => out.replace(pattern, replacement),
    text,
  );
}
