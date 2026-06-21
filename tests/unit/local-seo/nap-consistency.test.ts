import { describe, expect, it } from "vitest";
import { checkNapConsistency } from "@/lib/local-seo/nap-consistency";

describe("checkNapConsistency", () => {
  it("returns 100 with fewer than 2 sources", () => {
    const result = checkNapConsistency([
      { label: "website", name: "Test", address: "1 St", phone: "0412345678" },
    ]);
    expect(result.score).toBe(100);
    expect(result.findings).toHaveLength(0);
  });

  it("returns 100 when all sources match exactly", () => {
    const result = checkNapConsistency([
      { label: "website", name: "Test Co", address: "14 King Street", phone: "0412345678" },
      { label: "gmb", name: "Test Co", address: "14 King Street", phone: "0412345678" },
    ]);
    expect(result.score).toBe(100);
  });

  it("returns 0 when nothing matches", () => {
    const result = checkNapConsistency([
      { label: "website", name: "AAA", address: "1 X St", phone: "0400000000" },
      { label: "gmb", name: "BBB", address: "2 Y Rd", phone: "0499999999" },
    ]);
    expect(result.score).toBe(0);
  });

  it("partial matches give intermediate scores", () => {
    const result = checkNapConsistency([
      { label: "website", name: "Test Co", address: "14 King St", phone: "0412345678" },
      { label: "gmb", name: "Test Co", address: "14 King St", phone: "0499999999" },
    ]);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(100);
  });

  it("normalises phone numbers (strips dashes/spaces)", () => {
    const result = checkNapConsistency([
      { label: "website", name: "Test", address: "1 St", phone: "04-1234-5678" },
      { label: "gmb", name: "Test", address: "1 St", phone: "0412345678" },
    ]);
    expect(result.score).toBe(100);
  });

  it("normalises AU address abbreviations", () => {
    const result = checkNapConsistency([
      { label: "website", name: "Test", address: "14 King St", phone: "0412345678" },
      { label: "gmb", name: "Test", address: "14 King Street", phone: "0412345678" },
    ]);
    expect(result.score).toBe(100);
  });

  it("handles 3+ sources with pairwise comparison", () => {
    const result = checkNapConsistency([
      { label: "website", name: "Test", address: "1 St", phone: "0400000000" },
      { label: "gmb", name: "Test", address: "1 St", phone: "0400000000" },
      { label: "hipages", name: "Test", address: "1 St", phone: "0499999999" },
    ]);
    expect(result.score).toBeGreaterThan(50);
    expect(result.findings).toHaveLength(3);
  });

  it("returns findings for each source", () => {
    const result = checkNapConsistency([
      { label: "website", name: "A", address: "1", phone: "1" },
      { label: "gmb", name: "B", address: "2", phone: "2" },
    ]);
    expect(result.findings).toHaveLength(2);
    expect(result.findings[0].source).toBe("website");
    expect(result.findings[1].source).toBe("gmb");
  });
});
