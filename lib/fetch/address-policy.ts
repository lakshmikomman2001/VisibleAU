import { isIPv4, isIPv6 } from "node:net";

/**
 * S00B part 2 (LLD 8.6.2, D-SEC1): which hosts and addresses the guarded fetcher (./guarded-fetch.ts) never
 * connects to, whoever asks. A customer's domain, a link or redirect on their site, a sitemap named in their
 * robots.txt, a webhook URL or a logo URL can each point at the server's own network: these are refused before
 * any connection is made.
 *
 * Addresses are checked in their canonical form. The WHATWG URL parser already turns every IPv4 notation
 * (decimal `2130706433`, octal `0177.0.0.1`, hex `0x7f.1`, short `127.1`) into a dotted quad and IPv6 literals
 * into compressed lower case, so `blockedAddressReason` sees `127.0.0.1` for all of them; DNS answers are
 * dotted quads or IPv6 text, which this parses itself.
 */

/** Why an address is refused (logged as the reason; never the address itself). */
export type BlockedAddressReason =
  | "unspecified"
  | "loopback"
  | "private"
  | "link_local"
  | "cgnat"
  | "multicast"
  | "broadcast"
  | "reserved"
  | "documentation"
  | "benchmarking"
  | "ipv4_mapped"
  | "ipv4_compatible"
  | "nat64"
  | "6to4"
  | "teredo"
  | "unique_local"
  | "site_local"
  | "discard"
  | "metadata"
  | "not_an_address";

interface Range {
  /** The network as a number (32-bit for IPv4, 128-bit for IPv6). */
  base: bigint;
  bits: number;
  reason: BlockedAddressReason;
}

function v4Range(cidr: string, reason: BlockedAddressReason): Range {
  const [ip, bits] = cidr.split("/");
  return { base: ipv4ToBigInt(ip) as bigint, bits: Number(bits), reason };
}

function v6Range(cidr: string, reason: BlockedAddressReason): Range {
  const [ip, bits] = cidr.split("/");
  return { base: ipv6ToBigInt(ip) as bigint, bits: Number(bits), reason };
}

/** IPv4 ranges that are never a public website (IANA special-purpose registry, RFC 6890 and successors). */
const IPV4_BLOCKED: readonly Range[] = [
  v4Range("169.254.169.254/32", "metadata"), // AWS, GCP, Azure, DigitalOcean, Oracle instance metadata
  v4Range("100.100.100.200/32", "metadata"), // Alibaba Cloud instance metadata (inside CGNAT too)
  v4Range("0.0.0.0/8", "unspecified"),
  v4Range("10.0.0.0/8", "private"),
  v4Range("100.64.0.0/10", "cgnat"),
  v4Range("127.0.0.0/8", "loopback"),
  v4Range("169.254.0.0/16", "link_local"),
  v4Range("172.16.0.0/12", "private"),
  v4Range("192.0.0.0/24", "reserved"),
  v4Range("192.0.2.0/24", "documentation"),
  v4Range("192.88.99.0/24", "reserved"),
  v4Range("192.168.0.0/16", "private"),
  v4Range("198.18.0.0/15", "benchmarking"),
  v4Range("198.51.100.0/24", "documentation"),
  v4Range("203.0.113.0/24", "documentation"),
  v4Range("224.0.0.0/4", "multicast"),
  v4Range("255.255.255.255/32", "broadcast"),
  v4Range("240.0.0.0/4", "reserved"),
];

/** IPv6 ranges that are never a public website. Ranges that carry an IPv4 address are handled in code. */
const IPV6_BLOCKED: readonly Range[] = [
  v6Range("fd00:ec2::254/128", "metadata"), // AWS instance metadata over IPv6 (inside ULA too)
  v6Range("::/128", "unspecified"),
  v6Range("::1/128", "loopback"),
  v6Range("::ffff:0:0/96", "ipv4_mapped"),
  v6Range("::/96", "ipv4_compatible"),
  v6Range("64:ff9b:1::/48", "nat64"),
  v6Range("100::/64", "discard"),
  v6Range("2001::/32", "teredo"),
  v6Range("2001:2::/48", "benchmarking"),
  v6Range("2001:db8::/32", "documentation"),
  v6Range("fc00::/7", "unique_local"),
  v6Range("fe80::/10", "link_local"),
  v6Range("fec0::/10", "site_local"),
  v6Range("ff00::/8", "multicast"),
];

