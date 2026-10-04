// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn(), back: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// P2 — a failed checkout call must show an inline error and stay on the
// page, never silently bounce the user to /sign-in. The old handler only
// checked `data.url` — any non-success response (a graceful 500 from the
// server included) fell into an `else` branch that unconditionally redirected
// to /sign-in, which looked exactly like being signed out for a fully
// authenticated user. A genuine 401 (session actually expired) should still
// redirect — that's the one case the fix intentionally preserves.
// ---------------------------------------------------------------------------
describe("PricingTableClient — checkout failure shows an error, doesn't sign the user out", () => {
  beforeEach(() => {
    pushMock.mockClear();
    Object.defineProperty(window, "location", {
      value: { href: "" },
      writable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function renderTable() {
    const { default: PricingTableClient } = await import(
      "@/components/domain/pricing/pricing-table-client"
    );
    return render(
      React.createElement(PricingTableClient, { showFreeTier: false, defaultGstInclusive: true }),
    );
  }

  it("500 from the checkout API → inline error shown, no redirect to /sign-in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "Couldn't start checkout — please try again in a moment." }),
      }),
    );
    const user = userEvent.setup();
    await renderTable();

    const upgradeButtons = screen.getAllByRole("button", { name: /upgrade/i });
    await user.click(upgradeButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/couldn't start checkout/i);
    });
    expect(pushMock).not.toHaveBeenCalledWith("/sign-in");
    expect(window.location.href).toBe("");
  });

  it("network error (fetch throws) → inline error shown, no redirect to /sign-in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );
    const user = userEvent.setup();
    await renderTable();

    const upgradeButtons = screen.getAllByRole("button", { name: /upgrade/i });
    await user.click(upgradeButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/couldn't reach the server/i);
    });
    expect(pushMock).not.toHaveBeenCalledWith("/sign-in");
  });

  it("a genuine 401 still redirects to /sign-in (real session expiry)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: "Unauthorized" }),
      }),
    );
    const user = userEvent.setup();
    await renderTable();

    const upgradeButtons = screen.getAllByRole("button", { name: /upgrade/i });
    await user.click(upgradeButtons[0]);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/sign-in");
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("success (200 + url) → navigates to the Stripe checkout URL, no error shown", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ url: "https://checkout.stripe.com/test-session" }),
      }),
    );
    const user = userEvent.setup();
    await renderTable();

    const upgradeButtons = screen.getAllByRole("button", { name: /upgrade/i });
    await user.click(upgradeButtons[0]);

    await waitFor(() => {
      expect(window.location.href).toBe("https://checkout.stripe.com/test-session");
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
