/**
 * "lakshmi.kom08@gmail.com" -> "lak…08@gmail.com": enough to tell two addresses apart in a log or on a screen,
 * never the full address. No imports: the "Check your inbox" screen shows it.
 *
 * Mock-gate and retention follow-ups (9 Nov), part 7 -- it used to keep only the first letter ("l***@gmail.com"),
 * so Sri's wrong-account invite page said "You're signed in as l***@gmail.com. This invite is for l***@gmail.com."
 * for two different addresses. Now the first 3 and last 2 characters before the @ show. A short local part (6
 * characters or fewer) stays mostly hidden: half of it shows at most. Never all of it. Where two masked addresses
 * share a screen, maskEmailsDistinct shows one more character on each until they differ. This is the only masking
 * code (tests/unit/email/mask.test.ts scans for others).
 */
const SHOWN = 5; // the first 3 and the last 2
const SHORT_LOCAL_PART = 6;

/** The local part with `shown` of its characters kept: ceil(shown / 2) at the start, floor(shown / 2) at the end. */
function maskWith(address: string, extra: number): string {
  const at = address.lastIndexOf("@");
  if (at <= 0) return "…";
  const local = address.slice(0, at);
  // Already masked (a provider's message masked once for the result, again for the log): left as it is.
  if (local.includes("…")) return address;
  const len = local.length;
  const base = len <= SHORT_LOCAL_PART ? Math.floor(len / 2) : SHOWN;
  const shown = Math.max(0, Math.min(base + extra, len - 1));
  const start = Math.ceil(shown / 2);
  const end = shown - start;
  return `${local.slice(0, start)}…${end > 0 ? local.slice(len - end) : ""}${address.slice(at)}`;
}

export function maskEmail(address: string): string {
  return maskWith(address, 0);
}

/**
 * Two addresses shown together ("You're signed in as …. This invite is for ….") -- each masked as maskEmail does,
 * then one more character on each until the masked forms differ. Never a whole local part.
 */
export function maskEmailsDistinct(a: string, b: string): [string, string] {
  const longest = Math.max(a.indexOf("@"), b.indexOf("@"));
  let pair: [string, string] = [maskWith(a, 0), maskWith(b, 0)];
  for (
    let extra = 1;
    pair[0] === pair[1] && a.toLowerCase() !== b.toLowerCase() && extra <= longest;
    extra++
  ) {
    pair = [maskWith(a, extra), maskWith(b, extra)];
  }
  return pair;
}
