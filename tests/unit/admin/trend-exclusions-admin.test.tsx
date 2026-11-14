// @vitest-environment jsdom
/**
 * 15 Nov, part 4 (Sri's review): /admin/audits tidy-up (components/domain/admin/trend-exclusions-admin.tsx).
 * - No reason is chosen for you: every row starts at "Choose a reason…", and Exclude stays disabled until one is
 *   chosen or typed (one click used to exclude, with the preset reason already picked).
 * - Deleted brands' audits (Bondi Plumbing, Get Plumbing, hipages, plumber to the rescue) are hidden unless the
 *   operator shows them, and then labelled "brand deleted".
 * - A capped list says so: "Showing the latest 50 of 73 complete audits".
 * - The breadcrumb is the operator's, not the workspace's: "Operator > Trend exclusions", on every /admin page.
 */
import { fireEvent, render, screen } from "@testing-library/react";
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

import { TrendExclusionsAdmin } from "@/components/domain/admin/trend-exclusions-admin";
import type { TrendExclusionAdminView, TrendExclusionAudit } from "@/lib/admin/trend-exclusions";
import { EARLIER_MENTION_CHECK_REASON } from "@/lib/audit/trend-exclusion";
import { ADMIN_PAGE_TITLES, breadcrumbsForPath } from "@/lib/navigation/breadcrumbs";

const audit = (n: number, extra: Partial<TrendExclusionAudit> = {}): TrendExclusionAudit => ({
  id: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`,
  auditNumber: n,
  completedAt: "2026-11-14T01:00:00.000Z",
  brandId: "b1",
  brandName: "Hero Home Services",
  workspaceName: "Hero",
  excludedFromTrendsReason: null,
  brandDeleted: false,
  ...extra,
});

function view(extra: Partial<TrendExclusionAdminView> = {}): TrendExclusionAdminView {
  return {
    audits: [audit(50)],
    changes: [],
    showDeletedBrands: false,
    completeAudits: 1,
    newestListed: 1,
    olderExcluded: 0,
    deletedBrandAudits: 0,
    ...extra,
  };
}

describe("no reason is chosen for you", () => {
  it("starts at 'Choose a reason…', with Exclude disabled", () => {
    render(<TrendExclusionsAdmin view={view()} />);
    const select = screen.getByLabelText("Reason for excluding audit #50") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(select.selectedOptions[0]).toHaveTextContent("Choose a reason…");
    expect(screen.getByRole("button", { name: "Exclude from trends" })).toBeDisabled();
  });

  it("a reason chosen enables it; 'Another reason…' needs one typed", () => {
    render(<TrendExclusionsAdmin view={view()} />);
    const select = screen.getByLabelText("Reason for excluding audit #50");
    const exclude = screen.getByRole("button", { name: "Exclude from trends" });
    fireEvent.change(select, { target: { value: EARLIER_MENTION_CHECK_REASON } });
    expect(exclude).toBeEnabled();
    fireEvent.change(select, { target: { value: "other" } });
    expect(exclude).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Another reason for excluding audit #50"), {
      target: { value: "   " },
    });
    expect(exclude).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Another reason for excluding audit #50"), {
      target: { value: "measured before the brand's name was corrected" },
    });
    expect(exclude).toBeEnabled();
  });
});

describe("deleted brands' audits", () => {
  it("hidden by default: the toggle shows how many, and links to them", () => {
    const { container } = render(<TrendExclusionsAdmin view={view({ deletedBrandAudits: 4 })} />);
    const toggle = container.querySelector("[data-admin-show-deleted]");
    expect(toggle).toHaveTextContent("Show deleted brands' audits (4)");
    expect(toggle).toHaveAttribute("href", "/admin/audits?deleted=1");
    expect(container.querySelector("[data-brand-deleted]")).toBeNull();
  });

  it("shown, each is labelled 'brand deleted', and the toggle hides them again", () => {
    const { container } = render(
      <TrendExclusionsAdmin
        view={view({
          showDeletedBrands: true,
          deletedBrandAudits: 1,
          audits: [audit(50), audit(12, { brandName: "Bondi Plumbing", brandDeleted: true })],
        })}
      />,
    );
    const row = container.querySelector('[data-admin-trend-audit="12"]');
    expect(row?.querySelector("[data-brand-deleted]")).toHaveTextContent("brand deleted");
    expect(
      container.querySelector('[data-admin-trend-audit="50"] [data-brand-deleted]'),
    ).toBeNull();
    const toggle = container.querySelector("[data-admin-show-deleted]");
    expect(toggle).toHaveTextContent("Hide deleted brands' audits");
    expect(toggle).toHaveAttribute("href", "/admin/audits");
  });

  it("none at all: no toggle", () => {
    const { container } = render(<TrendExclusionsAdmin view={view()} />);
    expect(container.querySelector("[data-admin-show-deleted]")).toBeNull();
  });
});

describe("a capped list says so", () => {
  it("'Showing the latest 50 of 73 complete audits', and the older excluded ones it adds", () => {
    const { container } = render(
      <TrendExclusionsAdmin view={view({ completeAudits: 73, newestListed: 50 })} />,
    );
    expect(container.querySelector("[data-admin-trend-count]")).toHaveTextContent(
      "Showing the latest 50 of 73 complete audits.",
    );
    const withOlder = render(
      <TrendExclusionsAdmin
        view={view({
          completeAudits: 73,
          newestListed: 50,
          olderExcluded: 1,
          audits: [audit(50), audit(3, { excludedFromTrendsReason: EARLIER_MENTION_CHECK_REASON })],
        })}
      />,
    );
    expect(withOlder.container.querySelector("[data-admin-trend-count]")).toHaveTextContent(
      "Showing the latest 50 of 73 complete audits, and 1 older one excluded from trends.",
    );
  });

  it("not capped: all of them, said plainly", () => {
    const { container } = render(
      <TrendExclusionsAdmin view={view({ completeAudits: 1, newestListed: 1 })} />,
    );
    expect(container.querySelector("[data-admin-trend-count]")).toHaveTextContent(
      "All 1 complete audit.",
    );
  });
});

describe("the operator's breadcrumb", () => {
  it.each([
    "audits",
    "costs",
    "reports",
    "settings",
  ] as const)("/admin/%s: Operator > its title", (page) => {
    expect(breadcrumbsForPath(`/admin/${page}`).map((c) => c.label)).toEqual([
      "Operator",
      ADMIN_PAGE_TITLES[page],
    ]);
  });
});
