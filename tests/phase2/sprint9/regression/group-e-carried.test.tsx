// @vitest-environment jsdom
/**
 * GROUP E — CARRIED FINDINGS — guard the CURRENT (imperfect) behaviour
 *
 * These are NOT fixed. Guard what they honestly do TODAY.
 * F9/F13 (→S6): no explainability column; renders honest placeholder
 * F14 (personas ~70%): guard the 4 shipped elements; document 4 absent
 * F23 (→S7): templates hardcode vertical + city
 */

import { render } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [k: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useParams: () => ({ brandId: "test-brand-id" }),
  usePathname: () => "/brands/test-brand-id",
}));

import { readFileSync } from "fs";
import {
  AutopilotLoop,
  type AutopilotLoopData,
  buildMeasureDescription,
} from "@/components/domain/autopilot/autopilot-loop";

// ─── F9/F13: explainability renders honest placeholder ─────────────────────

describe("F9/F13 — explainability renders honest placeholder, NOT fabrication", () => {
  const DATA_NO_EXPLAINABILITY: AutopilotLoopData = {
    audit: {
      scoreComposite: 30,
      engineCount: 2,
      promptsCount: 5,
      completedAt: "2026-06-01T00:00:00Z",
    },
    topGap: {
      topicCluster: "plumbing",
      topicLabel: "Emergency Plumbing",
      estimatedCitationImpact: 10,
      priorityRank: 1,
    },
    topTask: {
      id: "t1",
      title: "Fix NAP",
      status: "open",
      priority: 1000,
      scoreBefore: null,
      scoreAfter: null,
      liftAchieved: null,
      completedAt: null,
      updatedAt: "2026-06-01",
    },
    explainability: null,
    draft: null,
    brandId: "b1",
    brandName: "Bondi Plumbing",
  };

  it("step 3 shows 'Explanation will appear after gap analysis' when no explainability", () => {
    const { container } = render(<AutopilotLoop data={DATA_NO_EXPLAINABILITY} />);
    expect(container.textContent).toContain("Explanation will appear after gap analysis");
  });

  it("⚠️ does NOT fabricate a rationale", () => {
    const { container } = render(<AutopilotLoop data={DATA_NO_EXPLAINABILITY} />);
    const text = container.textContent!;
    // Must not contain invented text that looks like a real explanation
    expect(text).not.toMatch(/because.*citation/i);
    expect(text).not.toMatch(/recommended because/i);
  });

  it("confidence label defaults to 'likely' when present (canon: confirmed|likely|hypothesis)", () => {
    const dataWithExplainability: AutopilotLoopData = {
      ...DATA_NO_EXPLAINABILITY,
      explainability: {
        rationale: "Test rationale text",
        confidenceNote: "likely",
        topAction: null,
      },
    };
    const { container } = render(<AutopilotLoop data={dataWithExplainability} />);
    expect(container.textContent).toContain("likely");
  });

  it("documents: only 3 of LLD's 5 explainability fields ship (rationale, confidenceNote, topAction)", () => {
    // LLD specifies: rationale, confidence, topAction, alternativeActions, evidenceLinks
    // Current implementation only has: rationale, confidenceNote, topAction
    const source = readFileSync("components/domain/autopilot/autopilot-loop.tsx", "utf-8");
    expect(source).toContain("rationale");
    expect(source).toContain("confidenceNote");
    expect(source).toContain("topAction");
    // These are NOT shipped:
    expect(source).not.toContain("alternativeActions");
    expect(source).not.toContain("evidenceLinks");
  });
});

// ─── F14: personas — 4 shipped elements, 4 absent ─────────────────────────

describe("F14 — personas ~70%: guard 4 shipped, document 4 absent", () => {
  it("PersonaDashboard component file exists", () => {
    const { existsSync } = require("fs");
    expect(existsSync("components/domain/autopilot/persona-dashboard.tsx")).toBe(true);
  });

  it("4 shipped persona elements present in source", () => {
    const source = readFileSync("components/domain/autopilot/persona-dashboard.tsx", "utf-8");
    // Shipped: derivePersona, vertical-based switching, tier-based content, brandName usage
    expect(source).toContain("derivePersona");
    expect(source).toContain("vertical");
    expect(source).toContain("tier");
    expect(source).toContain("brandName");
  });

  it("documents 4 absent persona features (not shipped, not fabricated)", () => {
    const source = readFileSync("components/domain/autopilot/persona-dashboard.tsx", "utf-8");
    // These are NOT present (gap documentation):
    // 1. personaAvatar / custom icon per persona type
    // 2. persona-specific KPI thresholds
    // 3. persona onboarding flow
    // 4. multi-persona switching within a session
    expect(source).not.toContain("personaAvatar");
    expect(source).not.toContain("onboardingFlow");
    expect(source).not.toContain("personaSwitcher");
    expect(source).not.toContain("kpiThresholds");
  });
});

// ─── F23: templates hardcode vertical + city ───────────────────────────────

// The gap was closed in 3cef8e1 (15 Jul): the templates ask about {serviceType} in {location}, and the journey
// runner fills both from the brand (inngest/functions/run-journey.ts). These two tests kept asserting the gap
// was still there until 9 Nov; they now pin the fix.
describe("F23 — prebuilt journeys are templated per brand (gap closed in 3cef8e1)", () => {
  it("no prebuilt journey names a literal city: they ask about {location}", async () => {
    const { PREBUILT_JOURNEYS } = await import("@/db/seed/prebuilt-journeys");
    const prompts = PREBUILT_JOURNEYS.flatMap((j) => j.promptSequence.map((t) => t.prompt));
    expect(prompts.length).toBeGreaterThan(10);
    for (const prompt of prompts) {
      expect(prompt).not.toMatch(
        /\b(Melbourne|Sydney|Brisbane|Perth|Adelaide|Hobart|Darwin|Canberra)\b/,
      );
    }
    expect(prompts.filter((p) => p.includes("{location}")).length).toBeGreaterThan(5);
  });

  it("the runner asks each turn with the brand's own service and place, no placeholder left", async () => {
    const complete = vi.fn(async () => ({ response: "1. Someone else\n2. Acme Plumbing" }));
    vi.doMock("@/lib/llm", () => ({ getLLMService: () => ({ complete }) }));
    try {
      const { runJourneyTurn } = await import("@/lib/conversational/journey-runner");
      const { turnResult } = await runJourneyTurn({
        turn: {
          turn: 1,
          prompt: "Who are the best {serviceType} in {location}?",
          intent: "awareness",
        },
        brandName: "Acme Plumbing",
        serviceType: "plumbers",
        location: "Parramatta, NSW",
        engine: "chatgpt",
        tier: "growth",
        conversationHistory: [],
      });
      expect(turnResult.prompt).toBe("Who are the best plumbers in Parramatta, NSW?");
      expect(complete).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: "User: Who are the best plumbers in Parramatta, NSW?" }),
      );
    } finally {
      vi.doUnmock("@/lib/llm");
    }
  });
});
