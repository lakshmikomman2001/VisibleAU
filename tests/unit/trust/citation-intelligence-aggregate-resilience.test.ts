/**
 * Task #41 Part C: the csi_unique_aggregate upsert in
 * buildCitationSourceIntelligence only succeeds if a matching partial
 * unique index actually exists wherever this runs -- unlike the local
 * dev DB the integration test proved it against, prod's migration
 * history for this index (0012-0033) was never directly confirmed
 * applied this session. The aggregate row is a display optimisation
 * (getCurrentCitationSources falls back to per-audit rows when it's
 * absent), so a failure writing it must never fail the audit itself.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCitationSourceIntelligence } from "@/lib/trust/citation-intelligence";

function mockTxThrowingOnAggregateUpsert(
  brandDomain: string,
  auditCitations: Record<string, unknown>[],
) {
  const insertedPerAudit: Record<string, unknown>[] = [];
  // Task #43: buildCitationSourceIntelligence now does two selects --
  // the brand's domain first (for classifyCitedSources), then the
  // citations -- so the mock must distinguish them by call order.
  let selectCallCount = 0;

  const tx = {
    select: () => {
      selectCallCount++;
      const isBrandQuery = selectCallCount === 1;
      return {
        from: () => ({
          where: () => Promise.resolve(isBrandQuery ? [{ domain: brandDomain }] : auditCitations),
        }),
      };
    },
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        // Per-audit path (buildCitationSourceIntelligence's first insert).
        onConflictDoNothing: () => {
          insertedPerAudit.push(v);
          return Promise.resolve();
        },
        // Aggregate path -- simulates the real Postgres error when
        // csi_unique_aggregate doesn't exist.
        onConflictDoUpdate: () => {
          throw new Error(
            "there is no unique or exclusion constraint matching the ON CONFLICT specification",
          );
        },
      }),
    }),
  };

  return { tx, insertedPerAudit };
}

describe("buildCitationSourceIntelligence -- the aggregate upsert failing doesn't fail the audit", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("completes successfully, writes the per-audit row, and returns the result -- even when the aggregate upsert throws", async () => {
    const { tx, insertedPerAudit } = mockTxThrowingOnAggregateUpsert("bondiplumbing.com.au", [
      {
        engine: "chatgpt",
        brandMentioned: true,
        prompt: "Best plumber?",
        citedSources: [{ domain: "hipages.com.au", url: "https://hipages.com.au/connect/plumber" }],
      },
    ]);

    const result = await buildCitationSourceIntelligence(
      tx as any,
      "audit-1",
      "brand-1",
      "org-1",
    );

    // Didn't throw -- the audit pipeline (whatever calls this) proceeds.
    expect(result).toHaveLength(1);
    expect(result[0].sourceType).toBe("au_directory");
    expect(result[0].citationCount).toBe(1);

    // The per-audit row was still written -- only the aggregate write failed.
    expect(insertedPerAudit).toHaveLength(1);
    expect(insertedPerAudit[0].auditId).toBe("audit-1");
  });

  it("logs a structured error naming the brand/audit/engine/sourceType when the aggregate upsert fails", async () => {
    const { tx } = mockTxThrowingOnAggregateUpsert("bondiplumbing.com.au", [
      {
        engine: "claude",
        brandMentioned: false,
        prompt: "Any good reviews?",
        citedSources: [
          { domain: "productreview.com.au", url: "https://productreview.com.au/p/brand" },
        ],
      },
    ]);

    await buildCitationSourceIntelligence(tx as any, "audit-2", "brand-2", "org-2");

    expect(errorSpy).toHaveBeenCalledWith(
      "[citation-intelligence] aggregate upsert failed (non-fatal)",
      expect.objectContaining({
        brandId: "brand-2",
        auditId: "audit-2",
        engine: "claude",
        sourceType: "review_site",
        error: expect.stringContaining("no unique or exclusion constraint"),
      }),
    );
  });
});

/**
 * Task #45: top_domains (migration 0039) may not exist yet wherever
 * this runs -- simulates the real Postgres 42703 ("column does not
 * exist") error specifically when topDomains is present in the insert
 * values, distinct from the index-missing failure mode above. Both
 * the per-audit insert and the aggregate upsert must retry WITHOUT
 * topDomains rather than lose the whole row.
 */
function mockTxThrowingOnTopDomains(brandDomain: string, auditCitations: Record<string, unknown>[]) {
  const insertedPerAudit: Record<string, unknown>[] = [];
  const insertedAggregate: Record<string, unknown>[] = [];
  let selectCallCount = 0;

  const tx = {
    select: () => {
      selectCallCount++;
      const isBrandQuery = selectCallCount === 1;
      return {
        from: () => ({
          where: () => Promise.resolve(isBrandQuery ? [{ domain: brandDomain }] : auditCitations),
        }),
      };
    },
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        onConflictDoNothing: () => {
          if (v.topDomains !== undefined) {
            throw new Error('column "top_domains" of relation "citation_source_intelligence" does not exist');
          }
          insertedPerAudit.push(v);
          return Promise.resolve();
        },
        onConflictDoUpdate: () => {
          if (v.topDomains !== undefined) {
            throw new Error('column "top_domains" of relation "citation_source_intelligence" does not exist');
          }
          insertedAggregate.push(v);
          return Promise.resolve();
        },
      }),
    }),
  };

  return { tx, insertedPerAudit, insertedAggregate };
}

describe("buildCitationSourceIntelligence -- top_domains column missing: both inserts retry without it, row still written", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("per-audit AND aggregate rows are both still written, without topDomains, when that column doesn't exist", async () => {
    const { tx, insertedPerAudit, insertedAggregate } = mockTxThrowingOnTopDomains(
      "bondiplumbing.com.au",
      [
        {
          engine: "chatgpt",
          brandMentioned: true,
          prompt: "Best plumber?",
          citedSources: [{ domain: "hipages.com.au", url: "https://hipages.com.au/a" }],
        },
      ],
    );

    const result = await buildCitationSourceIntelligence(tx as any, "audit-3", "brand-3", "org-3");

    // The audit pipeline completes -- didn't throw.
    expect(result).toHaveLength(1);
    expect(result[0].citationCount).toBe(1);

    expect(insertedPerAudit).toHaveLength(1);
    expect(insertedPerAudit[0].topDomains).toBeUndefined();
    expect(insertedPerAudit[0].citationCount).toBe(1); // the core row, intact

    expect(insertedAggregate).toHaveLength(1);
    expect(insertedAggregate[0].topDomains).toBeUndefined();
    expect(insertedAggregate[0].citationCount).toBe(1);

    expect(errorSpy).toHaveBeenCalledWith(
      "[citation-intelligence] per-audit insert with topDomains failed, retrying without it (non-fatal)",
      expect.objectContaining({ brandId: "brand-3", auditId: "audit-3" }),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "[citation-intelligence] aggregate upsert with topDomains failed, retrying without it (non-fatal)",
      expect.objectContaining({ brandId: "brand-3", auditId: "audit-3" }),
    );
  });
});
