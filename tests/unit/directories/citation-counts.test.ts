import { describe, expect, it, vi } from "vitest";
import { brandDirectoryListings, citations } from "@/db/schema";
import { getDirectoryCitationsForAudit } from "@/lib/directories/citation-counts";

type Row = Record<string, unknown>;

/** A `tx`-shaped mock whose `.select().from(table).where(...)` resolves
 * differently depending on which table was queried -- citations gets
 * `citationRows`, brand_directory_listings gets `confirmedRows`. Lets a
 * single mock stand in for the two independent, batched queries the
 * function under test runs in parallel. */
function mockTx(citationRows: Row[], confirmedRows: Row[]) {
  const select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation((table: unknown) => ({
      where: vi.fn().mockResolvedValue(table === citations ? citationRows : confirmedRows),
    })),
  }));
  return { select, _select: select } as unknown as Parameters<typeof getDirectoryCitationsForAudit>[0] & {
    _select: typeof select;
  };
}

const AU_TRADES_BRAND = { id: "brand-1", region: "au", categories: ["trades_electrical"] };

function citedSource(domain: string, url: string, origin: "retrieved" | "recalled" = "retrieved") {
  return { domain, url, origin };
}

describe("getDirectoryCitationsForAudit", () => {
  it("counts an answer that cites a relevant directory's domain once, even with multiple citations to it", async () => {
    const tx = mockTx(
      [
        { citedSources: [citedSource("hipages.com.au", "https://hipages.com.au/connect/some-electrician")] },
        {
          citedSources: [
            citedSource("hipages.com.au", "https://hipages.com.au/connect/a"),
            citedSource("hipages.com.au", "https://hipages.com.au/connect/b"),
          ],
        },
        { citedSources: [] },
      ],
      [],
    );
    const { results, totalAnswers } = await getDirectoryCitationsForAudit(tx, "audit-1", AU_TRADES_BRAND);
    expect(totalAnswers).toBe(3);
    const hipages = results.find((r) => r.directory.key === "hipages");
    expect(hipages?.citedCount).toBe(2); // 2 answers, not 3 citations
  });

  it("a directory not relevant to the brand's confirmed categories never appears in results at all", async () => {
    const saasBrand = { id: "brand-2", region: "au", categories: ["crm_software"] };
    const tx = mockTx([{ citedSources: [citedSource("hipages.com.au", "https://hipages.com.au/connect/x")] }], []);
    const { results } = await getDirectoryCitationsForAudit(tx, "audit-1", saasBrand);
    expect(results).toEqual([]);
  });

  it("short-circuits to zero queries when the brand has no relevant directories at all", async () => {
    const saasBrand = { id: "brand-2", region: "au", categories: ["crm_software"] };
    const tx = mockTx([], []);
    await getDirectoryCitationsForAudit(tx, "audit-1", saasBrand);
    expect(tx._select).not.toHaveBeenCalled();
  });

  it("runs exactly two queries (citations + brand_directory_listings), never one per directory or per answer", async () => {
    const manyAnswers: Row[] = Array.from({ length: 50 }, () => ({
      citedSources: [citedSource("hipages.com.au", "https://hipages.com.au/connect/x")],
    }));
    const tx = mockTx(manyAnswers, []);
    await getDirectoryCitationsForAudit(tx, "audit-1", AU_TRADES_BRAND);
    expect(tx._select).toHaveBeenCalledTimes(2);
  });

  it("never resolves a Gemini grounding-redirect host as a cited domain -- not counted, not listed as a cited URL", async () => {
    const tx = mockTx(
      [
        {
          citedSources: [
            citedSource(
              "vertexaisearch.cloud.google.com",
              "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc123",
            ),
          ],
        },
      ],
      [],
    );
    const { results } = await getDirectoryCitationsForAudit(tx, "audit-1", AU_TRADES_BRAND);
    for (const r of results) {
      expect(r.citedCount).toBe(0);
      expect(r.citedUrls).toEqual([]);
    }
  });

  it("marks ownerProfileCited true only when a cited URL's host+path matches the owner's own confirmed 'listed' profile", async () => {
    const tx = mockTx(
      [{ citedSources: [citedSource("hipages.com.au", "https://hipages.com.au/connect/omega-electrical/")] }],
      [
        {
          directoryKey: "hipages",
          status: "listed",
          profileUrl: "https://hipages.com.au/connect/omega-electrical",
          confirmedAt: new Date("2026-10-01T00:00:00Z"),
        },
      ],
    );
    const { results } = await getDirectoryCitationsForAudit(tx, "audit-1", AU_TRADES_BRAND);
    const hipages = results.find((r) => r.directory.key === "hipages");
    expect(hipages?.ownerProfileCited).toBe(true); // trailing slash is not a different page
    expect(hipages?.ownerStatus).toBe("listed");
    expect(hipages?.ownerConfirmedAt).toBe("2026-10-01T00:00:00.000Z");
  });

  it("a cited URL on the right directory but the WRONG profile path leaves ownerProfileCited false", async () => {
    const tx = mockTx(
      [{ citedSources: [citedSource("hipages.com.au", "https://hipages.com.au/connect/a-different-business")] }],
      [
        {
          directoryKey: "hipages",
          status: "listed",
          profileUrl: "https://hipages.com.au/connect/omega-electrical",
          confirmedAt: new Date("2026-10-01T00:00:00Z"),
        },
      ],
    );
    const { results } = await getDirectoryCitationsForAudit(tx, "audit-1", AU_TRADES_BRAND);
    const hipages = results.find((r) => r.directory.key === "hipages");
    expect(hipages?.citedCount).toBe(1); // still cited...
    expect(hipages?.ownerProfileCited).toBe(false); // ...just never the owner's own listing
  });

  it("exposes the owner's confirmed status even for a directory nothing cited this audit", async () => {
    const tx = mockTx(
      [{ citedSources: [] }],
      [{ directoryKey: "oneflare", status: "not_listed", profileUrl: null, confirmedAt: new Date("2026-09-01T00:00:00Z") }],
    );
    const { results } = await getDirectoryCitationsForAudit(tx, "audit-1", AU_TRADES_BRAND);
    const oneflare = results.find((r) => r.directory.key === "oneflare");
    expect(oneflare?.citedCount).toBe(0);
    expect(oneflare?.ownerStatus).toBe("not_listed");
  });

  it("a directory never confirmed at all reports ownerStatus null, not a guessed default", async () => {
    const tx = mockTx([{ citedSources: [] }], []);
    const { results } = await getDirectoryCitationsForAudit(tx, "audit-1", AU_TRADES_BRAND);
    for (const r of results) {
      expect(r.ownerStatus).toBeNull();
      expect(r.ownerConfirmedAt).toBeNull();
    }
  });

  it("caps citedUrls at 10 even when a directory is cited by more answers than that", async () => {
    const manyAnswers: Row[] = Array.from({ length: 15 }, (_, i) => ({
      citedSources: [citedSource("hipages.com.au", `https://hipages.com.au/connect/biz-${i}`)],
    }));
    const tx = mockTx(manyAnswers, []);
    const { results } = await getDirectoryCitationsForAudit(tx, "audit-1", AU_TRADES_BRAND);
    const hipages = results.find((r) => r.directory.key === "hipages");
    expect(hipages?.citedCount).toBe(15);
    expect(hipages?.citedUrls.length).toBe(10);
  });

  // ---------------------------------------------------------------------
  // Omega fixture -- audit #30's real cited URLs (prod audit_id
  // 2cab2f88-304b-45c8-b195-1b02b4aa6dca, brand "Omega Services",
  // db/prod-fixes/diag-0082-audit30-mentions-and-sources.sql): Perplexity
  // cited hipages.com.au/connect/norwestelectricalgroup -- a DIFFERENT
  // electrician's real hipages listing, not Omega's -- for a "most
  // reliable electricians" prompt, among this audit's real 37 organic/
  // run-1 answers (lib/scoring/resolve-audit-dimensions.ts's own comment
  // independently confirms audit #30's organic sample is 37). Proves:
  // hipages shows cited >= 1/37, and that citation is never mistaken for
  // Omega's own profile, confirmed or not.
  // ---------------------------------------------------------------------
  describe("Omega fixture (audit #30's real cited URL)", () => {
    const OMEGA_BRAND = { id: "omega-brand", region: "au", categories: ["trades_electrical"] };
    const otherAnswers: Row[] = Array.from({ length: 36 }, () => ({ citedSources: [] }));
    const perplexityElectriciansAnswer: Row = {
      citedSources: [
        citedSource(
          "hipages.com.au",
          "https://hipages.com.au/connect/norwestelectricalgroup",
          "retrieved",
        ),
      ],
    };
    const allThirtySeven = [...otherAnswers, perplexityElectriciansAnswer];

    it("hipages is cited in >= 1 of the audit's 37 organic answers", async () => {
      const tx = mockTx(allThirtySeven, []);
      const { results, totalAnswers } = await getDirectoryCitationsForAudit(tx, "audit-30", OMEGA_BRAND);
      expect(totalAnswers).toBe(37);
      const hipages = results.find((r) => r.directory.key === "hipages");
      expect(hipages?.citedCount).toBeGreaterThanOrEqual(1);
      expect(hipages?.citedUrls).toContain("https://hipages.com.au/connect/norwestelectricalgroup");
    });

    it("that citation is never Omega's own profile when Omega has no confirmed hipages listing", async () => {
      const tx = mockTx(allThirtySeven, []);
      const { results } = await getDirectoryCitationsForAudit(tx, "audit-30", OMEGA_BRAND);
      const hipages = results.find((r) => r.directory.key === "hipages");
      expect(hipages?.ownerProfileCited).toBe(false);
      expect(hipages?.ownerStatus).toBeNull();
    });

    it("stays false even when Omega HAS confirmed a hipages listing, at a different slug", async () => {
      const tx = mockTx(allThirtySeven, [
        {
          directoryKey: "hipages",
          status: "listed",
          profileUrl: "https://hipages.com.au/connect/omega-services-sydney",
          confirmedAt: new Date("2026-10-15T00:00:00Z"),
        },
      ]);
      const { results } = await getDirectoryCitationsForAudit(tx, "audit-30", OMEGA_BRAND);
      const hipages = results.find((r) => r.directory.key === "hipages");
      expect(hipages?.ownerProfileCited).toBe(false);
      expect(hipages?.ownerStatus).toBe("listed");
    });
  });
});
