// @vitest-environment jsdom
/**
 * 13 Nov (Sri's walk-through, part 8): Hero Home Services is in Yennora NSW (2161), but its Google block used
 * "Sydney NSW ... Results for Sydney NSW, not your suburb" -- no operator postcode, Yennora isn't one of the
 * provider's places, and the app's suburb list has no postcodes. The owner gives the postcode with the
 * suburb now; Google uses it; the operator's postcode is an override; "not your suburb" stays for a
 * city-level location.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { LocationConfirmCard } from "@/components/domain/brand/location-confirm-card";
import { googleLocationForBrand } from "@/lib/google-surfaces/location";

const YENNORA = {
  postcode: null as string | null,
  suburb: "Yennora",
  city: null,
  state: "NSW",
  locationMode: "fixed",
};

describe("googleLocationForBrand", () => {
  it("no postcode anywhere: Yennora falls back to Sydney, labelled 'not your suburb' (as audit #46)", () => {
    expect(googleLocationForBrand(null, YENNORA)).toMatchObject({
      ok: true,
      location: {
        label: "Sydney NSW",
        precise: false,
        note: "Results for Sydney NSW, not your suburb",
      },
    });
  });

  it("the brand's own postcode: Yennora's 2161, precise, no note", () => {
    expect(googleLocationForBrand(null, { ...YENNORA, postcode: "2161" })).toMatchObject({
      ok: true,
      location: { label: "2161 NSW", kind: "postcode", precise: true, note: null },
    });
  });

  it("the operator's postcode overrides the brand's", () => {
    expect(googleLocationForBrand("2153", { ...YENNORA, postcode: "2161" })).toMatchObject({
      ok: true,
      location: { label: "2153 NSW", kind: "postcode" },
    });
  });

  it("a postcode the provider doesn't list falls back as before, still labelled", () => {
    expect(googleLocationForBrand(null, { ...YENNORA, postcode: "9999" })).toMatchObject({
      ok: true,
      location: { precise: false, note: "Results for Sydney NSW, not your suburb" },
    });
  });

  it("an online-only business has no Google location, postcode or not", () => {
    expect(googleLocationForBrand("2161", { ...YENNORA, locationMode: "online_only" }).ok).toBe(
      false,
    );
  });
});

describe("the location picker asks for the postcode", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ brand: {} }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends it with the suburb", async () => {
    render(
      <LocationConfirmCard
        brandId="b-1"
        currentPrimaryRegion="NSW:Yennora"
        isLegacyDefaultRegion={false}
      />,
    );
    fireEvent.change(screen.getByLabelText("Postcode"), { target: { value: "2161" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      locationMode: "fixed",
      suburb: "Yennora",
      state: "NSW",
      postcode: "2161",
    });
  });

  it("shows the brand's postcode, refuses one that isn't four digits, and sends none when left empty", async () => {
    const view = render(
      <LocationConfirmCard
        brandId="b-1"
        currentPrimaryRegion="NSW:Yennora"
        isLegacyDefaultRegion={false}
        currentPostcode="2161"
      />,
    );
    expect(screen.getByLabelText("Postcode")).toHaveValue("2161");
    fireEvent.change(screen.getByLabelText("Postcode"), { target: { value: "216" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("An Australian postcode is four digits.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Postcode"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).postcode).toBeNull();
    view.unmount();
  });
});
