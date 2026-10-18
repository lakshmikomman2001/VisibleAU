// @vitest-environment jsdom
/**
 * Vunnara Build 1, Part D.4 — the existing-brand "confirm your
 * location" banner. Pins: it shows only when location_confirmed_at is
 * genuinely null (a real, pre-Part-D brand), never for an omitted
 * prop (old test fixtures/callers, treated as already confirmed --
 * the same backward-compat rule classificationStatus already uses),
 * and never once a real confirmation timestamp is set. Also pins the
 * specific "default, not confirmed" copy for the one legacy default
 * value ([NSW:Sydney CBD]) the spec calls out by name.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const BRAND_BASE = {
  id: "test-brand-id",
  name: "TestBrand",
  domain: "testbrand.com.au",
  vertical: "tradies",
  region: "au",
  competitors: [],
  primaryRegions: [] as string[],
};

const BASE_PROPS = {
  auditCount: 2,
  recentAudits: [],
  latestAudit: null,
  avgPosition: null,
  totalMentions: 0,
  engineStats: [],
};

describe("BrandDetailClient — location confirmation banner (Part D.4)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ brand: {} }) }),
    );
  });

  it("shows the confirm-location card when locationConfirmedAt is null", () => {
    render(
      <BrandDetailClient
        {...BASE_PROPS}
        brand={{ ...BRAND_BASE, locationConfirmedAt: null }}
      />,
    );
    expect(screen.getByText("Confirm your business location")).toBeInTheDocument();
  });

  it("does not show the card once locationConfirmedAt is set", () => {
    render(
      <BrandDetailClient
        {...BASE_PROPS}
        brand={{ ...BRAND_BASE, locationConfirmedAt: "2026-06-01T00:00:00.000Z" }}
      />,
    );
    expect(screen.queryByText("Confirm your business location")).not.toBeInTheDocument();
  });

  it("does not show the card when locationConfirmedAt is omitted entirely (old callers/tests)", () => {
    render(<BrandDetailClient {...BASE_PROPS} brand={{ ...BRAND_BASE }} />);
    expect(screen.queryByText("Confirm your business location")).not.toBeInTheDocument();
  });

  it("calls out the legacy NSW:Sydney CBD default by name as 'a default, not confirmed'", () => {
    render(
      <BrandDetailClient
        {...BASE_PROPS}
        brand={{
          ...BRAND_BASE,
          primaryRegions: ["NSW:Sydney CBD"],
          locationConfirmedAt: null,
        }}
      />,
    );
    expect(screen.getByText(/a default, not something you confirmed/i)).toBeInTheDocument();
  });

  it("does not use the legacy-default copy for a real, non-default unconfirmed region", () => {
    render(
      <BrandDetailClient
        {...BASE_PROPS}
        brand={{
          ...BRAND_BASE,
          primaryRegions: ["VIC:Fitzroy"],
          locationConfirmedAt: null,
        }}
      />,
    );
    expect(screen.queryByText(/a default, not something you confirmed/i)).not.toBeInTheDocument();
  });

  it("confirming online-only PATCHes locationMode: online_only with an empty primaryRegions", async () => {
    render(
      <BrandDetailClient
        {...BASE_PROPS}
        brand={{ ...BRAND_BASE, locationConfirmedAt: null }}
      />,
    );

    fireEvent.click(screen.getByLabelText(/No fixed location/i));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(`/api/brands/${BRAND_BASE.id}`);
    const body = JSON.parse(init.body as string);
    expect(body.locationMode).toBe("online_only");
    expect(body.primaryRegions).toEqual([]);
  });
});
