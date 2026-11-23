// @vitest-environment jsdom
/**
 * S01 part 11 (contract P01.abnField, P01.abn; LLD 8.8.6): brand settings' ABN field and the ABN suggestion.
 * - The field: "ABN" with its help, read-only until Edit; spaces as typed are fine and the digits are sent; a bad
 *   checksum says so under the field and isn't sent; clearing it sends null.
 * - The suggestion (flag abn_suggestion on, no ABN): "Is this your ABN?" with the ABR's line; Confirm saves it and the
 *   field shows it with "ABN saved. We'll check the register now."; flag off: no banner and no request.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/brands/techcore",
  useSearchParams: () => new URLSearchParams(),
}));

import { BrandDetailClient } from "@/components/domain/brand/brand-detail-client";

const BRAND = {
  id: "techcore",
  name: "TechCore IT",
  domain: "techcoreit.com.au",
  vertical: "tradies",
  region: "au",
  competitors: [] as string[],
  primaryRegions: ["NSW:Riverstone"],
  suburb: "Riverstone",
  state: "NSW",
  locationMode: "fixed" as const,
  locationConfirmedAt: "2026-11-12T03:00:00.000Z",
  abn: null as string | null,
};
const PROPS = {
  auditCount: 1,
  recentAudits: [],
  latestAudit: null,
  avgPosition: null,
  totalMentions: 0,
  engineStats: [],
};
const SUGGESTION = {
  abn: "17701710947",
  entity: "ASTORIO GROUP PTY LTD",
  businessName: "TechCore IT",
  postcode: "2765",
  state: "NSW",
  abnStatus: "Active",
  checkedAt: "2026-11-23T00:00:00.000Z",
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/abn-suggestion") && init?.method === "POST")
      return Response.json({ abn: SUGGESTION.abn });
    if (url.endsWith("/abn-suggestion")) return Response.json({ suggestion: SUGGESTION });
    if (init?.method === "PATCH") return Response.json({ brand: {} });
    return Response.json({ brands: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ brands: [] })),
  );
  render(<BrandDetailClient {...PROPS} brand={BRAND} />).unmount();
  vi.unstubAllGlobals();
}, 60_000);

const patchBody = () =>
  JSON.parse(String(fetchMock.mock.calls.find((c) => c[1]?.method === "PATCH")?.[1]?.body));

describe("the ABN field (P01.abnField)", () => {
  it("read-only until Edit; spaces are fine and the digits are sent", async () => {
    render(<BrandDetailClient {...PROPS} brand={BRAND} />);
    const field = screen.getByLabelText("ABN");
    expect(field).toBeDisabled();
    expect(field).toHaveAccessibleDescription("11 digits, from the Australian Business Register");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("ABN"), { target: { value: "17 701 710 947" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[0]);
    await waitFor(() => expect(patchBody().abn).toBe("17701710947"));
  });

  it("a bad checksum says so under the field and nothing is sent", async () => {
    render(<BrandDetailClient {...PROPS} brand={BRAND} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const field = screen.getByLabelText("ABN");
    fireEvent.change(field, { target: { value: "17 701 710 948" } });
    fireEvent.blur(field);
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription("This isn't a valid ABN. Check the digits.");
    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[0]);
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === "PATCH")).toBe(false);
  });

  it("clearing a saved ABN sends null", async () => {
    render(<BrandDetailClient {...PROPS} brand={{ ...BRAND, abn: "17701710947" }} />);
    expect(screen.getByLabelText("ABN")).toHaveValue("17 701 710 947");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("ABN"), { target: { value: "" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[0]);
    await waitFor(() => expect(patchBody().abn).toBeNull());
  });
});

describe("the ABN suggestion (P01.abn)", () => {
  it("shows the ABR's match; Confirm saves it and the field shows it", async () => {
    render(<BrandDetailClient {...PROPS} brand={BRAND} abnSuggestionEnabled />);
    const banner = await screen.findByTestId("p01-abn", {}, { timeout: 10_000 });
    expect(within(banner).getByText("Is this your ABN?")).toBeInTheDocument();
    expect(within(banner).getByTestId("p01-abn-line")).toHaveTextContent(
      "17 701 710 947 · ASTORIO GROUP PTY LTD · NSW 2765 · Active",
    );
    expect(banner).toHaveTextContent(
      "Found on the Australian Business Register by your business name.",
    );
    fireEvent.click(within(banner).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.queryByTestId("p01-abn")).toBeNull());
    const post = fetchMock.mock.calls.find(
      (c) => String(c[0]).endsWith("/abn-suggestion") && c[1]?.method === "POST",
    );
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ action: "confirm" });
    expect(screen.getByLabelText("ABN")).toHaveValue("17 701 710 947");
    expect(screen.getByRole("status")).toHaveTextContent(
      "ABN saved. We'll check the register now.",
    );
  });

  it("flag off, or a brand with an ABN: no banner and no request", async () => {
    render(<BrandDetailClient {...PROPS} brand={BRAND} />);
    render(
      <BrandDetailClient
        {...PROPS}
        brand={{ ...BRAND, id: "other", abn: "17701710947" }}
        abnSuggestionEnabled
      />,
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId("p01-abn")).toBeNull();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/abn-suggestion"))).toBe(false);
  });
});
