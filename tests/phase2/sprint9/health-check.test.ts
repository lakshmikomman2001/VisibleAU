// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const panelSource = readFileSync(
  path.resolve("components/domain/autopilot/health-check-panel.tsx"),
  "utf-8",
);
const pageSource = readFileSync(
  path.resolve("app/(auth)/brands/[brandId]/health-check/page.tsx"),
  "utf-8",
);

describe("Health Check (cross-layer synthesis, NOT raw audit multidim)", () => {
  it("renders the 4 cross-layer dimensions: AI Sentiment, AI Presence, Site Readiness, Local Authority", () => {
    expect(panelSource).toContain("AI Sentiment");
    expect(panelSource).toContain("AI Presence");
    expect(panelSource).toContain("Site Readiness");
    expect(panelSource).toContain("Local Authority");
  });

  it("AI Sentiment sourced from scoreSentimentNumeric", () => {
    expect(panelSource).toContain("sentimentScore");
    expect(pageSource).toContain("scoreSentimentNumeric");
  });

  it("AI Presence sourced from scoreFrequency", () => {
    expect(panelSource).toContain("frequencyScore");
    expect(pageSource).toContain("scoreFrequency");
  });

  it("Site Readiness sourced from technical_audits scoreComposite", () => {
    expect(panelSource).toContain("siteReadinessScore");
    expect(pageSource).toContain("scoreComposite");
  });

  it("Local Authority sourced from agent_readiness localAiTrustScore", () => {
    expect(panelSource).toContain("localAuthorityScore");
    expect(pageSource).toContain("localAiTrustScore");
  });

  describe("green/amber/red thresholds", () => {
    it("AI Sentiment: green ≥70, amber ≥40, red <40", () => {
      expect(panelSource).toMatch(/sentimentScore.*green:\s*70.*amber:\s*40/s);
    });

    it("AI Presence: green ≥60, amber ≥30, red <30", () => {
      expect(panelSource).toMatch(/frequencyScore.*green:\s*60.*amber:\s*30/s);
    });

    it("Site Readiness: green ≥75, amber ≥45, red <45", () => {
      expect(panelSource).toMatch(/siteReadinessScore.*green:\s*75.*amber:\s*45/s);
    });
  });

  it("Local Authority is SKIPPED for SaaS brands", () => {
    expect(panelSource).toMatch(/!isSaas/);
    expect(pageSource).toContain("SAAS_VERTICALS");
  });

  it("does NOT render the prototype's raw audit multidim (scorePosition/scoreContext/scoreAccuracy)", () => {
    expect(panelSource).not.toContain("scorePosition");
    expect(panelSource).not.toContain("scoreContext");
    expect(panelSource).not.toContain("scoreAccuracy");
  });

  it("has a #1 recommended action from top-priority open remediation_task", () => {
    expect(panelSource).toContain("#1 recommended action");
    expect(panelSource).toContain("topAction");
    expect(pageSource).toContain("topTask");
  });

  it("pre-audit state: shows 'Run your first audit'", () => {
    expect(pageSource).toContain("Run your first audit");
  });

  it("renders confidence_note on the action", () => {
    expect(panelSource).toContain("confidenceLabel");
    expect(pageSource).toMatch(/confidenceLabel|confidenceNote/);
  });

  it("uses classifyScore for green/amber/red status (not great/good/moderate/poor)", () => {
    expect(panelSource).toContain("classifyScore");
    expect(panelSource).toMatch(/"green"|"amber"|"red"/);
    expect(panelSource).not.toContain('"great"');
    expect(panelSource).not.toContain('"moderate"');
    expect(panelSource).not.toContain('"poor"');
  });

  it("hero banner has reduced-motion safety", () => {
    expect(panelSource).toContain("motion-safe:animate-gradient-shift");
  });

  it("does NOT regenerate explainability (no ExplainabilityService/annotate)", () => {
    expect(panelSource).not.toContain("ExplainabilityService");
    expect(panelSource).not.toContain("annotate(");
  });
});

describe("classifyScore unit tests", () => {
  it("can be imported", async () => {
    const mod = await import("@/components/domain/autopilot/health-check-panel");
    expect(mod.classifyScore).toBeDefined();
  });

  it("returns green when score >= green threshold", async () => {
    const mod = await import("@/components/domain/autopilot/health-check-panel");
    expect(mod.classifyScore(70, { green: 70, amber: 40 })).toBe("green");
    expect(mod.classifyScore(100, { green: 70, amber: 40 })).toBe("green");
  });

  it("returns amber when score >= amber threshold but < green", async () => {
    const mod = await import("@/components/domain/autopilot/health-check-panel");
    expect(mod.classifyScore(40, { green: 70, amber: 40 })).toBe("amber");
    expect(mod.classifyScore(69, { green: 70, amber: 40 })).toBe("amber");
  });

  it("returns red when score < amber threshold", async () => {
    const mod = await import("@/components/domain/autopilot/health-check-panel");
    expect(mod.classifyScore(39, { green: 70, amber: 40 })).toBe("red");
    expect(mod.classifyScore(0, { green: 70, amber: 40 })).toBe("red");
  });

  it("returns unmeasured when score is null (F20 fix — not red)", async () => {
    const mod = await import("@/components/domain/autopilot/health-check-panel");
    expect(mod.classifyScore(null, { green: 70, amber: 40 })).toBe("unmeasured");
  });
});

describe("buildDimensions unit tests", () => {
  it("returns 3 dimensions for SaaS (skips Local Authority)", async () => {
    const mod = await import("@/components/domain/autopilot/health-check-panel");
    const dims = mod.buildDimensions(80, 70, 90, 60, true);
    expect(dims).toHaveLength(3);
    expect(dims.map((d: { name: string }) => d.name)).toEqual([
      "AI Sentiment",
      "AI Presence",
      "Site Readiness",
    ]);
  });

  it("returns 4 dimensions for non-SaaS with local authority score", async () => {
    const mod = await import("@/components/domain/autopilot/health-check-panel");
    const dims = mod.buildDimensions(80, 70, 90, 60, false);
    expect(dims).toHaveLength(4);
    expect(dims[3].name).toBe("Local Authority");
  });

  it("returns 4 dimensions for non-SaaS when localAuthorityScore is null (pending state)", async () => {
    const mod = await import("@/components/domain/autopilot/health-check-panel");
    const dims = mod.buildDimensions(80, 70, 90, null, false);
    expect(dims).toHaveLength(4);
    expect(dims[3].name).toBe("Local Authority");
    expect(dims[3].pending).toBe(true);
    expect(dims[3].label).toBe("Not yet measured");
  });
});
