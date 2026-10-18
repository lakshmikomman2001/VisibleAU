// @vitest-environment jsdom
/**
 * Vunnara hotfix (18 Oct, post-df27ef8) -- ClassificationConfirmCard's
 * audience selector must never pre-select from the old classifier-
 * derived buyerType guess while unconfirmed (the owner has to actively
 * choose), but must show the owner's own REAL confirmed value if one
 * already exists.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClassificationConfirmCard } from "@/components/domain/brand/classification-confirm-card";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

describe("ClassificationConfirmCard — audience selection", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts with NO audience button selected when suggestedAudience is null (never a classifier guess)", () => {
    render(
      <ClassificationConfirmCard
        brandId="brand-1"
        suggestedCategory="trades_plumbing"
        suggestedAudience={null}
        suggestedCompetitors={[]}
        confidence={0.62}
      />,
    );

    for (const label of ["Households", "Businesses", "Both"]) {
      const button = screen.getByRole("button", { name: label });
      expect(button.style.background).not.toBe("var(--accent-primary)");
    }
  });

  it("blocks Confirm with an inline error when no audience has been chosen", async () => {
    render(
      <ClassificationConfirmCard
        brandId="brand-1"
        suggestedCategory="trades_plumbing"
        suggestedAudience={null}
        suggestedCompetitors={[]}
        confidence={0.62}
      />,
    );

    // trades_plumbing is already pre-selected via suggestedCategory --
    // no need to click it (clicking it would TOGGLE it off).
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("Select who pays this business.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets the owner actively choose an audience, then submits it", async () => {
    render(
      <ClassificationConfirmCard
        brandId="brand-1"
        suggestedCategory="trades_plumbing"
        suggestedAudience={null}
        suggestedCompetitors={[]}
        confidence={0.62}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Households" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0];
    const payload = JSON.parse(init.body as string);
    expect(payload.audience).toBe("households");
  });

  // The live Omega Services shape: a real confirmed audience already
  // exists (this card is back on screen for some other reason, e.g.
  // re-opening after confirming) -- shows that real value, never
  // re-derives a guess from buyerType.
  it("shows the owner's real confirmed audience when one already exists, pre-selected", () => {
    render(
      <ClassificationConfirmCard
        brandId="brand-1"
        suggestedCategory="trades_general_services"
        suggestedAudience="households"
        suggestedCompetitors={[]}
        confidence={0.62}
      />,
    );

    const householdsButton = screen.getByRole("button", { name: "Households" });
    expect(householdsButton.style.background).toBe("var(--accent-primary)");
  });
});
