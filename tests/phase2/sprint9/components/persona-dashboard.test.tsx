// @vitest-environment jsdom
/**
 * SECTION 4.6 — persona-dashboard.tsx (§6U.6) — ~70% SHIPPED (F14)
 *
 * Canon: Agency (multi-brand command centre + cross-brand task queue)
 *        SMB (Health Check + top-5 fixes + Mention-Source archetype + LinkedIn presence)
 *        local-tradie (agent readiness + entity trust)
 *
 * Guard what ships today; document what doesn't.
 * The 4 ABSENT elements: suburb visibility, Reddit AU feed, embedding-page gap alert, persona filter dropdown.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { PersonaDashboard } from "@/components/domain/autopilot/persona-dashboard";

describe("4.6 — PersonaDashboard: persona derivation", () => {
  it("tier 'agency' → Agency persona", () => {
    const { container } = render(
      <PersonaDashboard brandId="b1" brandName="Test" vertical="saas" tier="agency" />,
    );
    expect(container.textContent).toContain("Agency Command Centre");
  });

  it("tier 'agency_pro' → Agency persona", () => {
    const { container } = render(
      <PersonaDashboard brandId="b1" brandName="Test" vertical="plumber" tier="agency_pro" />,
    );
    expect(container.textContent).toContain("Agency Command Centre");
  });

  it("tier 'enterprise' → Agency persona", () => {
    const { container } = render(
      <PersonaDashboard brandId="b1" brandName="Test" vertical="tech" tier="enterprise" />,
    );
    expect(container.textContent).toContain("Agency Command Centre");
  });

  it("vertical 'plumber' + non-agency tier → local_tradie persona", () => {
    const { container } = render(
      <PersonaDashboard brandId="b1" brandName="Bondi Plumbing" vertical="plumber" tier="growth" />,
    );
    expect(container.textContent).toContain("Local Business Insights");
  });

  it("vertical 'electrician' → local_tradie persona", () => {
    const { container } = render(
      <PersonaDashboard brandId="b1" brandName="Sparky" vertical="electrician" tier="starter" />,
    );
    expect(container.textContent).toContain("Local Business Insights");
  });

  it("unknown vertical + non-agency tier → SMB persona", () => {
    const { container } = render(
      <PersonaDashboard brandId="b1" brandName="TechCo" vertical="saas" tier="growth" />,
    );
    expect(container.textContent).toContain("Overview");
  });
});

describe("4.6 — Agency persona: shipped elements", () => {
  it("renders 'Cross-brand task queue' section", () => {
    const { container } = render(
      <PersonaDashboard brandId="b1" brandName="Agency" vertical="tech" tier="agency" />,
    );
    expect(container.textContent).toContain("Cross-brand task queue");
  });

  it("renders 'Brand comparison' section", () => {
    const { container } = render(
      <PersonaDashboard brandId="b1" brandName="Agency" vertical="tech" tier="agency" />,
    );
    expect(container.textContent).toContain("Brand comparison");
  });

  it("links to /action-center for task queue", () => {
    const { container } = render(
      <PersonaDashboard brandId="b1" brandName="Agency" vertical="tech" tier="agency" />,
    );
    const link = container.querySelector('a[href="/action-center"]');
    expect(link).not.toBeNull();
  });
});

describe("4.6 — local_tradie persona: shipped elements (Bondi)", () => {
  it("renders 'Agent readiness' section", () => {
    const { container } = render(
      <PersonaDashboard brandId="bondi-id" brandName="Bondi Plumbing" vertical="plumber" tier="growth" />,
    );
    expect(container.textContent).toContain("Agent readiness");
  });

  it("renders 'Entity & trust' section", () => {
    const { container } = render(
      <PersonaDashboard brandId="bondi-id" brandName="Bondi Plumbing" vertical="plumber" tier="growth" />,
    );
    expect(container.textContent).toContain("Entity & trust");
  });

  it("renders 'Health check' section", () => {
    const { container } = render(
      <PersonaDashboard brandId="bondi-id" brandName="Bondi Plumbing" vertical="plumber" tier="growth" />,
    );
    expect(container.textContent).toContain("Health check");
  });

  it("renders 'Top 5 actions' section", () => {
    const { container } = render(
      <PersonaDashboard brandId="bondi-id" brandName="Bondi Plumbing" vertical="plumber" tier="growth" />,
    );
    expect(container.textContent).toContain("Top 5 actions");
  });

  it("links to brand-specific routes", () => {
    const { container } = render(
      <PersonaDashboard brandId="bondi-id" brandName="Bondi Plumbing" vertical="plumber" tier="growth" />,
    );
    expect(container.querySelector('a[href="/brands/bondi-id/retrieval"]')).not.toBeNull();
    expect(container.querySelector('a[href="/brands/bondi-id/trust"]')).not.toBeNull();
    expect(container.querySelector('a[href="/brands/bondi-id/health-check"]')).not.toBeNull();
    expect(container.querySelector('a[href="/brands/bondi-id/autopilot"]')).not.toBeNull();
  });
});

describe("4.6 — SMB persona: shipped elements", () => {
  it("renders brand name in header", () => {
    const { container } = render(
      <PersonaDashboard brandId="b1" brandName="TechCo SaaS" vertical="saas" tier="growth" />,
    );
    expect(container.textContent).toContain("TechCo SaaS Overview");
  });

  it("renders 'Health check' section", () => {
    const { container } = render(
      <PersonaDashboard brandId="b1" brandName="TechCo" vertical="saas" tier="growth" />,
    );
    expect(container.textContent).toContain("Health check");
  });

  it("renders 'Top fixes' section", () => {
    const { container } = render(
      <PersonaDashboard brandId="b1" brandName="TechCo" vertical="saas" tier="growth" />,
    );
    expect(container.textContent).toContain("Top fixes");
  });

  it("renders 'Visibility trends' section", () => {
    const { container } = render(
      <PersonaDashboard brandId="b1" brandName="TechCo" vertical="saas" tier="growth" />,
    );
    expect(container.textContent).toContain("Visibility trends");
  });

  it("renders 'Trust & entity' section", () => {
    const { container } = render(
      <PersonaDashboard brandId="b1" brandName="TechCo" vertical="saas" tier="growth" />,
    );
    expect(container.textContent).toContain("Trust & entity");
  });
});

describe("4.6 — 4 ABSENT elements (carried — NOT shipped, NOT fabricated)", () => {
  it("suburb visibility NOT shipped", () => {
    const { readFileSync } = require("fs");
    const source = readFileSync("components/domain/autopilot/persona-dashboard.tsx", "utf-8");
    expect(source).not.toContain("suburb");
    expect(source).not.toContain("Suburb");
  });

  it("Reddit AU feed NOT shipped", () => {
    const { readFileSync } = require("fs");
    const source = readFileSync("components/domain/autopilot/persona-dashboard.tsx", "utf-8");
    expect(source).not.toContain("reddit");
    expect(source).not.toContain("Reddit");
  });

  it("embedding-page gap alert NOT shipped", () => {
    const { readFileSync } = require("fs");
    const source = readFileSync("components/domain/autopilot/persona-dashboard.tsx", "utf-8");
    expect(source).not.toContain("embeddingGap");
    expect(source).not.toContain("embedding-page");
  });

  it("persona filter dropdown NOT shipped", () => {
    const { readFileSync } = require("fs");
    const source = readFileSync("components/domain/autopilot/persona-dashboard.tsx", "utf-8");
    expect(source).not.toContain("personaSwitcher");
    expect(source).not.toContain("personaFilter");
    expect(source).not.toContain("dropdown");
  });

  it("uses derivePersona (code-side) + vertical + tier + brandName (4 shipped pillars)", () => {
    const { readFileSync } = require("fs");
    const source = readFileSync("components/domain/autopilot/persona-dashboard.tsx", "utf-8");
    expect(source).toContain("derivePersona");
    expect(source).toContain("vertical");
    expect(source).toContain("tier");
    expect(source).toContain("brandName");
  });
});

describe("4.6 — ⚠️ FINDING: canon SMB includes 'Mention-Source archetype + LinkedIn presence'", () => {
  it("canon declares SMB should have Mention-Source archetype — NOT present as section", () => {
    const { container } = render(
      <PersonaDashboard brandId="b1" brandName="TechCo" vertical="saas" tier="growth" />,
    );
    const text = container.textContent!;
    // Canon: "SMB (Health Check + top-5 fixes + Mention-Source archetype + LinkedIn presence)"
    // ACTUAL: SMB renders Health check, Top fixes, Visibility trends, Trust & entity
    // Missing: Mention-Source archetype as a DISTINCT section (LinkedIn is mentioned in "Trust & entity"
    // description but not as its own dedicated section)
    expect(text).not.toContain("Mention-Source");
    // "LinkedIn" appears in Trust & entity description text but NOT as a standalone section title
    const links = container.querySelectorAll("a");
    const linkedinSection = Array.from(links).find(
      a => a.textContent?.includes("LinkedIn presence") && a.getAttribute("href")?.includes("linkedin"),
    );
    expect(linkedinSection).toBeUndefined(); // No dedicated LinkedIn section exists
    // This is part of F14 (personas ~70%) — documented, not fixed
  });
});
