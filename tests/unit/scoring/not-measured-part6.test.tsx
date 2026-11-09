// @vitest-environment jsdom
/**
 * Regression follow-ups (9 Nov), part 6 -- what part 9's "never show 0 for something that wasn't measured" sweep
 * missed: the per-engine bars of an engine with no answers (the brand page and the PDF, one helper now), the
 * agent-readiness card's "absent" for a check that never ran, and the Local AI Trust score counting its
 * unmeasured parts as 0.
 */
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { AgentReadinessCard } from "@/components/domain/retrieval/agent-readiness-card";
import { engineNoAnswerReason } from "@/lib/audit/engine-failure";
import { localTrustFromParts } from "@/lib/platform/local-ai-trust-scorer";
import { ReportDocument } from "@/lib/reports/pdf/report-document";
import { checkText, NOT_CHECKED, NOT_MEASURED } from "@/lib/scoring/measured";
import { engineRowDisplay, NO_ANSWERS } from "@/lib/scoring/measured-display";
import { collectPdfPages } from "../../helpers/pdf-text";
import { reportDataFixture } from "../../helpers/report-data-fixture";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/verticals/expand-prompt", () => ({ formatLocation: (region: string) => region }));

describe("one engine's row", () => {
  it("an engine that answered gets a bar for its rate, a measured 0% included", () => {
    expect(engineRowDisplay({ sampleCount: 10, mentionedCount: 2 })).toEqual({
      kind: "answered",
      ratePct: 20,
      rate: "20%",
      counts: "2 of 10",
    });
    expect(engineRowDisplay({ sampleCount: 10, mentionedCount: 0 })).toMatchObject({
      kind: "answered",
      ratePct: 0,
      rate: "0%",
    });
  });

  it("one with no answers gets no bar: 'No answers', and why when its calls failed", () => {
    expect(engineRowDisplay({ sampleCount: 0, mentionedCount: 0 })).toEqual({
      kind: "no_answers",
      label: NO_ANSWERS,
      reason: null,
    });
    expect(
      engineRowDisplay({
        sampleCount: 0,
        mentionedCount: 0,
        noAnswerReason: "All 10 of its calls failed",
      }),
    ).toEqual({ kind: "no_answers", label: "No answers", reason: "All 10 of its calls failed" });
  });

  it("the reason comes from the audit's own failure counts", () => {
    const audit = {
      engines: ["chatgpt", "claude", "gemini"],
      promptsCount: 10,
      metadata: { engineFailures: { claude: 10, gemini: 3 } },
    };
    expect(engineNoAnswerReason(audit, "claude")).toBe("All 10 of its calls failed");
    expect(engineNoAnswerReason(audit, "gemini")).toBe("3 calls failed");
    expect(engineNoAnswerReason(audit, "chatgpt")).toBeNull();
  });
});

describe("the brand page's per-engine breakdown", () => {
  it("draws a bar only for an engine that answered; the others say 'No answers', and why", async () => {
    const { BrandDetailClient } = await import("@/components/domain/brand/brand-detail-client");
    const { container } = render(
      <BrandDetailClient
        brand={{
          id: "b1",
          name: "TestBrand",
          domain: "testbrand.com.au",
          vertical: "tradies",
          region: "au",
          competitors: [],
          primaryRegions: [],
          locationConfirmedAt: "2026-06-01T00:00:00.000Z",
        }}
        auditCount={1}
        recentAudits={[]}
        latestAudit={null}
        avgPosition={null}
        totalMentions={2}
        engineStats={[
          { engine: "chatgpt", total: 10, mentions: 2 },
          { engine: "claude", total: 0, mentions: 0, noAnswerReason: "All 10 of its calls failed" },
        ]}
      />,
    );
    expect(container.querySelector('[data-engine-bar="chatgpt"]')).not.toBeNull();
    expect(screen.getByText("2 of 10 · 20%")).toBeInTheDocument();
    for (const engine of ["claude", "gemini", "perplexity"]) {
      expect(container.querySelector(`[data-engine-bar="${engine}"]`), engine).toBeNull();
    }
    expect(screen.getAllByText("No answers")).toHaveLength(3);
    expect(container.querySelector('[data-engine-no-answers="claude"]')?.textContent).toBe(
      "All 10 of its calls failed",
    );
  }, 30_000);
});

