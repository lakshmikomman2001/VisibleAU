// @vitest-environment jsdom
/**
 * Vunnara hotfix (18 Oct, post-df27ef8), item 4 small polish:
 *  - the Brand settings "Primary regions" pill must not present the
 *    legacy NSW:Sydney CBD default as settled fact -- same
 *    isLegacyDefaultRegion flag the location-confirm banner already
 *    uses.
 *  - a one-time "Thanks -- your questions are ready" success banner
 *    shows once a confirm card's sessionStorage flag is picked up and
 *    the brand is actually ready (no manual browser refresh needed --
 *    router.refresh() already re-renders with fresh props).
 */
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const BRAND_READY = {
  id: "test-brand-id",
  name: "Omega Services",
  domain: "omega.com.au",
  vertical: "tradies",
  region: "au",
  competitors: [],
  classificationStatus: "complete" as const,
  locationConfirmedAt: "2026-10-18T11:20:59.000Z",
};

const BASE_PROPS = {
  auditCount: 2,
  recentAudits: [],
  latestAudit: null,
  avgPosition: null,
  totalMentions: 0,
  engineStats: [],
};

describe("BrandDetailClient — Primary regions settings pill (hotfix item 4d)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });

  it("labels the legacy NSW:Sydney CBD default as 'default, not confirmed' in the settings panel", () => {
    render(
      <BrandDetailClient
        {...BASE_PROPS}
        brand={{ ...BRAND_READY, primaryRegions: ["NSW:Sydney CBD"] }}
      />,
    );
    screen.getByRole("button", { name: "Edit" }).click();
    expect(screen.getByText(/NSW:Sydney CBD\s*—\s*default, not confirmed/)).toBeInTheDocument();
  });

  it("does not label a real, confirmed region as a default", () => {
    render(
      <BrandDetailClient {...BASE_PROPS} brand={{ ...BRAND_READY, primaryRegions: ["NSW:Norwest"] }} />,
    );
    screen.getByRole("button", { name: "Edit" }).click();
    expect(screen.queryByText(/default, not confirmed/)).not.toBeInTheDocument();
    expect(screen.getByText("NSW:Norwest")).toBeInTheDocument();
  });
});

describe("BrandDetailClient — one-time confirmation success banner (hotfix item 4e)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    sessionStorage.clear();
  });

  it("shows the success banner once the brand is ready and the confirm flag is set, then clears the flag", () => {
    sessionStorage.setItem(`brand-just-confirmed-${BRAND_READY.id}`, "1");

    render(
      <BrandDetailClient {...BASE_PROPS} brand={{ ...BRAND_READY, primaryRegions: ["NSW:Norwest"] }} />,
    );

    expect(screen.getByText(/Thanks — your questions are ready/)).toBeInTheDocument();
    expect(sessionStorage.getItem(`brand-just-confirmed-${BRAND_READY.id}`)).toBeNull();
  });

  it("does not show the banner when the flag isn't set (an ordinary page load)", () => {
    render(
      <BrandDetailClient {...BASE_PROPS} brand={{ ...BRAND_READY, primaryRegions: ["NSW:Norwest"] }} />,
    );
    expect(screen.queryByText(/Thanks — your questions are ready/)).not.toBeInTheDocument();
  });

  it("does not show the banner while the brand is still blocked, even if the flag is set", () => {
    sessionStorage.setItem(`brand-just-confirmed-${BRAND_READY.id}`, "1");

    render(
      <BrandDetailClient
        {...BASE_PROPS}
        brand={{ ...BRAND_READY, primaryRegions: ["NSW:Norwest"], locationConfirmedAt: null }}
      />,
    );
    expect(screen.queryByText(/Thanks — your questions are ready/)).not.toBeInTheDocument();
    // the flag stays set -- it's still waiting for the OTHER confirmation.
    expect(sessionStorage.getItem(`brand-just-confirmed-${BRAND_READY.id}`)).toBe("1");
  });
});
