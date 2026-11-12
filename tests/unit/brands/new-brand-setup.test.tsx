// @vitest-environment jsdom
/**
 * 13 Nov (Sri's walk-through, part 1): a new brand can never dead-end before its first audit. Sri created
 * herohomeservices.com.au (Tradies, Yennora NSW); the page said the first audit couldn't start, "Run audit to
 * try again", "Classification is still running — questions may use a generic fallback", "Classification
 * pending" -- and showed no confirmation panel until a Save happened to refresh it.
 *
 * - the panel shows on the first render whenever confirmation is needed, at the top, with the brand's
 *   location (and Change) and the vertical's business types first;
 * - a failed or timed-out classification shows the same panel: "We couldn't work this out automatically";
 * - while the classifier runs, the page says so, asks the server again every 5 s, and Run audit waits;
 * - one line near Run audit, never three; never "generic fallback" (the audit is refused, not degraded);
 * - after Confirm, Run audit works and starts the audit.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { BrandDetailClient } from "@/components/domain/brand/brand-detail-client";
import type { ClassificationState } from "@/lib/brands/classification-state";

const HERO = {
  id: "hero-brand",
  name: "herohomeservices",
  domain: "herohomeservices.com.au",
  vertical: "tradies",
  region: "au",
  competitors: [],
  primaryRegions: ["NSW:Yennora"],
  suburb: "Yennora",
  city: null,
  state: "NSW",
  locationMode: "fixed" as const,
  locationConfirmedAt: "2026-11-12T03:00:00.000Z",
  audience: null,
};
const LOW_CONFIDENCE = {
  category: "trades_general",
  buyerType: "smb",
  competitors: ["Fixit Plumbing"],
  confidence: 0.55,
};
const PROPS = {
  auditCount: 0,
  recentAudits: [],
  latestAudit: null,
  avgPosition: null,
  totalMentions: 0,
  engineStats: [],
};

function renderBrand(
  state: ClassificationState,
  classification: typeof LOW_CONFIDENCE | null = LOW_CONFIDENCE,
) {
  const status =
    state === "running" ? "processing" : state === "could_not_classify" ? "failed" : state;
  return render(
    <BrandDetailClient
      {...PROPS}
      classificationState={state}
      brand={{ ...HERO, classificationStatus: status, classification }}
    />,
  );
}

const runAudit = () => screen.getByRole("button", { name: /Run audit/ });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/audits")
      return new Response(JSON.stringify({ auditId: "a-1" }), { status: 201 });
    return new Response(JSON.stringify({ brand: {} }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  router.refresh.mockClear();
  router.push.mockClear();
  window.history.replaceState(null, "", "/brands/hero-brand");
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the panel shows on the first load whenever confirmation is needed", () => {
  it("low confidence: the panel, with the location and Tradies' types first; Run audit waits for it", () => {
    renderBrand("needs_confirmation");
    expect(screen.getByText("Confirm your business details")).toBeInTheDocument();
    expect(screen.getByText("Needs your confirmation")).toBeInTheDocument();
    const location = document.querySelector("[data-confirm-location]");
    expect(location).toHaveTextContent("Yennora, NSW");
    expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument();
    const chips = [...document.querySelectorAll("[data-category-choices] button")].map(
      (b) => b.textContent,
    );
    expect(chips).toEqual(["Plumbing", "Electrical", "Building & construction", "General trades"]);
    expect(screen.queryByText("Design software")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Other types/ }));
    expect(screen.getByText("Design software")).toBeInTheDocument();
    expect(runAudit()).toBeDisabled();
  });

  it("Change shows the location picker inside the panel", () => {
    renderBrand("needs_confirmation");
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByText("Confirm your business location")).toBeInTheDocument();
  });

  it.each([
    ["failed", null],
    ["timed out (no result written)", null],
  ])("%s: the same panel, choose below, and no raw error or 'failed' banner", (_how, classification) => {
    renderBrand("could_not_classify", classification);
    expect(screen.getByText("Confirm your business details")).toBeInTheDocument();
    expect(
      screen.getByText(/We couldn.t work this out automatically — choose below\./),
    ).toBeInTheDocument();
    expect(screen.getByText("Couldn't work it out — choose below")).toBeInTheDocument();
    expect(screen.queryByText("Classification failed")).toBeNull();
    expect(screen.queryByText("Retry classification")).toBeNull();
    expect(runAudit()).toBeDisabled();
  });
});

describe("while the classifier runs", () => {
  it("says so, waits, and asks the server again every 5 seconds -- no reload needed", () => {
    vi.useFakeTimers();
    renderBrand("running", null);
    expect(document.querySelector("[data-classification-running]")).toHaveTextContent(
      "Working out your business type…",
    );
    expect(screen.getByText("Working out your business type")).toBeInTheDocument();
    expect(screen.queryByText("Classification pending")).toBeNull();
    expect(screen.queryByText("Confirm your business details")).toBeNull();
    expect(runAudit()).toBeDisabled();
    expect(router.refresh).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(5_000));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(10_000));
    expect(router.refresh).toHaveBeenCalledTimes(3);
  });

  it("stops asking once the timeout has passed", () => {
    vi.useFakeTimers();
    renderBrand("running", null);
    act(() => vi.advanceTimersByTime(3 * 60_000 + 30_000));
    const calls = router.refresh.mock.calls.length;
    act(() => vi.advanceTimersByTime(60_000));
    expect(router.refresh.mock.calls.length).toBe(calls);
  });
});

describe("one first-audit message, true to what happens", () => {
  it.each([
    "needs_confirmation",
    "running",
    "could_not_classify",
  ] as const)("%s, after the wizard's refused first audit: one line, no 'Run audit to try again', no fallback", (state) => {
    sessionStorage.setItem(
      "first-audit-failed-hero-brand",
      "Confirm your business type and location before running an audit.",
    );
    window.history.replaceState(null, "", "/brands/hero-brand?firstAudit=failed");
    renderBrand(state, state === "needs_confirmation" ? LOW_CONFIDENCE : null);
    const text = document.body.textContent ?? "";
    expect(document.querySelectorAll("[data-blocked-line]")).toHaveLength(1);
    expect(document.querySelector("[data-blocked-line]")).toHaveTextContent(
      state === "running"
        ? "Your brand was created. We're working out your business type below; confirm it there to run the first audit."
        : "Your brand was created. Confirm your business details below to run the first audit.",
    );
    expect(document.querySelector("[data-action-error]")).toBeNull();
    expect(text).not.toMatch(
      /Run audit to try again|still running|generic fallback|takes 30 seconds/,
    );
    expect(window.location.search).toBe("");
  });

  it("a first audit refused for another reason still says why, in red", () => {
    sessionStorage.setItem("first-audit-failed-hero-brand", "Your plan's audit limit is reached.");
    window.history.replaceState(null, "", "/brands/hero-brand?firstAudit=failed");
    renderBrand("complete");
    expect(document.querySelector("[data-action-error]")).toHaveTextContent(
      "Your brand was created, but the first audit couldn't start: Your plan's audit limit is reached. Run audit to try again.",
    );
    expect(document.querySelector("[data-blocked-line]")).toBeNull();
  });
});

describe("after Confirm, Run audit works and the audit starts", () => {
  it("confirms, the page comes back complete, and Run audit posts the audit", async () => {
    const view = renderBrand("needs_confirmation");
    fireEvent.click(screen.getByRole("button", { name: "Households" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/brands/hero-brand/confirm-classification",
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
    const body = JSON.parse(
      fetchMock.mock.calls.find((c) => String(c[0]).endsWith("confirm-classification"))?.[1].body,
    );
    expect(body).toMatchObject({ categories: ["trades_general"], audience: "households" });
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());

    // What router.refresh brings back: the brand confirmed.
    view.rerender(
      <BrandDetailClient
        {...PROPS}
        classificationState="complete"
        brand={{
          ...HERO,
          classificationStatus: "complete",
          classification: LOW_CONFIDENCE,
          audience: "households",
        }}
      />,
    );
    expect(screen.queryByText("Confirm your business details")).toBeNull();
    expect(document.querySelector("[data-blocked-line]")).toBeNull();
    expect(runAudit()).toBeEnabled();
    fireEvent.click(runAudit());
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/audits",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ brandId: "hero-brand" }),
        }),
      ),
    );
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/audits/a-1"));
  });
});
