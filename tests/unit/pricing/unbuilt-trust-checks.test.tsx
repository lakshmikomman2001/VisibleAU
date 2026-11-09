// @vitest-environment jsdom
/**
 * Regression follow-ups (9 Nov), part 6 -- part 9 hid the Hallucination Risk card and the LinkedIn, consensus and
 * hallucination-incident tiles until their checks exist (TRUST_CHECK_IMPLEMENTED). Nothing else may promise them:
 * no public page, pricing card or comparison row, onboarding step or plan lock. Their pages' locked card said
 * "Cross-platform consensus is part of the Growth plan" with a way to the plans -- selling a check no plan has.
 */
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { lockedMessage, PlanLockedCard } from "@/components/domain/pricing/plan-lock";
import { BRAND_FEATURES, type BrandFeature, brandFeatureBuilt } from "@/lib/pricing/brand-features";
import { TRUST_CHECK_IMPLEMENTED } from "@/lib/trust/stub-implementation-status";
import { readSourcesBeforeAll, sourcePaths, sourceText } from "@/tests/helpers/source-files";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const UNBUILT: BrandFeature[] = ["consensus_score", "hallucinations", "linkedin_presence"];

describe("a brand feature whose check isn't built", () => {
  it("is each of the three hidden checks, and only those", () => {
    expect(TRUST_CHECK_IMPLEMENTED).toMatchObject({
      consensusScore: false,
      hallucinationDetection: false,
      linkedinPresence: false,
    });
    const notBuilt = (Object.keys(BRAND_FEATURES) as BrandFeature[]).filter(
      (f) => !brandFeatureBuilt(f),
    );
    expect(notBuilt.sort()).toEqual([...UNBUILT].sort());
  });

  it.each(
    UNBUILT,
  )("%s: its locked card says it isn't available yet, names no plan and sells none", (feature) => {
    const { container } = render(<PlanLockedCard feature={feature} />);
    expect(lockedMessage(feature)).toBe(`${BRAND_FEATURES[feature].name} isn't available yet`);
    expect(container.textContent).toContain("isn't available yet");
    expect(container.textContent).not.toMatch(/plan\b.*(Growth|Starter|Agency)|part of the/i);
    expect(container.querySelector('a[href="/pricing"]')).toBeNull();
    expect(container.querySelector("[data-not-available]")).not.toBeNull();
  });

  it("a built one is still locked by its plan, with the way to the plans", () => {
    render(<PlanLockedCard feature="entity_score" />);
    expect(
      screen.getByText("Entity authority score is part of the Growth plan"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See the Growth plan" })).toHaveAttribute(
      "href",
      "/pricing",
    );
  });
});

describe("no promise of a hidden check", () => {
  // What a visitor or customer reads: the public pages, pricing and its comparison, the onboarding steps, the
  // brand page's navigation and every plan lock's description. (The hallucination and consensus alert emails
  // report findings and only send when a check finds one; neither check can until it's built.)
  const SURFACES = [
    "app/(marketing)",
    "components/domain/landing",
    "components/domain/pricing",
    "components/domain/onboarding",
    "app/(auth)/onboarding",
    "lib/pricing/tiers.ts",
  ];
  const HIDDEN = /hallucinat|linkedin|consensus|knowledge panel|wikidata/i;
  const code = (f: string) =>
    sourceText(f).replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|^\s*\/\/.*$/gm, "");

  readSourcesBeforeAll(SURFACES);

  it("on a public page, a pricing card or comparison row, or an onboarding step", () => {
    const files = sourcePaths(SURFACES);
    expect(files.length).toBeGreaterThan(20);
    expect(files.filter((f) => HIDDEN.test(code(f)))).toEqual([]);
  });

  it("in a built feature's lock description", () => {
    const built = (Object.keys(BRAND_FEATURES) as BrandFeature[]).filter((f) =>
      brandFeatureBuilt(f),
    );
    expect(built.filter((f) => HIDDEN.test(BRAND_FEATURES[f].description))).toEqual([]);
    expect(BRAND_FEATURES.trust_intelligence.description).toBe(
      "Your overall trust score, from the trust checks that have run",
    );
  });

  it("on the brand page's way to Trust", () => {
    const page = sourceText("components/domain/brand/brand-detail-client.tsx");
    const trustEntry = page.slice(
      page.indexOf('label: "Trust"'),
      page.indexOf('lock: "trust_intelligence"'),
    );
    expect(trustEntry).toContain('desc: "Trust score & entity authority"');
    expect(trustEntry).not.toMatch(HIDDEN);
  });
});