/** NAT64 (RFC 6052) and 6to4 (RFC 3056) carry an IPv4 address; they're refused when that one would be. */
const NAT64_WELL_KNOWN = v6Range("64:ff9b::/96", "nat64");
const SIX_TO_FOUR = v6Range("2002::/16", "6to4");

/** Names that are never a public website, whatever they resolve to. */
const BLOCKED_NAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
  "metadata",
]);
const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa", ".localdomain"];

function inRange(value: bigint, totalBits: number, range: Range): boolean {
  const shift = BigInt(totalBits - range.bits);
  return value >> shift === range.base >> shift;
}

/** A dotted quad as a 32-bit number, or null if it isn't one. */
export function ipv4ToBigInt(address: string): bigint | null {
  if (!isIPv4(address)) return null;
  return address
    .split(".")
    .reduce((acc, part) => (acc << BigInt(8)) | BigInt(Number(part)), BigInt(0));
}

/** An IPv6 address (any valid text form, with or without an IPv4 tail or zone) as a 128-bit number. */
export function ipv6ToBigInt(address: string): bigint | null {
  const withoutZone = address.replace(/%.*$/, "");
  if (!isIPv6(withoutZone)) return null;
  let text = withoutZone.toLowerCase();
  // An IPv4 tail ("::ffff:127.0.0.1") becomes two hex groups.
  const tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (tail) {
    const v4 = ipv4ToBigInt(tail[1]);
    if (v4 === null) return null;
    const hi = Number(v4 >> BigInt(16)).toString(16);
    const lo = Number(v4 & BigInt(0xffff)).toString(16);
    text = `${text.slice(0, -tail[1].length)}${hi}:${lo}`;
  }
  const [head, rest] = text.split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = rest === undefined ? [] : rest ? rest.split(":") : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  const groups =
    rest === undefined
      ? headGroups
      : [...headGroups, ...Array.from({ length: missing }, () => "0"), ...tailGroups];
  if (groups.length !== 8) return null;
  return groups.reduce((acc, g) => (acc << BigInt(16)) | BigInt(Number.parseInt(g, 16)), BigInt(0));
}

function v4FromBigInt(value: bigint): string {
  return [24, 16, 8, 0].map((s) => Number((value >> BigInt(s)) & BigInt(255))).join(".");
}

function ipv4Reason(address: string): BlockedAddressReason | null {
  const value = ipv4ToBigInt(address);
  if (value === null) return "not_an_address";
  return IPV4_BLOCKED.find((r) => inRange(value, 32, r))?.reason ?? null;
}

function ipv6Reason(address: string): BlockedAddressReason | null {
  const value = ipv6ToBigInt(address);
  if (value === null) return "not_an_address";
  const listed = IPV6_BLOCKED.find((r) => inRange(value, 128, r));
  if (listed) return listed.reason;
  if (inRange(value, 128, NAT64_WELL_KNOWN)) {
    const embedded = ipv4Reason(v4FromBigInt(value & BigInt(0xffffffff)));
    return embedded ? "nat64" : null;
  }
  if (inRange(value, 128, SIX_TO_FOUR)) {
    const embedded = ipv4Reason(v4FromBigInt((value >> BigInt(80)) & BigInt(0xffffffff)));
    return embedded ? "6to4" : null;
  }
  return null;
}

/**
 * Why this IP address (IPv4 dotted quad or IPv6 text, brackets allowed) must not be connected to, or null for a
 * public address. Anything that isn't an IP address is refused ("not_an_address").
 */
export function blockedAddressReason(address: string): BlockedAddressReason | null {
  const bare = address.replace(/^\[|\]$/g, "");
  if (isIPv4(bare)) return ipv4Reason(bare);
  if (isIPv6(bare.replace(/%.*$/, ""))) return ipv6Reason(bare);
  return "not_an_address";
}

/** Why this host name must not be fetched before it's even resolved, or null. IP literals: see the address. */
export function blockedHostnameReason(hostname: string): BlockedAddressReason | null {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_NAMES.has(host)) return host === "localhost" ? "loopback" : "metadata";
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix)))
    return host.endsWith(".localhost") ? "loopback" : "private";
  return null;
}

/** An IP literal host from a URL ("127.0.0.1", "[::1]"), without brackets; null for a name. */
export function ipLiteral(hostname: string): string | null {
  const bare = hostname.replace(/^\[|\]$/g, "");
  return isIPv4(bare) || isIPv6(bare) ? bare : null;
}
