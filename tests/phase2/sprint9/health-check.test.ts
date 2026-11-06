// @vitest-environment jsdom
/**
 * Health Check (cross-layer synthesis, NOT raw audit multidim) -- since 7 Nov (Sri's decision 2) three
 * measured checks side by side with no combined score: AI presence (the audit's Visibility, on the
 * Visibility bands), site readiness (the technical audit's own score) and local authority (the local
 * trust score). The old 0-100 average of the three, and the old AI Sentiment card (no classifier
 * behind it), are gone.
 */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const panelSource = readFileSync(
  path.resolve("components/domain/autopilot/health-check-panel.tsx"),
  "utf-8",
);
const pageSource = readFileSync(
  path.resolve("app/(auth)/brands/[brandId]/health-check/page.tsx"),
  "utf-8",
);

describe("Health Check (cross-layer synthesis, NOT raw audit multidim)", () => {
  it("renders the 3 measured checks: AI presence, Site readiness (technical checks), Local authority", () => {
    expect(panelSource).toContain('"AI presence"');
    expect(panelSource).toContain('"Site readiness (technical checks)"');
    expect(panelSource).toContain('"Local authority"');
    expect(panelSource).not.toContain("AI Sentiment");
  });

  it("AI presence is the latest audit's Visibility, as the latest-audit API resolves it", () => {
    expect(pageSource).toContain("audit.visibility");
    expect(pageSource).toContain("scoreConfidenceLow");
  });

  it("site readiness comes from technical_audits, on its own scale and with its date", () => {
    expect(pageSource).toContain("site?.scoreComposite");
    expect(pageSource).toContain("site?.maxScore");
    expect(pageSource).toContain("site?.checkedAt");
  });

  it("local authority comes from agent_readiness localAiTrustScore, with its date", () => {
    expect(pageSource).toContain("localAiTrustScore");
    expect(pageSource).toContain("scoredAt");
  });

  it("AI presence is coloured and named by the Visibility bands, from the one shared map", () => {
    expect(panelSource).toContain('from "@/lib/scoring/headline-color"');
    expect(panelSource).toContain("HEADLINE_BAND_LABELS");
    expect(panelSource).not.toMatch(/green:\s*\d+/);
  });

  it("Local authority is SKIPPED for SaaS brands", () => {
    expect(panelSource).toMatch(/!data\.isSaas/);
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

  it("hero banner has reduced-motion safety", () => {
    expect(panelSource).toContain("motion-safe:animate-gradient-shift");
  });

  it("does NOT regenerate explainability (no ExplainabilityService/annotate)", () => {
    expect(panelSource).not.toContain("ExplainabilityService");
    expect(panelSource).not.toContain("annotate(");
  });
});
