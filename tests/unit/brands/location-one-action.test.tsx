// @vitest-environment jsdom
/**
 * 13 Nov, part 2 (Sri's live checks): existing brands (Omega, Hero) showed a "Confirm your business location"
 * panel and a separate "Keep this location" link that seemed to do the same thing. Before: "Change location"
 * (Brand settings) and "Change" (the details panel) opened the full picker and turned into "Keep this
 * location", which only closed the picker and saved nothing; the picker's Confirm saved. Now:
 * - a confirmed location that only lacks the postcode (lib/brands/location-need.ts) asks for just that: "Add
 *   your postcode so Google checks from your suburb", one field and one Save, sending { postcode } alone;
 * - opening the picker to change a confirmed location shows "Change your business location" with Save and
 *   Cancel, and the link that opened it is gone until it closes; "Keep this location" is nowhere;
 * - an unconfirmed location has the one card at the top, and Brand settings offers no second picker.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/brands/hero-brand",
  useSearchParams: () => new URLSearchParams(),
}));

import { BrandDetailClient } from "@/components/domain/brand/brand-detail-client";
import { locationNeed } from "@/lib/brands/location-need";

/** Hero Home Services as it is after migration 0146: Yennora confirmed on 12 Nov, no postcode yet. */
const HERO = {
  id: "hero-brand",
  name: "Hero Home Services",
  domain: "herohomeservices.com.au",
  vertical: "tradies",
  region: "au",
  competitors: [] as string[],
  primaryRegions: ["NSW:Yennora"],
  suburb: "Yennora",
  city: null,
  state: "NSW",
  postcode: null as string | null,
  locationMode: "fixed" as const,
  locationConfirmedAt: "2026-11-12T03:00:00.000Z" as string | null,
  audience: null,
};
const PROPS = {
  auditCount: 1,
  recentAudits: [],
  latestAudit: null,
  avgPosition: null,
  totalMentions: 0,
  engineStats: [],
};

let fetchMock: ReturnType<typeof vi.fn>;
const patches = () =>
  fetchMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")
    .map(([url, init]) => ({ url, body: JSON.parse(String((init as RequestInit).body)) }));

beforeAll(() => {
  // The page's first render can take 9 s in jsdom here (the unit limit is 5 s): once, then cleared.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 200 })),
  );
  render(<BrandDetailClient {...PROPS} brand={HERO} />);
  cleanup();
}, 60_000);

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ brand: {} }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  router.refresh.mockClear();
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("locationNeed: one answer for what the page asks", () => {
  it("never confirmed: confirm; confirmed with no postcode: postcode; otherwise nothing", () => {
    expect(locationNeed({ ...HERO, locationConfirmedAt: null })).toBe("confirm");
    expect(locationNeed(HERO)).toBe("postcode");
    expect(locationNeed({ ...HERO, postcode: "2161" })).toBeNull();
    expect(
      locationNeed({ ...HERO, locationMode: "online_only", primaryRegions: [], suburb: null }),
    ).toBeNull();
    // An old caller that passes no confirmation at all: treated as confirmed and complete, as before.
    expect(locationNeed({ primaryRegions: ["NSW:Yennora"] })).toBeNull();
  });
});