describe("the PDF's engine rows", () => {
  it("an engine with no answers says so, with its errors, and draws no bar", () => {
    const data = reportDataFixture("39");
    const [first, second, ...rest] = data.engines;
    data.engines = [
      first,
      {
        ...second,
        sampleCount: 0,
        mentionedCount: 0,
        failedCount: 2,
        failedEverydayCount: 2,
        fullyFailed: false,
      },
      ...rest,
    ];
    const text = collectPdfPages(<ReportDocument data={data} />)
      .flat()
      .join(" ");
    expect(text).toContain("No answers");
    expect(text).toContain("2 errors");
  });
});

describe("the agent-readiness card's technical sub-signals", () => {
  const base = {
    totalScore: 40,
    techScore: 8,
    entityClarityScore: 8,
    verifyScore: 8,
    authorityScore: 8,
    taskScore: 8,
    localAiTrustScore: null,
    gaps: [],
  };

  it("'absent' only when the check ran and found nothing", () => {
    expect(checkText(true)).toBe("detected");
    expect(checkText(false)).toBe("absent");
    expect(checkText(null)).toBe(NOT_CHECKED);
    expect(checkText(undefined)).toBe("Not checked yet");
  });

  it("a check that never ran reads 'Not checked yet', for llms.txt and MCP", () => {
    render(
      <AgentReadinessCard
        {...base}
        llmstxtDepthScore={null}
        llmstxtPresent={null}
        mcpEndpointPresent={null}
      />,
    );
    expect(screen.getByText(/llms\.txt depth:/).textContent).toContain(NOT_CHECKED);
    expect(screen.getByText(/MCP:/).textContent).toBe(`MCP: ${NOT_CHECKED}`);
    expect(document.body.textContent).not.toMatch(/absent/);
  });

  it("one that ran and found nothing reads 'absent'; one that found it says so", () => {
    render(
      <AgentReadinessCard
        {...base}
        llmstxtDepthScore={null}
        llmstxtPresent={false}
        mcpEndpointPresent={true}
      />,
    );
    expect(screen.getByText(/llms\.txt depth:/).textContent).toBe("llms.txt depth: absent");
    expect(screen.getByText(/MCP:/).textContent).toBe("MCP: detected");
  });
});

describe("the Local AI Trust score", () => {
  const all = {
    gmb: { measured: true as const, value: 80 },
    directory: { measured: true as const, value: 50 },
    abn: { measured: true as const, value: 100 },
    nap: { measured: true as const, value: 60 },
    citation: { measured: true as const, value: 40 },
  };

  it("from every part: the weighted sum, from all five", () => {
    const r = localTrustFromParts(all);
    // 80*.25 + 50*.25 + 100*.15 + 60*.2 + 40*.15 = 20 + 12.5 + 15 + 12 + 6
    expect(r.localAiTrustScore).toBe(66);
    expect(r.notMeasuredParts).toEqual([]);
  });

  it("a part nobody measured is left out, never a 0, and the reason names what was and wasn't measured", () => {
    const r = localTrustFromParts({
      ...all,
      directory: { measured: false },
      abn: { measured: false },
      citation: { measured: false },
    });
    // Over GMB and NAP's weights alone: (80*.25 + 60*.2) / .45
    expect(r.localAiTrustScore).toBe(71);
    expect(r.breakdown).toMatchObject({ directory: null, abn: null, citation: null });
    expect(r.measuredParts).toEqual(["GMB completeness", "NAP consistency"]);
    expect(r.notMeasuredParts).toEqual([
      "directory presence",
      "ABN verification",
      "AU directory citations",
    ]);
    expect(r.reason).toBe(
      "Local AI Trust Score: 71/100 from GMB completeness, NAP consistency only; not measured yet: directory presence, ABN verification, AU directory citations.",
    );
  });

  it("a measured 0 is 0; nothing measured is no score", () => {
    expect(
      localTrustFromParts({ ...all, gmb: { measured: true, value: 0 } }).localAiTrustScore,
    ).toBe(46);
    const none = localTrustFromParts({
      gmb: { measured: false },
      directory: { measured: false },
      abn: { measured: false },
      nap: { measured: false },
      citation: { measured: false },
    });
    expect(none.localAiTrustScore).toBeNull();
    expect(none.reason).toContain(NOT_MEASURED);
  });
});
