/**
 * 13 Nov (Sri's walk-through, part 2): a brand was stored as "wrenhomeservices" -- its domain label -- and its
 * audit's questions and pages read that way ("Is wrenhomeservices any good?"). The wizard suggests a
 * readable name where the domain itself shows the words, and asks before a run-together label is used as
 * it is. It never guesses where the words split: "wrenhomeservices" could be "Wren Home Services" or
 * "Heroho Me Services", so it asks instead.
 */

/** The domain's own name: "https://www.wren-home-services.com.au/x" -> "wren-home-services". */
export function domainLabel(domain: string): string {
  return (
    domain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split(/[/?#]/)[0]
      .split(".")[0] ?? ""
  );
}

function titleWord(word: string): string {
  return word.length <= 3 && /^[a-z]+$/.test(word) && /^(?:and|of|the|for)$/.test(word)
    ? word
    : word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * A readable name when the domain shows where its words split -- hyphens or underscores:
 * "wren-home-services.com.au" -> "Wren Home Services"; null when it doesn't ("wrenhomeservices"), or has
 * one word only (the owner writes that word their own way: "Yabby", "YABBY").
 */
export function readableNameFromDomain(domain: string): string | null {
  const words = domainLabel(domain).split(/[-_]+/).filter(Boolean);
  if (words.length < 2) return null;
  return words
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : titleWord(w)))
    .join(" ");
}

/**
 * The name is the domain's label as it is, run together ("wrenhomeservices" for wrenhomeservices.com.au):
 * long enough to be several words (12 letters or more), no spaces. A one-word name that happens to be the
 * domain ("Yabby" for yabby.com.au) is a real name, not this.
 */
export function isRunTogetherDomainName(name: string, domain: string): boolean {
  const n = name.trim();
  if (!n || /\s|-/.test(n)) return false;
  const label = domainLabel(domain).replace(/[-_]/g, "");
  return label.length >= 12 && n.toLowerCase() === label;
}
