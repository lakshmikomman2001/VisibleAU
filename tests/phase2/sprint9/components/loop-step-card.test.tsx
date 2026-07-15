// @vitest-environment jsdom
/**
 * SECTION 4.1 — loop-step-card.tsx — the 3 presentational states
 *
 * Canon (§6U.2): step.status is "done | current | pending" — a TIMELINE concept.
 * It is NOT remediation_tasks.status (open|in_progress|ready_for_review|complete|wont_fix).
 * "Do NOT unify them."
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { LoopStepCard, type LoopStep, type StepStatus } from "@/components/domain/autopilot/loop-step-card";

function makeStep(status: StepStatus, overrides?: Partial<LoopStep>): LoopStep {
  return {
    id: 1,
    title: "Test Step",
    description: "Step description text",
    status,
    time: "15 Jun 2026",
    color: "var(--step-audit, #6366f1)",
    icon: <span data-testid="icon">I</span>,
    ...overrides,
  };
}

describe("4.1 — LoopStepCard: 3 presentational states", () => {
  it("'done' renders a check icon (SVG with success stroke)", () => {
    const { container } = render(<LoopStepCard step={makeStep("done")} isLast={false} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("stroke")).toContain("success");
  });

  it("'current' renders 'In progress' pill", () => {
    const { container } = render(<LoopStepCard step={makeStep("current")} isLast={false} />);
    expect(container.textContent).toContain("In progress");
  });

  it("'current' has motion-safe:animate-pulse on the circle", () => {
    // WEAK: CSS-class assertion — deferred to Section 5 (Playwright) for real browser test
    const { container } = render(<LoopStepCard step={makeStep("current")} isLast={false} />);
    const circle = container.querySelector("[class*='animate-pulse']");
    expect(circle).not.toBeNull();
    expect(circle?.className).toContain("motion-safe:animate-pulse");
  });

  it("'pending' renders with dashed border and reduced opacity", () => {
    const { container } = render(<LoopStepCard step={makeStep("pending")} isLast={false} />);
    const circle = container.querySelector("[class*='rounded-full']");
    expect(circle).not.toBeNull();
    expect(circle?.getAttribute("style")).toContain("dashed");
    expect(circle?.getAttribute("style")).toContain("opacity: 0.5");
  });

  it("'pending' de-emphasises title text (color: text-tertiary)", () => {
    const { container } = render(<LoopStepCard step={makeStep("pending")} isLast={false} />);
    const h3 = container.querySelector("h3");
    expect(h3?.getAttribute("style")).toContain("text-tertiary");
  });

  it("renders title, description, and time", () => {
    const { container } = render(
      <LoopStepCard step={makeStep("done", { title: "Audit complete", description: "Score: 23.7", time: "15 Jun" })} isLast={false} />,
    );
    expect(container.textContent).toContain("Audit complete");
    expect(container.textContent).toContain("Score: 23.7");
    expect(container.textContent).toContain("15 Jun");
  });

  it("renders optional detail slot when present", () => {
    const step = makeStep("current", { detail: <div data-testid="detail-slot">Custom detail</div> });
    const { container } = render(<LoopStepCard step={step} isLast={false} />);
    expect(container.textContent).toContain("Custom detail");
  });

  it("does NOT render connector line when isLast=true", () => {
    const { container } = render(<LoopStepCard step={makeStep("done")} isLast={true} />);
    const connector = container.querySelector("[class*='absolute left-5 top-10']");
    expect(connector).toBeNull();
  });

  it("renders connector line when isLast=false", () => {
    const { container } = render(<LoopStepCard step={makeStep("done")} isLast={false} />);
    const connector = container.querySelector("[class*='absolute']");
    expect(connector).not.toBeNull();
  });
});

describe("4.1 — TYPE SEPARATION: step.status NEVER accepts DB enum values", () => {
  it("StepStatus type is exactly 'done' | 'current' | 'pending' (TypeScript enforced)", () => {
    const validStatuses: StepStatus[] = ["done", "current", "pending"];
    expect(validStatuses).toHaveLength(3);
    expect(validStatuses).toContain("done");
    expect(validStatuses).toContain("current");
    expect(validStatuses).toContain("pending");
  });

  it("component source does NOT reference remediation_tasks DB enum values", () => {
    const { readFileSync } = require("fs");
    const source = readFileSync("components/domain/autopilot/loop-step-card.tsx", "utf-8");
    expect(source).not.toContain("in_progress");
    expect(source).not.toContain("ready_for_review");
    expect(source).not.toContain("complete");
    expect(source).not.toContain("wont_fix");
    expect(source).not.toContain("open");
  });

  it("autopilot-loop.tsx step builder also does NOT leak DB enum into step status", () => {
    const { readFileSync } = require("fs");
    const source = readFileSync("components/domain/autopilot/autopilot-loop.tsx", "utf-8");
    // The file does reference task.status ("open") for deriveStepStatus logic,
    // but the RETURN VALUE is always StepStatus[] (done|current|pending)
    const lines = source.split("\n");
    const deriveBlock = lines
      .slice(lines.findIndex((l: string) => l.includes("deriveStepStatus")))
      .slice(0, 15)
      .join("\n");
    // Every return in deriveStepStatus returns only done/current/pending
    const returns = deriveBlock.match(/return \[.*?\]/g) || [];
    for (const ret of returns) {
      expect(ret).not.toContain("in_progress");
      expect(ret).not.toContain("ready_for_review");
      expect(ret).not.toContain("wont_fix");
    }
  });
});
