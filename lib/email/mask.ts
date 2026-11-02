/**
 * "name@example.com" -> "n***@example.com": enough to tell two recipients apart
 * in a log or on a screen, never the full address. No imports: the "Check your
 * inbox" screen shows it.
 */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${address[0]}***${address.slice(at)}`;
}
