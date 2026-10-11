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

function mockTxThrowingOnAggregateUpsert(auditCitations: Record<string, unknown>[]) {
  const insertedPerAudit: Record<string, unknown>[] = [];

  const tx = {
    select: () => ({
      from: () => ({ where: () => Promise.resolve(auditCitations) }),
    }),
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
    const { tx, insertedPerAudit } = mockTxThrowingOnAggregateUpsert([
      {
        engine: "chatgpt",
        citedSourceType: "au_directory",
        brandMentioned: true,
        prompt: "Best plumber?",
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
    const { tx } = mockTxThrowingOnAggregateUpsert([
      {
        engine: "claude",
        citedSourceType: "review_site",
        brandMentioned: false,
        prompt: "Any good reviews?",
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
