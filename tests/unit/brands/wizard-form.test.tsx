// @vitest-environment jsdom
/**
 * Vunnara Build 1, Part D — wizard-form.tsx: location is required.
 *
 * Covers the exact bug the spec calls out: a silent "NSW:Sydney CBD"
 * fallback that let a brand reach step 4 (and get created) with no
 * real location at all. These tests pin:
 *   - step 3's Continue is gated on an explicit choice (suburb or
 *     online-only), not left open like steps before this fix,
 *   - the online-only checkbox disables/clears the suburb picker,
 *   - handleSubmit sends a structured location (fixed or online_only),
 *     never the old default string, for both paths.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WizardForm } from "@/app/(auth)/brands/wizard/wizard-form";
import type { VerticalPack } from "@/db/schema";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

const FAKE_PACK: Partial<VerticalPack> = {
  id: "pack-1",
  name: "Tradies AU",
  vertical: "tradies",
  promptsCount: 10,
};

vi.mock("@/components/domain/vertical/pack-browser", () => ({
  PackBrowser: ({ onSelect }: { onSelect: (pack: VerticalPack) => void }) => (
    <button type="button" onClick={() => onSelect(FAKE_PACK as VerticalPack)}>
      select-pack
    </button>
  ),
}));

vi.mock("@/components/domain/vertical/prompt-preview", () => ({
  PromptPreview: () => null,
}));

const AUDIT_CONFIG = {
  freeEngines: 2,
  freeRuns: 1,
  paidEngines: 4,
  paidRuns: 1,
  promptsPerAudit: 10,
};

async function goToStep3() {
  render(<WizardForm auditConfig={AUDIT_CONFIG} />);

  fireEvent.change(screen.getByLabelText("Brand name"), {
    target: { value: "Bondi Plumbing" },
  });
  fireEvent.change(screen.getByLabelText("Domain"), {
    target: { value: "bondiplumbing.com.au" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));

  fireEvent.click(screen.getByText("select-pack"));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));

  expect(screen.getByText("Locations & competitors")).toBeTruthy();
}

describe("WizardForm — Part D required location (step 3)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ brand: { id: "brand-1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("disables Continue on step 3 until a suburb is added or online-only is chosen", async () => {
    await goToStep3();

    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("enables Continue once a suburb is confirmed", async () => {
    await goToStep3();

    fireEvent.change(screen.getByPlaceholderText("e.g. Bondi"), {
      target: { value: "Bondi" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);

    expect(screen.getByText("Bondi, NSW")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" })).not.toBeDisabled();
  });

  it("enables Continue when 'no fixed location' is ticked, with no suburb", async () => {
    await goToStep3();

    fireEvent.click(screen.getByLabelText(/No fixed location/i));

    expect(screen.getByRole("button", { name: "Continue" })).not.toBeDisabled();
    // the suburb picker itself disappears -- nothing left to fill in
    expect(screen.queryByPlaceholderText("e.g. Bondi")).toBeNull();
  });

  it("re-disables Continue if online-only is unticked with no suburb added", async () => {
    await goToStep3();

    const onlineOnlyCheckbox = screen.getByLabelText(/No fixed location/i);
    fireEvent.click(onlineOnlyCheckbox);
    expect(screen.getByRole("button", { name: "Continue" })).not.toBeDisabled();

    fireEvent.click(onlineOnlyCheckbox);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("submits a structured fixed location (no silent default)", async () => {
    await goToStep3();
    fireEvent.change(screen.getByPlaceholderText("e.g. Bondi"), {
      target: { value: "Bondi" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Confirm & run first audit")).toBeTruthy();
    expect(screen.getByText("Bondi, NSW")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Create brand/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0];
    const payload = JSON.parse(init.body as string);

    expect(payload.locationMode).toBe("fixed");
    expect(payload.suburb).toBe("Bondi");
    expect(payload.state).toBe("NSW");
    expect(payload.city).toBe("Sydney");
    expect(payload.country).toBe("Australia");
    expect(payload.primaryRegions).toEqual(["NSW:Bondi"]);
  });

  // Vunnara hotfix (18 Oct, post-df27ef8): the live Omega Services bug
  // -- "Norwest" isn't in the curated lib/locations list, so this used
  // to fall back to the suburb name itself as the city. city must be
  // null (unknown), never the suburb.
  it("submits city: null for a suburb that isn't in the curated list (never the suburb itself)", async () => {
    await goToStep3();
    fireEvent.change(screen.getByPlaceholderText("e.g. Bondi"), {
      target: { value: "Norwest" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: /Create brand/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0];
    const payload = JSON.parse(init.body as string);

    expect(payload.suburb).toBe("Norwest");
    expect(payload.city).toBeNull();
  });

  it("submits online_only with no suburb/city/state, never 'NSW:Sydney CBD'", async () => {
    await goToStep3();
    fireEvent.click(screen.getByLabelText(/No fixed location/i));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Online only (no fixed location)")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Create brand/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0];
    const payload = JSON.parse(init.body as string);

    expect(payload.locationMode).toBe("online_only");
    expect(payload.primaryRegions).toEqual([]);
    expect(payload.suburb).toBeUndefined();
    expect(payload.city).toBeUndefined();
    expect(payload.state).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain("Sydney CBD");
  });
});
