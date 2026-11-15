/**
 * 17 Nov, part 3 -- Local AI Trust's directory presence part read `localDirectoryCount ?? 0`, so a missing count
 * was a measured 0, and the column's only writer (lib/trust/entity-checker.ts checkDirectories) is a stub that
 * writes 0 for every brand. It is never measured now: the score comes from the parts that were.
 */
import { describe, expect, it, vi } from "vitest";
import type { DbClient } from "@/db/client";
import { computeLocalAiTrustScore } from "@/lib/platform/local-ai-trust-scorer";

/** A tx whose raw queries and drizzle selects return these rows, in call order. */
function fakeTx(entityRow: Record<string, unknown> | undefined): DbClient {
  const execute = vi
    .fn()
    .mockResolvedValueOnce([{ exists: "local_seo_results" }])
    .mockResolvedValueOnce([{ gmb_completeness: "80", nap_consistency: "60" }]);
  let selectCall = 0;
  const select = vi.fn(() => {
    selectCall += 1;
    const rows = selectCall === 1 ? (entityRow ? [entityRow] : []) : [];
    const where = () => ({
      orderBy: () => ({ limit: async () => rows }),
      // biome-ignore lint/suspicious/noThenProperty: a drizzle query is awaited directly
      then: (resolve: (r: unknown[]) => void) => resolve(rows),
    });
    return { from: () => ({ where }) };
  });
  return { execute, select } as unknown as DbClient;
}

describe("computeLocalAiTrustScore -- directory presence", () => {
  it("an entity row with the stub's 0 directories: directory presence is not measured, not a 0", async () => {
    const result = await computeLocalAiTrustScore(
      fakeTx({ abnVerified: true, localDirectoryCount: 0 }),
      "brand-1",
      "tradies",
    );
    expect(result.breakdown.directory).toBeNull();
    expect(result.notMeasuredParts).toContain("directory presence");
    expect(result.measuredParts).not.toContain("directory presence");
    // GMB 80 x .25 + ABN 100 x .15 + NAP 60 x .2 = 20 + 15 + 12 = 47, over .6 of the weight = 78.
    expect(result.localAiTrustScore).toBe(78);
  });

  it("a missing count is not measured either", async () => {
    const result = await computeLocalAiTrustScore(
      fakeTx({ abnVerified: false, localDirectoryCount: null }),
      "brand-1",
      "tradies",
    );
    expect(result.breakdown.directory).toBeNull();
  });
});
