/**
 * S00B part 2: the address rules on their own, including the text forms DNS answers come in (which never pass
 * through the URL parser): IPv4 tails on IPv6, zone ids, upper case, full and compressed forms.
 */
import { describe, expect, it } from "vitest";
import {
  blockedAddressReason,
  blockedHostnameReason,
  ipLiteral,
  ipv6ToBigInt,
} from "@/lib/fetch/address-policy";

describe("blockedAddressReason", () => {
  it.each([
    ["127.0.0.1", "loopback"],
    ["127.255.255.255", "loopback"],
    ["::ffff:127.0.0.1", "ipv4_mapped"],
    ["::FFFF:10.0.0.1", "ipv4_mapped"],
    ["0:0:0:0:0:ffff:7f00:1", "ipv4_mapped"],
    ["fe80::1%eth0", "link_local"],
    ["FE80:0000:0000:0000:0000:0000:0000:0001", "link_local"],
    ["[::1]", "loopback"],
    ["0000:0000:0000:0000:0000:0000:0000:0001", "loopback"],
    ["fd00:ec2:0:0:0:0:0:254", "metadata"],
    ["169.254.169.254", "metadata"],
    ["64:ff9b::192.168.1.1", "nat64"],
    ["2002:c0a8:0101::1", "6to4"],
  ])("%s → %s", (address, reason) => {
    expect(blockedAddressReason(address)).toBe(reason);
  });

  it.each([
    "93.184.215.14",
    "8.8.8.8",
    "1.1.1.1",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
    "64:ff9b::808:808",
    "2002:808:808::1",
  ])("%s is public", (address) => {
    expect(blockedAddressReason(address)).toBeNull();
  });

  it("anything that isn't an IP address is refused", () => {
    for (const x of ["", "example.com", "1.2.3", "1.2.3.4.5", "::g", "256.1.1.1"]) {
      expect(blockedAddressReason(x)).toBe("not_an_address");
    }
  });

  it("parses every IPv6 text form to the same number", () => {
    const forms = ["::1", "0::1", "0:0:0:0:0:0:0:1", "::0:1"];
    const values = forms.map((f) => ipv6ToBigInt(f));
    expect(new Set(values.map(String)).size).toBe(1);
    expect(ipv6ToBigInt("::ffff:1.2.3.4")).toBe(ipv6ToBigInt("::ffff:102:304"));
  });
});

describe("host names and literals", () => {
  it("names that are never a public site", () => {
    expect(blockedHostnameReason("LOCALHOST")).toBe("loopback");
    expect(blockedHostnameReason("localhost.")).toBe("loopback");
    expect(blockedHostnameReason("x.localhost")).toBe("loopback");
    expect(blockedHostnameReason("metadata.google.internal")).toBe("metadata");
    expect(blockedHostnameReason("vault.corp.internal")).toBe("private");
    expect(blockedHostnameReason("example.com.au")).toBeNull();
    expect(blockedHostnameReason("internal.example.com")).toBeNull();
  });

  it("ipLiteral strips brackets and leaves names alone", () => {
    expect(ipLiteral("[::1]")).toBe("::1");
    expect(ipLiteral("127.0.0.1")).toBe("127.0.0.1");
    expect(ipLiteral("example.com")).toBeNull();
  });
});
