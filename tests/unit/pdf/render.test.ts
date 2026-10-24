/**
 * Task #46 Phase 2, Part 2 (+ Vunnara 19 Oct, post-aa83b3a): lib/pdf/
 * render.tsx had zero test coverage before Phase 2, and gained a new
 * branch then (the zero-mention banner replacing the dimension grid,
 * and dimValueText's "N/A — not mentioned" for an insufficient_data
 * dimension). This is a render-level smoke test, not a text-content
 * assertion -- react-pdf's renderToBuffer produces a real binary PDF,
 * not inspectable text, so the integration test (tests/integration/
 * audit-export-insufficient-data.integration.test.ts) is what actually
 * proves the DATA is correct from real DB rows. This file's job is
 * narrower: prove renderAuditPdf doesn't throw for each headline shape
 * and produces a real PDF.
 *
 * "The headline is the mention rate": resolveComposite/CompositeResult
 * are gone -- AuditPdfData.headline is a plain DimensionResult (the
 * Frequency result), insufficient_data only when there were zero
 * successful organic ANSWERS (not zero mentions -- a real 0% mention
 * rate over real answers is "scored", distinct from the old
 * "frequency_only" concept this replaces).
 */
import { describe, expect, it } from "vitest";
import { type AuditPdfData, renderAuditPdf } from "@/lib/pdf/render";
import { assetToTheme } from "@/lib/pdf/theme";
import type { DimensionResult } from "@/lib/scoring/dimension-result";

const THEME = assetToTheme(null);

const NO_MENTIONS: DimensionResult = { status: "insufficient_data", reason: "no_mentions" };
const NO_ANSWERS: DimensionResult = { status: "insufficient_data", reason: "no_answers" };
const NOT_MEASURED: DimensionResult = { status: "not_measured", reason: "no_classifier" };
function scored(value: number): DimensionResult {
  return {
    status: "scored",
    value,
    ci: { lower: Math.max(0, value - 5), upper: Math.min(100, value + 5) },
  };
}

function isPdfBuffer(buf: Buffer): boolean {
  return buf.subarray(0, 4).toString("ascii") === "%PDF";
}

describe("renderAuditPdf", () => {
  it("renders a real PDF when there were zero successful answers (headline insufficient_data) without throwing", async () => {
    const dimensions = {
      frequency: NO_ANSWERS,
      position: NO_MENTIONS,
      sentiment: NO_MENTIONS,
      context: NO_MENTIONS,
      accuracy: NO_MENTIONS,
    };
    const data: AuditPdfData = {
      brandName: "Zero Answers Co",
      auditNumber: 1,
      headline: NO_ANSWERS,
      dimensions,
      sampleCount: 0,
      mentionedCount: 0,
      rankedCount: 0,
      medianPosition: null,
      sourcedCount: 0,
      completedAt: new Date("2026-01-01").toISOString(),
      actionItems: [],
      priorComposite: null,
      priorCompletedAt: null,
      engineStats: [],
    };

    const buffer = await renderAuditPdf(data, THEME);
    expect(buffer.length).toBeGreaterThan(0);
    expect(isPdfBuffer(buffer)).toBe(true);
  });

  it("renders a real PDF for a real 0% mention rate (real answers, zero mentions) without throwing", async () => {
    const dimensions = {
      frequency: scored(0),
      position: NO_MENTIONS,
      sentiment: NO_MENTIONS,
      context: NO_MENTIONS,
      accuracy: NO_MENTIONS,
    };
    const data: AuditPdfData = {
      brandName: "Zero Mentions Co",
      auditNumber: 2,
      headline: scored(0),
      dimensions,
      sampleCount: 37,
      mentionedCount: 0,
      rankedCount: 0,
      medianPosition: null,
      sourcedCount: 0,
      completedAt: new Date("2026-01-01").toISOString(),
      actionItems: [],
      priorComposite: null,
      priorCompletedAt: null,
      engineStats: [],
    };

    const buffer = await renderAuditPdf(data, THEME);
    expect(buffer.length).toBeGreaterThan(0);
    expect(isPdfBuffer(buffer)).toBe(true);
  });

  it("renders a real PDF for a brand mentioned in some answers without throwing", async () => {
    const dimensions = {
      frequency: scored(16.2),
      position: scored(71),
      sentiment: NOT_MEASURED,
      context: NOT_MEASURED,
      accuracy: scored(100),
    };
    const data: AuditPdfData = {
      brandName: "Omega Services",
      auditNumber: 30,
      headline: scored(16.2),
      dimensions,
      sampleCount: 37,
      mentionedCount: 6,
      rankedCount: 6,
      medianPosition: 3.5,
      sourcedCount: 6,
      completedAt: new Date("2026-01-01").toISOString(),
      actionItems: [{ title: "Improve citations", action: "Publish more source-worthy content" }],
      priorComposite: 60,
      priorCompletedAt: new Date("2025-12-01").toISOString(),
      engineStats: [{ engine: "chatgpt", sampleCount: 10, mentionedCount: 8 }],
    };

    const buffer = await renderAuditPdf(data, THEME, { methodology: true });
    expect(buffer.length).toBeGreaterThan(0);
    expect(isPdfBuffer(buffer)).toBe(true);
  });
});
