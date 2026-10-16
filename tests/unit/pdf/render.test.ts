/**
 * Task #46 Phase 2, Part 2: lib/pdf/render.tsx had zero test coverage
 * before this change, and just gained a new branch (the "frequency_only"
 * banner replacing the 4-dimension grid, and dimValueText's "N/A — not
 * mentioned" for an insufficient_data dimension). This is a render-level
 * smoke test, not a text-content assertion -- react-pdf's renderToBuffer
 * produces a real binary PDF, not inspectable text, so the integration
 * test (tests/integration/audit-export-insufficient-data.integration.test.ts)
 * is what actually proves the DATA is correct from real DB rows. This
 * file's job is narrower: prove renderAuditPdf doesn't throw for either
 * shape (frequency_only vs weighted) and produces a real PDF.
 */
import { describe, expect, it } from "vitest";
import { type AuditPdfData, renderAuditPdf } from "@/lib/pdf/render";
import { assetToTheme } from "@/lib/pdf/theme";
import type { DimensionResult } from "@/lib/scoring/dimension-result";
import { resolveComposite } from "@/lib/scoring/dimension-result";

const THEME = assetToTheme(null);

const INSUFFICIENT: DimensionResult = { status: "insufficient_data", reason: "no_mentions" };
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
  it("renders a real PDF for a zero-mention (frequency_only) audit without throwing", async () => {
    const dimensions = {
      frequency: scored(0),
      position: INSUFFICIENT,
      sentiment: INSUFFICIENT,
      context: INSUFFICIENT,
      accuracy: INSUFFICIENT,
    };
    const data: AuditPdfData = {
      brandName: "Zero Mentions Co",
      auditNumber: 1,
      composite: resolveComposite(dimensions),
      dimensions,
      completedAt: new Date("2026-01-01").toISOString(),
      actionItems: [],
      priorComposite: null,
      priorCompletedAt: null,
      engineStats: [],
    };

    expect(data.composite.basis).toBe("frequency_only");
    const buffer = await renderAuditPdf(data, THEME);
    expect(buffer.length).toBeGreaterThan(0);
    expect(isPdfBuffer(buffer)).toBe(true);
  });

  it("renders a real PDF for a fully-scored (weighted) audit without throwing", async () => {
    const dimensions = {
      frequency: scored(80),
      position: scored(70),
      sentiment: scored(75),
      context: scored(60),
      accuracy: scored(50),
    };
    const data: AuditPdfData = {
      brandName: "Full Mentions Co",
      auditNumber: 2,
      composite: resolveComposite(dimensions),
      dimensions,
      completedAt: new Date("2026-01-01").toISOString(),
      actionItems: [{ title: "Improve citations", action: "Publish more source-worthy content" }],
      priorComposite: 60,
      priorCompletedAt: new Date("2025-12-01").toISOString(),
      engineStats: [{ engine: "chatgpt", total: 10, mentioned: 8, avgPosition: 1.5 }],
    };

    expect(data.composite.basis).toBe("weighted");
    const buffer = await renderAuditPdf(data, THEME, { methodology: true });
    expect(buffer.length).toBeGreaterThan(0);
    expect(isPdfBuffer(buffer)).toBe(true);
  });
});
