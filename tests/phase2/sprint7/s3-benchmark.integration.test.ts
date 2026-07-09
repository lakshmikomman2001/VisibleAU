import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const benchmarkSrc = readFileSync(
  resolve(__dirname, "../../../app/api/brands/[brandId]/competitive-benchmark/route.ts"),
  "utf-8",
);

const panelSrc = readFileSync(
  resolve(__dirname, "../../../components/domain/visibility/competitive-benchmark-panel.tsx"),
  "utf-8",
);

const pageSrc = readFileSync(
  resolve(__dirname, "../../../app/(auth)/brands/[brandId]/visibility/page.tsx"),
  "utf-8",
);

describe("S3 competitive benchmark route", () => {
  it("imports comparisonPromptResults from schema", () => {
    expect(benchmarkSrc).toContain("comparisonPromptResults");
  });

  it("reads brands.competitors (configured set, not SOV)", () => {
    expect(benchmarkSrc).toContain("brand.competitors");
    expect(benchmarkSrc).toContain("configuredCompetitors");
  });

  it("scopes to latest audit_id (LLD 280-282)", () => {
    expect(benchmarkSrc).toContain("latestAudit");
  });

  it("returns per-competitor aggregation (not single competitor)", () => {
    expect(benchmarkSrc).toContain("byCompetitor");
    expect(benchmarkSrc).toContain("competitors");
    expect(benchmarkSrc).not.toContain("competitor query param required");
  });

  it("returns win/loss/inconclusive per competitor", () => {
    expect(benchmarkSrc).toContain("wins:");
    expect(benchmarkSrc).toContain("losses:");
    expect(benchmarkSrc).toContain("inconclusive:");
  });

  it("does not use CPR-01 stub or stale fields", () => {
    expect(benchmarkSrc).not.toContain("CPR-01");
    expect(benchmarkSrc).not.toContain("dataAvailableFrom");
    expect(benchmarkSrc).not.toContain("competitorNarrative");
  });

  it("filters rows to only configuredCompetitors (Bug-7b: no SOV domains leak)", () => {
    expect(benchmarkSrc).toContain("configuredCompetitors.includes(r.competitorDomain)");
  });

  it("reads tier from subscriptions (not organizations)", () => {
    expect(benchmarkSrc).toContain("subscriptions.tier");
    expect(benchmarkSrc).not.toContain("organizations.tier");
  });

  it("returns summary with totalWins, totalLosses, totalInconclusive", () => {
    expect(benchmarkSrc).toContain("totalWins:");
    expect(benchmarkSrc).toContain("totalLosses:");
    expect(benchmarkSrc).toContain("totalInconclusive:");
  });

  it("uses withRlsContext for org isolation", () => {
    expect(benchmarkSrc).toContain("withRlsContext");
  });
});

describe("S3 competitive benchmark panel (multi-competitor)", () => {
  it("renders per-competitor cards (not single competitor)", () => {
    expect(panelSrc).toContain("competitors.map");
    expect(panelSrc).toContain("CompetitorBenchmark");
  });

  it("shows Win/Loss/Draw per engine per competitor", () => {
    expect(panelSrc).toContain("verdicts.map");
    expect(panelSrc).toMatch(/brandWon === true/);
  });

  it("does NOT use stale single-competitor fields", () => {
    expect(panelSrc).not.toContain("dataAvailableFrom");
    expect(panelSrc).not.toContain("competitorNarrative");
    expect(panelSrc).not.toContain("brandShare");
  });
});

describe("S3 visibility page wires benchmark fetch", () => {
  it("fetches competitive-benchmark route without SOV competitor param", () => {
    expect(pageSrc).toContain("competitive-benchmark");
    expect(pageSrc).not.toContain("sov[0]");
    expect(pageSrc).not.toContain("firstCompetitor");
  });

  it("uses the multi-competitor response shape", () => {
    expect(pageSrc).toContain("bm.competitors");
    expect(pageSrc).toContain("bm.summary");
  });
});
