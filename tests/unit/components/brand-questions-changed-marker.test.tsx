// @vitest-environment jsdom
/**
 * Vunnara Build 1, Part E.2 — the brand detail sparkline marks
 * "questions changed" between two consecutive audits whose
 * promptPackVersion differs, so a trend doesn't silently imply a
 * smooth comparison across two incompatible question sets. Mirrors
 * the existing insufficientData per-point marker pattern, but as a
 * between-two-points edge marker.
 */
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

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

function mockIcon(name: string) {
  const Icon = (props: Record<string, unknown>) => <span data-testid={`icon-${name}`} {...props} />;
  Icon.displayName = name;
  return Icon;
}

vi.mock("lucide-react", () => ({
  Activity: mockIcon("Activity"),
  Bot: mockIcon("Bot"),
  Calendar: mockIcon("Calendar"),
  Code: mockIcon("Code"),
  Compass: mockIcon("Compass"),
  Edit3: mockIcon("Edit3"),
  ExternalLink: mockIcon("ExternalLink"),
  Eye: mockIcon("Eye"),
  FileText: mockIcon("FileText"),
  GitBranch: mockIcon("GitBranch"),
  Hash: mockIcon("Hash"),
  Lock: mockIcon("Lock"),
  MapPin: mockIcon("MapPin"),
  MessageCircle: mockIcon("MessageCircle"),
  MonitorDot: mockIcon("MonitorDot"),
  Search: mockIcon("Search"),
  Shield: mockIcon("Shield"),
  ShieldCheck: mockIcon("ShieldCheck"),
  Sparkles: mockIcon("Sparkles"),
  Tag: mockIcon("Tag"),
  Target: mockIcon("Target"),
  Trash2: mockIcon("Trash2"),
  X: mockIcon("X"),
}));

vi.mock("@/lib/verticals/expand-prompt", () => ({
  formatLocation: (region: string) => region,
}));

import { BrandDetailClient } from "@/components/domain/brand/brand-detail-client";

const BRAND_BASE = {
  id: "test-brand-id",
  name: "TestBrand",
  domain: "testbrand.com.au",
  vertical: "tradies",
  region: "au",
  competitors: [],
  primaryRegions: [] as string[],
  locationConfirmedAt: "2026-06-01T00:00:00.000Z",
};

const BASE_PROPS = {
  brand: BRAND_BASE,
  auditCount: 2,
  latestAudit: null,
  avgPosition: null,
  totalMentions: 0,
  engineStats: [],
};

describe("BrandDetailClient — questions-changed marker (Part E.2)", () => {
  it("shows the caption when two consecutive audits used a different promptPackVersion", () => {
    render(
      <BrandDetailClient
        {...BASE_PROPS}
        recentAudits={[
          { scoreComposite: "40.00", completedAt: "2026-05-01", promptPackVersion: 1 },
          { scoreComposite: "55.00", completedAt: "2026-06-01", promptPackVersion: 2 },
        ]}
      />,
    );
    expect(screen.getByText(/Questions or search methodology changed between some of these audits/i)).toBeInTheDocument();
  });

  it("does not show the caption when every audit used the same promptPackVersion", () => {
    render(
      <BrandDetailClient
        {...BASE_PROPS}
        recentAudits={[
          { scoreComposite: "40.00", completedAt: "2026-05-01", promptPackVersion: 1 },
          { scoreComposite: "55.00", completedAt: "2026-06-01", promptPackVersion: 1 },
        ]}
      />,
    );
    expect(
      screen.queryByText(/Questions or search methodology changed between some of these audits/i),
    ).not.toBeInTheDocument();
  });

  it("does not show the caption when promptPackVersion is missing entirely (legacy/old callers)", () => {
    render(
      <BrandDetailClient
        {...BASE_PROPS}
        recentAudits={[
          { scoreComposite: "40.00", completedAt: "2026-05-01" },
          { scoreComposite: "55.00", completedAt: "2026-06-01" },
        ]}
      />,
    );
    expect(
      screen.queryByText(/Questions or search methodology changed between some of these audits/i),
    ).not.toBeInTheDocument();
  });

  it("does not show the caption for a single audit (nothing to compare)", () => {
    render(
      <BrandDetailClient
        {...BASE_PROPS}
        recentAudits={[{ scoreComposite: "40.00", completedAt: "2026-05-01", promptPackVersion: 1 }]}
      />,
    );
    expect(
      screen.queryByText(/Questions or search methodology changed between some of these audits/i),
    ).not.toBeInTheDocument();
  });

  // Vunnara Build 1, Part G.7: the same caption also fires for a
  // methodology (memory-only vs web-grounded) change, independent of
  // promptPackVersion.
  it("shows the caption when two consecutive audits used a different methodologyVersion", () => {
    render(
      <BrandDetailClient
        {...BASE_PROPS}
        recentAudits={[
          { scoreComposite: "40.00", completedAt: "2026-05-01", methodologyVersion: 1 },
          { scoreComposite: "55.00", completedAt: "2026-06-01", methodologyVersion: 2 },
        ]}
      />,
    );
    expect(
      screen.getByText(/Questions or search methodology changed between some of these audits/i),
    ).toBeInTheDocument();
  });

  it("does not show the caption when every audit used the same methodologyVersion", () => {
    render(
      <BrandDetailClient
        {...BASE_PROPS}
        recentAudits={[
          { scoreComposite: "40.00", completedAt: "2026-05-01", methodologyVersion: 2 },
          { scoreComposite: "55.00", completedAt: "2026-06-01", methodologyVersion: 2 },
        ]}
      />,
    );
    expect(
      screen.queryByText(/Questions or search methodology changed between some of these audits/i),
    ).not.toBeInTheDocument();
  });

  it("does not show the caption when methodologyVersion is missing entirely (legacy/old callers)", () => {
    render(
      <BrandDetailClient
        {...BASE_PROPS}
        recentAudits={[
          { scoreComposite: "40.00", completedAt: "2026-05-01" },
          { scoreComposite: "55.00", completedAt: "2026-06-01" },
        ]}
      />,
    );
    expect(
      screen.queryByText(/Questions or search methodology changed between some of these audits/i),
    ).not.toBeInTheDocument();
  });
});