describe("only the postcode is missing (Hero)", () => {
  it("asks for the postcode alone: one field, one Save; no picker, no 'Keep this location'", () => {
    render(<BrandDetailClient {...PROPS} brand={HERO} />);
    const card = document.querySelector("[data-postcode-card]") as HTMLElement;
    expect(card).toHaveTextContent("Add your postcode so Google checks from your suburb");
    expect(card).toHaveTextContent("Yennora, NSW:");
    expect(card.querySelectorAll("input")).toHaveLength(1);
    expect(card.querySelectorAll("button")).toHaveLength(1);
    expect(card.querySelector("button")).toHaveTextContent("Save");
    expect(screen.queryByText("Confirm your business location")).toBeNull();
    expect(document.body.textContent).not.toContain("Keep this location");
  });

  it("Save sends the postcode and nothing else, then says Saved", async () => {
    render(<BrandDetailClient {...PROPS} brand={HERO} />);
    const card = document.querySelector("[data-postcode-card]") as HTMLElement;
    fireEvent.change(card.querySelector("input") as HTMLInputElement, {
      target: { value: "2161" },
    });
    await act(async () => {
      fireEvent.click(card.querySelector("button") as HTMLButtonElement);
    });
    await waitFor(() => expect(card).toHaveTextContent("Saved"));
    expect(patches()).toEqual([{ url: "/api/brands/hero-brand", body: { postcode: "2161" } }]);
    expect(router.refresh).toHaveBeenCalled();
  });

  it("a postcode that isn't four digits is refused before anything is sent", async () => {
    render(<BrandDetailClient {...PROPS} brand={HERO} />);
    const card = document.querySelector("[data-postcode-card]") as HTMLElement;
    fireEvent.change(card.querySelector("input") as HTMLInputElement, { target: { value: "216" } });
    await act(async () => {
      fireEvent.click(card.querySelector("button") as HTMLButtonElement);
    });
    expect(card).toHaveTextContent("An Australian postcode is four digits.");
    expect(patches()).toEqual([]);
  });

  it("with a postcode there's nothing to ask", () => {
    render(<BrandDetailClient {...PROPS} brand={{ ...HERO, postcode: "2161" }} />);
    expect(document.querySelector("[data-postcode-card]")).toBeNull();
  });
});

describe("changing a confirmed location: one picker, Save and Cancel", () => {
  it("Brand settings: Change location opens it, the link goes until it closes, Cancel closes it", () => {
    render(<BrandDetailClient {...PROPS} brand={{ ...HERO, postcode: "2161" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Change location" }));
    expect(screen.getByText("Change your business location")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change location" })).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Keep this location");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Change your business location")).toBeNull();
    expect(screen.getByRole("button", { name: "Change location" })).toBeInTheDocument();
    expect(patches()).toEqual([]);
  });

  it("its Save stores the location and closes the picker", async () => {
    render(<BrandDetailClient {...PROPS} brand={{ ...HERO, postcode: "2161" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Change location" }));
    fireEvent.change(screen.getByPlaceholderText("e.g. Bondi"), { target: { value: "Fairfield" } });
    fireEvent.change(screen.getByLabelText("Postcode"), { target: { value: "2165" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    await waitFor(() => expect(screen.queryByText("Change your business location")).toBeNull());
    expect(patches()).toHaveLength(1);
    expect(patches()[0].body).toMatchObject({
      locationMode: "fixed",
      suburb: "Fairfield",
      state: "NSW",
      postcode: "2165",
    });
  });

  it("the details panel (Omega-shaped: details unconfirmed): Change, then Save and Cancel, no postcode card yet", () => {
    render(
      <BrandDetailClient
        {...PROPS}
        classificationState="needs_confirmation"
        brand={{
          ...HERO,
          classificationStatus: "needs_confirmation",
          classification: {
            category: "trades_general",
            buyerType: "smb",
            competitors: [],
            confidence: 0.55,
          },
        }}
      />,
    );
    // One thing at a time: the details panel first; its location row has the one Change.
    expect(document.querySelector("[data-postcode-card]")).toBeNull();
    const row = document.querySelector("[data-confirm-location]") as HTMLElement;
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(row).toHaveTextContent("Change your business location");
    expect(screen.queryByRole("button", { name: "Change" })).toBeNull();
    expect(document.body.textContent).not.toContain("Keep this location");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(row).not.toHaveTextContent("Change your business location");
    expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument();
  });
});

describe("a location never confirmed: the one card at the top", () => {
  it("'Confirm your business location' with Confirm; Brand settings has no second picker", () => {
    render(<BrandDetailClient {...PROPS} brand={{ ...HERO, locationConfirmedAt: null }} />);
    expect(screen.getAllByText("Confirm your business location")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change location" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    expect(document.querySelector("[data-postcode-card]")).toBeNull();
  });
});
