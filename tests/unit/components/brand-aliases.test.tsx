// @vitest-environment jsdom
/**
 * S00 part 4 (22 Nov; UI contract P01.identity.name, P01.aliases, P01 noPermission): Brand settings.
 * - "Suggested from your website's name. Edit if it's different." under the name only while the name still equals
 *   the wizard's suggestion (C-21);
 * - "Also known as": the aliases as chips; in edit mode "+ Add a name" opens a field (Enter adds, Esc cancels),
 *   × removes one, the rules (2-60 characters, not the brand's name, up to 10) say what's wrong; Save sends the
 *   list only when it changed;
 * - someone who can't change these settings sees "View only. Owners and admins can change these settings." and no
 *   controls.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type React from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/verticals/expand-prompt", () => ({ formatLocation: (region: string) => region }));

import { BrandDetailClient } from "@/components/domain/brand/brand-detail-client";
import { RoleProvider } from "@/components/domain/role-context";

const BRAND = {
  id: "brand-numbatek",
  name: "NumbaTek IT",
  nameSuggestion: "NumbaTek IT",
  aliases: ["numbatekit", "NumbaTekIT"],
  domain: "numbatekit.com.au",
  vertical: "local_business",
  region: "au",
  competitors: [],
  primaryRegions: ["NSW:Riverstone"],
  classificationStatus: "complete" as const,
  locationConfirmedAt: "2026-11-20T01:00:00.000Z",
};

const PROPS = {
  auditCount: 1,
  recentAudits: [],
  latestAudit: null,
  avgPosition: null,
  totalMentions: 0,
  engineStats: [],
};

const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
  Response.json({ brand: BRAND, status: "saved" }),
);

// A first render in jsdom can take seconds under load (the page is large): once, before the tests.
beforeAll(() => {
  vi.stubGlobal("fetch", fetchMock);
  render(<BrandDetailClient {...PROPS} brand={BRAND} />).unmount();
}, 60_000);

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

const aliasField = () => screen.getByTestId("p01-aliases");
const edit = () => fireEvent.click(screen.getByRole("button", { name: "Edit" }));

describe("Brand settings: the name's help line (P01.identity.name, C-21)", () => {
  it("shows while the name equals the site's suggestion, and goes once it's edited", () => {
    render(<BrandDetailClient {...PROPS} brand={BRAND} />);
    const field = screen.getByTestId("p01-identity-name");
    expect(
      within(field).getByText("Suggested from your website's name. Edit if it's different."),
    ).toBeInTheDocument();
    edit();
    fireEvent.change(screen.getByLabelText("Brand name"), {
      target: { value: "NumbaTek IT Pty Ltd" },
    });
    expect(within(field).queryByText(/Suggested from your website's name/)).toBeNull();
  });

  it("never shows for a brand the wizard suggested nothing for (every existing brand)", () => {
    render(<BrandDetailClient {...PROPS} brand={{ ...BRAND, nameSuggestion: null }} />);
    expect(screen.queryByText(/Suggested from your website's name/)).toBeNull();
  });
});

describe('Brand settings: "Also known as" (P01.aliases)', () => {
  it("lists the aliases as chips, with the help line", () => {
    render(<BrandDetailClient {...PROPS} brand={BRAND} />);
    const field = aliasField();
    expect(within(field).getByText("Also known as")).toBeInTheDocument();
    expect(
      within(field)
        .getAllByTestId("p01-aliases-chip")
        .map((c) => c.textContent),
    ).toEqual(["numbatekit", "NumbaTekIT"]);
    expect(
      within(field).getByText("Other ways AI might write your name. Used to recognise mentions."),
    ).toBeInTheDocument();
    // Not editable until Edit.
    expect(within(field).queryByRole("button", { name: /Remove/ })).toBeNull();
    expect(within(field).queryByTestId("p01-aliases-add")).toBeNull();
  });

  it("+ Add a name opens a field; Enter adds the name; Esc cancels", () => {
    render(<BrandDetailClient {...PROPS} brand={{ ...BRAND, aliases: [] }} />);
    edit();
    fireEvent.click(screen.getByTestId("p01-aliases-add"));
    const input = screen.getByTestId("p01-aliases-input");
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: "  Quollen  Group " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(
      within(aliasField())
        .getAllByTestId("p01-aliases-chip")
        .map((c) => c.textContent),
    ).toEqual(["Quollen Group×"]);
    fireEvent.click(screen.getByTestId("p01-aliases-add"));
    fireEvent.change(screen.getByTestId("p01-aliases-input"), { target: { value: "Something" } });
    fireEvent.keyDown(screen.getByTestId("p01-aliases-input"), { key: "Escape" });
    expect(screen.queryByTestId("p01-aliases-input")).toBeNull();
    expect(within(aliasField()).getAllByTestId("p01-aliases-chip")).toHaveLength(1);
  });

  it("says what's wrong: too short, the brand's own name, already listed", () => {
    render(<BrandDetailClient {...PROPS} brand={BRAND} />);
    edit();
    const tryAdd = (value: string) => {
      fireEvent.click(
        screen.queryByTestId("p01-aliases-add") ?? screen.getByTestId("p01-aliases-input"),
      );
      const input = screen.getByTestId("p01-aliases-input");
      fireEvent.change(input, { target: { value } });
      fireEvent.keyDown(input, { key: "Enter" });
      return within(aliasField()).getByRole("alert").textContent;
    };
    expect(tryAdd("A")).toBe("A name is 2 to 60 characters.");
    expect(tryAdd("numbatek it")).toBe("That's the brand's name already.");
    expect(tryAdd("numbatekit")).toBe("That name is already listed.");
  });

  // S01 part 0 (contract C-27, LLD section 0.2 #5): unique ignoring case for a name being added; the brand's two
  // saved case-only twins (S00) stay listed.
  it("a name that differs only in case from a listed one is already listed", () => {
    render(<BrandDetailClient {...PROPS} brand={BRAND} />);
    edit();
    fireEvent.click(screen.getByTestId("p01-aliases-add"));
    const input = screen.getByTestId("p01-aliases-input");
    fireEvent.change(input, { target: { value: "NUMBATEKIT" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(within(aliasField()).getByRole("alert").textContent).toBe(
      "That name is already listed.",
    );
    expect(
      within(aliasField())
        .getAllByTestId("p01-aliases-chip")
        .map((chip) => chip.textContent?.replace(/×$/, "").trim()),
    ).toHaveLength(2);
  });

  it("× removes one; Save sends the new list (and nothing about aliases when they didn't change)", async () => {
    render(<BrandDetailClient {...PROPS} brand={BRAND} />);
    edit();
    fireEvent.click(screen.getByRole("button", { name: "Remove numbatekit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save brand settings" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toBe("/api/brands/brand-numbatek");
    expect(JSON.parse(String(init.body))).toMatchObject({ aliases: ["NumbaTekIT"] });
  });

  it("a Save that doesn't touch the aliases doesn't send them", async () => {
    render(<BrandDetailClient {...PROPS} brand={BRAND} />);
    edit();
    fireEvent.click(screen.getByRole("button", { name: "Save brand settings" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(JSON.parse(String(init.body))).not.toHaveProperty("aliases");
  });

  it("up to 10: at 10 there's no + Add a name", () => {
    const ten = Array.from({ length: 10 }, (_, i) => `Name ${i}`);
    render(<BrandDetailClient {...PROPS} brand={{ ...BRAND, aliases: ten }} />);
    edit();
    expect(screen.queryByTestId("p01-aliases-add")).toBeNull();
  });
});

describe("Brand settings: view only (P01 noPermission)", () => {
  it("a viewer sees the aliases, the note, and no way to change them", () => {
    render(
      <RoleProvider role="viewer">
        <BrandDetailClient {...PROPS} brand={BRAND} />
      </RoleProvider>,
    );
    expect(screen.getByTestId("p01-no-permission")).toHaveTextContent(
      "View only. Owners and admins can change these settings.",
    );
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(within(aliasField()).getAllByTestId("p01-aliases-chip")).toHaveLength(2);
    expect(within(aliasField()).queryByTestId("p01-aliases-add")).toBeNull();
  });

  it("an owner doesn't see the note", () => {
    render(
      <RoleProvider role="owner">
        <BrandDetailClient {...PROPS} brand={BRAND} />
      </RoleProvider>,
    );
    expect(screen.queryByTestId("p01-no-permission")).toBeNull();
  });
});
