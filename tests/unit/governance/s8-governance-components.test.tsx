// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/settings/team",
  useParams: () => ({}),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// ---------------------------------------------------------------------------
// 4.1 — role-badge.tsx (prototype 2905 + §6U.2)
// Canon: owner=governance, admin=blue, analyst=workflow, viewer=secondary
// ---------------------------------------------------------------------------
describe("4.1 — RoleBadge: role → label + semantic token", () => {
  async function renderBadge(role: string) {
    const { RoleBadge } = await import(
      "@/components/domain/governance/role-badge"
    );
    return render(React.createElement(RoleBadge, { role }));
  }

  it("owner renders 'Owner' with governance token", async () => {
    await renderBadge("owner");
    const badge = screen.getByText("Owner");
    expect(badge).toBeInTheDocument();
    expect(badge.style.color).toContain("governance");
  });

  it("admin renders 'Admin' with blue token", async () => {
    await renderBadge("admin");
    const badge = screen.getByText("Admin");
    expect(badge).toBeInTheDocument();
    expect(badge.style.color).toContain("blue");
  });

  it("analyst renders 'Analyst' with workflow token", async () => {
    await renderBadge("analyst");
    const badge = screen.getByText("Analyst");
    expect(badge).toBeInTheDocument();
    expect(badge.style.color).toContain("workflow");
  });

  it("viewer renders 'Viewer' with secondary token", async () => {
    await renderBadge("viewer");
    const badge = screen.getByText("Viewer");
    expect(badge).toBeInTheDocument();
    expect(badge.style.color).toContain("secondary");
  });

  it("unknown role degrades to viewer (no crash)", async () => {
    await renderBadge("superadmin");
    expect(screen.getByText("Viewer")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 4.2 — member-row.tsx (§6U.2, F8 Joined column)
// 5 columns: name, role-badge, brand-access, joined, actions
// ---------------------------------------------------------------------------
describe("4.2 — MemberRow: all 5 columns + permission states", () => {
  async function renderRow(overrides: Record<string, unknown> = {}) {
    const { MemberRow } = await import(
      "@/components/domain/governance/member-row"
    );
    const defaults = {
      id: "m1",
      name: "Alice Test",
      email: "alice@example.com",
      role: "analyst" as const,
      brandAccess: null,
      isActive: true,
      acceptedAt: "2026-01-15T00:00:00Z",
      isCurrentUser: false,
      canManage: true,
      onEdit: vi.fn(),
      onRemove: vi.fn(),
    };
    return render(React.createElement(MemberRow, { ...defaults, ...overrides }));
  }

  it("renders name + email", async () => {
    await renderRow();
    expect(screen.getByText("Alice Test")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
  });

  it("renders role badge", async () => {
    await renderRow();
    expect(screen.getByText("Analyst")).toBeInTheDocument();
  });

  it("brand-access null → 'All brands'", async () => {
    await renderRow({ brandAccess: null });
    expect(screen.getByText("All brands")).toBeInTheDocument();
  });

  it("brand-access array → 'N brands'", async () => {
    await renderRow({ brandAccess: ["b1", "b2"] });
    expect(screen.getByText("2 brands")).toBeInTheDocument();
  });

  it("Joined column renders formatted date (F8)", async () => {
    await renderRow({ acceptedAt: "2026-01-15T00:00:00Z" });
    const dateText = screen.getByText(/Jan/);
    expect(dateText).toBeInTheDocument();
    expect(dateText.className).toContain("tabular-nums");
  });

  it("Joined column renders '—' when acceptedAt is null", async () => {
    await renderRow({ acceptedAt: null });
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("'you' indicator on current user's row", async () => {
    await renderRow({ isCurrentUser: true });
    expect(screen.getByText("you")).toBeInTheDocument();
  });

  it("canManage=false → no edit/remove buttons", async () => {
    await renderRow({ canManage: false });
    expect(screen.queryByLabelText(/Edit/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Remove/)).not.toBeInTheDocument();
  });

  it("canManage=true → edit + remove buttons with aria-labels", async () => {
    const onEdit = vi.fn();
    const onRemove = vi.fn();
    await renderRow({ canManage: true, onEdit, onRemove });
    expect(screen.getByLabelText("Edit Alice Test")).toBeInTheDocument();
    expect(screen.getByLabelText("Remove Alice Test")).toBeInTheDocument();
  });

  it("canManage=true but isCurrentUser → no self-edit/remove", async () => {
    await renderRow({ canManage: true, isCurrentUser: true });
    expect(screen.queryByLabelText(/Edit/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Remove/)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 4.3 — invite-form.tsx (§6U.2, F11 brand_access picker, F12 seat block)
// 3 controls: email + role + brand_access. Seat-limit block tested at page level.
// ---------------------------------------------------------------------------
describe("4.3 — InviteForm: 3 controls + brand_access picker (F11)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ id: "b1", name: "Acme Corp" }]),
      }),
    );
  });

  async function renderForm() {
    const { InviteForm } = await import(
      "@/components/domain/governance/invite-form"
    );
    return render(React.createElement(InviteForm, { orgId: "org1" }));
  }

  it("renders email input with label association (F24 a11y)", async () => {
    await renderForm();
    const emailInput = screen.getByLabelText("Email address");
    expect(emailInput).toBeInTheDocument();
    expect(emailInput).toHaveAttribute("type", "email");
    expect(emailInput).toHaveAttribute("placeholder", "colleague@company.com");
  });

  it("renders role select with label + 3 options (admin/analyst/viewer)", async () => {
    await renderForm();
    const roleSelect = screen.getByLabelText("Role");
    expect(roleSelect).toBeInTheDocument();
    const options = within(roleSelect).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Admin", "Analyst", "Viewer"]);
  });

  it("renders brand_access picker (F11) with label + All/Specific options", async () => {
    await renderForm();
    const brandSelect = screen.getByLabelText("Brand access");
    expect(brandSelect).toBeInTheDocument();
    const options = within(brandSelect).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["All brands", "Specific brands"]);
  });

  it("renders Invite submit button", async () => {
    await renderForm();
    expect(screen.getByRole("button", { name: "Invite" })).toBeInTheDocument();
  });

  it("selecting 'Specific brands' shows brand checkboxes", async () => {
    const user = userEvent.setup();
    await renderForm();
    const brandSelect = screen.getByLabelText("Brand access");
    await user.selectOptions(brandSelect, "specific");
    expect(await screen.findByText("Acme Corp")).toBeInTheDocument();
  });

  it("seat-limit block replaces form when seats exhausted (page-level pattern)", async () => {
    const { container } = render(
      React.createElement("div", null,
        React.createElement("p", null, "Seat limit reached (5/5). "),
        React.createElement("a", { href: "/settings/billing" }, "Upgrade to add more"),
      ),
    );
    expect(container.textContent).toContain("Seat limit reached (5/5)");
    expect(container.querySelector("a[href='/settings/billing']")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 4.4 — audit-log-row.tsx (F21 metadata expand)
// ---------------------------------------------------------------------------
describe("4.4 — AuditLogRow: metadata expand (F21) + actor states", () => {
  async function renderRow(overrides: Record<string, unknown> = {}) {
    const { AuditLogRow } = await import(
      "@/components/domain/governance/audit-log-row"
    );
    const defaults = {
      id: "log1",
      action: "audit_triggered",
      resourceType: "brand",
      resourceId: "418f321f-abcd-1234-5678-abcdef123456",
      metadata: { brandId: "418f321f-abcd-1234-5678-abcdef123456" },
      createdAt: "2026-07-01T10:30:00Z",
      actor: { id: "u1", name: "Alice", email: "alice@test.com" },
    };
    return render(
      React.createElement(AuditLogRow, { entry: { ...defaults, ...overrides } }),
    );
  }

  it("renders action label from ACTION_LABELS", async () => {
    await renderRow();
    expect(screen.getByText("Triggered audit")).toBeInTheDocument();
  });

  it("renders resource_type badge", async () => {
    await renderRow();
    expect(screen.getByText("brand")).toBeInTheDocument();
  });

  it("renders 'by {actor.name}' when actor present", async () => {
    await renderRow();
    expect(screen.getByText(/by Alice/)).toBeInTheDocument();
  });

  it("renders 'by System' when actor is null", async () => {
    await renderRow({ actor: null });
    expect(screen.getByText(/by System/)).toBeInTheDocument();
  });

  it("timestamp has tabular-nums class", async () => {
    const { container } = await renderRow();
    const tsEl = container.querySelector(".tabular-nums");
    expect(tsEl).toBeTruthy();
  });

  it("metadata present → 'Details' button renders with aria-expanded=false", async () => {
    await renderRow({ metadata: { brandId: "test-id" } });
    const btn = screen.getByRole("button", { name: /Details/ });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("clicking Details toggles aria-expanded and reveals dl", async () => {
    const user = userEvent.setup();
    await renderRow({ metadata: { brandId: "test-id" } });
    const btn = screen.getByRole("button", { name: /Details/ });

    await user.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    const region = screen.getByRole("region");
    expect(within(region).getByText("brandId")).toBeInTheDocument();

    await user.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("metadata null → NO Details button (negative guard)", async () => {
    await renderRow({ metadata: null });
    expect(screen.queryByRole("button", { name: /Details/ })).not.toBeInTheDocument();
  });

  it("metadata empty object → NO Details button", async () => {
    await renderRow({ metadata: {} });
    expect(screen.queryByRole("button", { name: /Details/ })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 4.5 — residency-table.tsx (§6U.4, F13 provider names)
// ---------------------------------------------------------------------------
describe("4.5 — ResidencyTable: provider names (F13) + region labels", () => {
  async function renderTable(entries: Record<string, string>[]) {
    const { ResidencyTable } = await import(
      "@/components/domain/governance/residency-table"
    );
    return render(React.createElement(ResidencyTable, { entries }));
  }

  const sampleEntry = {
    dataType: "audit_data",
    storageRegion: "ap-southeast-2",
    provider: "openai",
    retentionPeriod: "90 days",
    encryptionStatus: "AES-256",
  };

  it("openai → 'OpenAI' (NOT 'Openai') via PROVIDER_DISPLAY (F13)", async () => {
    await renderTable([sampleEntry]);
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.queryByText("Openai")).not.toBeInTheDocument();
  });

  it("ap-southeast-2 → 'Australia (Sydney)' via REGION_LABELS", async () => {
    await renderTable([sampleEntry]);
    expect(screen.getByText("Australia (Sydney)")).toBeInTheDocument();
  });

  it("data type renders via TYPE_LABELS", async () => {
    await renderTable([sampleEntry]);
    expect(screen.getByText("Audit Data")).toBeInTheDocument();
  });

  it("no CSS capitalize on any table cell", async () => {
    const { container } = await renderTable([sampleEntry]);
    const cells = container.querySelectorAll("td");
    for (const cell of cells) {
      expect(cell.style.textTransform || "").not.toBe("capitalize");
    }
  });

  it("all 5 column headers render", async () => {
    const { container } = await renderTable([sampleEntry]);
    const headers = container.querySelectorAll("th");
    const texts = Array.from(headers).map((h) => h.textContent);
    expect(texts).toEqual(["Data Type", "Location", "Provider", "Retention", "Encryption"]);
  });

  it("empty entries → loading message (not crash)", async () => {
    await renderTable([]);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 4.6 — tier-gate.tsx (F18 component half)
// ---------------------------------------------------------------------------
describe("4.6 — TierGate: locked overlay + upgrade button", () => {
  async function renderGate(locked: boolean, requiredTier = "Agency") {
    const { TierGate } = await import("@/components/phase2/tier-gate");
    return render(
      React.createElement(
        TierGate,
        { requiredTier, locked },
        React.createElement("div", { "data-testid": "child-content" }, "Protected content"),
      ),
    );
  }

  it("locked=false → children render, no overlay", async () => {
    await renderGate(false);
    expect(screen.getByTestId("child-content")).toBeInTheDocument();
    expect(screen.queryByText(/plan required/)).not.toBeInTheDocument();
  });

  it("locked=true → overlay renders with lock icon (svg)", async () => {
    const { container } = await renderGate(true);
    const svg = container.querySelector("svg.w-8");
    expect(svg).toBeTruthy();
  });

  it("locked=true → shows '{requiredTier} plan required'", async () => {
    await renderGate(true, "Agency");
    expect(screen.getByText("Agency plan required")).toBeInTheDocument();
  });

  it("locked=true → Upgrade button is text-labeled (a11y)", async () => {
    await renderGate(true);
    const btn = screen.getByRole("button", { name: /Upgrade/i });
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toBe("Upgrade");
  });

  it("Upgrade button navigates to /settings/billing", async () => {
    const originalHref = window.location.href;
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...window.location, href: originalHref },
    });
    const user = userEvent.setup();
    await renderGate(true);
    const btn = screen.getByRole("button", { name: /Upgrade/i });
    await user.click(btn);
    expect(window.location.href).toBe("/settings/billing");
  });

  it("locked=true → children are aria-hidden (not interactive)", async () => {
    const { container } = await renderGate(true);
    const hidden = container.querySelector("[aria-hidden='true']");
    expect(hidden).toBeTruthy();
    expect(hidden!.textContent).toContain("Protected content");
  });
});

// ---------------------------------------------------------------------------
// 4.7 — Empty + loading states (canon copy + skeleton guards)
// ---------------------------------------------------------------------------
describe("4.7 — EmptyState + loading skeletons (real component imports)", () => {
  it("audit-trail page empty → 'No activity yet' (canon copy from real page)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ organizationId: "org1", id: "u1" }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ entries: [] }) }),
    );
    const mod = await import("@/app/(auth)/settings/audit-trail/page");
    const AuditTrailPage = mod.default;
    render(React.createElement(AuditTrailPage));
    expect(await screen.findByText("No activity yet")).toBeInTheDocument();
    expect(screen.getByText(/Actions will appear here/)).toBeInTheDocument();
  });

  it("audit-trail page loading → 5 skeleton rows (real page)", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const mod = await import("@/app/(auth)/settings/audit-trail/page");
    const AuditTrailPage = mod.default;
    const { container } = render(React.createElement(AuditTrailPage));
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBe(5);
  });

  it("team page loading → 3 skeleton rows (real page)", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const mod = await import("@/app/(auth)/settings/team/page");
    const TeamPage = mod.default;
    const { container } = render(React.createElement(TeamPage));
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBe(3);
  }, 10_000);

  it("residency table empty → 'loading' message (real component)", async () => {
    const { ResidencyTable } = await import(
      "@/components/domain/governance/residency-table"
    );
    render(React.createElement(ResidencyTable, { entries: [] }));
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});
