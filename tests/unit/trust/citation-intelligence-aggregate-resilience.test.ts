/**
 * Task #41 Part C (superseded by the task #46 follow-up's replace-set
 * redesign below): the aggregate row is a display optimisation
 * (getCurrentCitationSources falls back to per-audit rows when it's
 * absent), so a failure writing it must never fail the audit itself.
 *
 * Task #46 follow-up: the aggregate write is no longer a per-group
 * UPSERT (which needed csi_unique_aggregate to exist for its
 * onConflictDoUpdate) -- it's a single DELETE-then-INSERT replace of
 * the brand's whole aggregate set, so a missing partial unique index
 * is no longer a possible failure mode here at all (there's no
 * ON CONFLICT clause left to need one). The resilience property this
 * file tests -- "the aggregate write failing doesn't fail the audit"
 * -- still holds and is still tested, just via a generic forced
 * failure rather than the now-obsolete missing-index scenario. See
 * docs/ops/post-launch-db-hardening.md section 46 (aggregate
 * replace-set follow-up).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCitationSourceIntelligence } from "@/lib/trust/citation-intelligence";

function mockTxThrowingOnAggregateReplace(
  brandDomain: string,
  auditCitations: Record<string, unknown>[],
) {
  const insertedPerAudit: Record<string, unknown>[] = [];
  const deleteCalls: string[] = [];
  // Task #43: buildCitationSourceIntelligence now does two selects --
  // the brand's domain first (for classifyCitedSources), then the
  // citations -- so the mock must distinguish them by call order.
  let selectCallCount = 0;

  const tx: Record<string, unknown> = {
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
      values: (v: Record<string, unknown> | Record<string, unknown>[]) => {
        if (Array.isArray(v)) {
          // Aggregate replace path: a bare insert (no onConflict -- the
          // delete already cleared any possible conflict), so it must
          // be directly awaitable. Simulates some generic, unspecified
          // write failure (distinct from the topDomains-specific
          // scenario covered below) -- fails on both the first attempt
          // and the topDomains-omitted retry alike.
          return Promise.reject(new Error("simulated aggregate write failure"));
        }
        // Per-audit path -- unaffected, always succeeds.
        return {
          onConflictDoNothing: () => {
            insertedPerAudit.push(v);
            return Promise.resolve();
          },
        };
      },
    }),
    delete: () => ({
      where: () => {
        deleteCalls.push("deleted");
        return Promise.resolve();
      },
    }),
    // Task #45 follow-up: the real code wraps each guarded write in
    // tx.transaction() (a savepoint when nested) -- this mock doesn't
    // need real transactional isolation, just to run the callback
    // against the same insert/select/delete surface so a thrown error
    // still propagates to the caller's try/catch exactly as it did
    // before.
    transaction: (cb: (sp: typeof tx) => unknown) => cb(tx),
  };

  return { tx, insertedPerAudit, deleteCalls };
}

describe("buildCitationSourceIntelligence -- the aggregate replace failing doesn't fail the audit", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("completes successfully, writes the per-audit row, and returns the result -- even when the aggregate replace throws", async () => {
    const { tx, insertedPerAudit } = mockTxThrowingOnAggregateReplace("bondiplumbing.com.au", [
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

  it("logs a structured error naming the brand/audit when the aggregate replace fails on both attempts", async () => {
    const { tx } = mockTxThrowingOnAggregateReplace("bondiplumbing.com.au", [
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
      "[citation-intelligence] aggregate replace with topDomains failed, retrying without it (non-fatal)",
      expect.objectContaining({
        brandId: "brand-2",
        auditId: "audit-2",
        error: expect.stringContaining("simulated aggregate write failure"),
      }),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "[citation-intelligence] aggregate replace failed (non-fatal) -- aggregate retains its previous complete set",
      expect.objectContaining({
        brandId: "brand-2",
        auditId: "audit-2",
        error: expect.stringContaining("simulated aggregate write failure"),
      }),
    );
  });
});

/**
 * Task #45: top_domains (migration 0039) may not exist yet wherever
 * this runs -- simulates the real Postgres 42703 ("column does not
 * exist") error specifically when topDomains is present in the insert
 * values. Both the per-audit insert and the aggregate replace's insert
 * half must retry WITHOUT topDomains rather than lose the whole row.
 */
function mockTxThrowingOnTopDomains(brandDomain: string, auditCitations: Record<string, unknown>[]) {
  const insertedPerAudit: Record<string, unknown>[] = [];
  const insertedAggregate: Record<string, unknown>[] = [];
  const deleteCalls: string[] = [];
  let selectCallCount = 0;

  const tx: Record<string, unknown> = {
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
      values: (v: Record<string, unknown> | Record<string, unknown>[]) => {
        if (Array.isArray(v)) {
          // Aggregate replace: a bare insert, directly awaitable --
          // every row in one batch insert shares the same columns, so
          // checking the first entry is enough.
          if (v.some((row) => row.topDomains !== undefined)) {
            return Promise.reject(
              new Error('column "top_domains" of relation "citation_source_intelligence" does not exist'),
            );
          }
          insertedAggregate.push(...v);
          return Promise.resolve();
        }
        return {
          onConflictDoNothing: () => {
            if (v.topDomains !== undefined) {
              throw new Error('column "top_domains" of relation "citation_source_intelligence" does not exist');
            }
            insertedPerAudit.push(v);
            return Promise.resolve();
          },
        };
      },
    }),
    delete: () => ({
      where: () => {
        deleteCalls.push("deleted");
        return Promise.resolve();
      },
    }),
    transaction: (cb: (sp: typeof tx) => unknown) => cb(tx),
  };

  return { tx, insertedPerAudit, insertedAggregate, deleteCalls };
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
    const { tx, insertedPerAudit, insertedAggregate, deleteCalls } = mockTxThrowingOnTopDomains(
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
    // The delete ran (at least once, possibly twice -- the first
    // attempt's delete is rolled back with its own failed savepoint,
    // and the retry redoes it) before the successful fallback insert.
    expect(deleteCalls.length).toBeGreaterThan(0);

    expect(errorSpy).toHaveBeenCalledWith(
      "[citation-intelligence] per-audit insert with topDomains failed, retrying without it (non-fatal)",
      expect.objectContaining({ brandId: "brand-3", auditId: "audit-3" }),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "[citation-intelligence] aggregate replace with topDomains failed, retrying without it (non-fatal)",
      expect.objectContaining({ brandId: "brand-3", auditId: "audit-3" }),
    );
  });
});
