// @vitest-environment jsdom
/**
 * S04B part 4 (LLD amendment 102; contract P07.reachFilter, Segmented): "All areas · {reaches}" as a radiogroup of
 * radios named Area; the chosen one checked; choosing a reach puts it in the URL (?area=state) without scrolling, and
 * "All areas" takes it out, keeping the other parameters (the tab).
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ push: vi.fn(), search: "tab=analysis" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/audits/a1",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

import { ReachFilter } from "@/components/domain/audit/reach-filter";

const OPTIONS = [
  { value: "all", label: "All areas" },
  { value: "local", label: "Local · Kurrajong Heights" },
  { value: "state", label: "NSW" },
  { value: "country", label: "Australia" },
];

afterEach(() => {
  cleanup();
  nav.push.mockReset();
});

describe("P07.reachFilter", () => {
  it("is a radiogroup named Area with every option, the chosen one checked", () => {
    render(<ReachFilter options={OPTIONS} selected="all" />);
    const group = screen.getByRole("radiogroup", { name: "Area" });
    expect(
      within(group)
        .getAllByTestId("p07-reach-filter-option")
        .map((o) => o.textContent),
    ).toEqual(["All areas", "Local · Kurrajong Heights", "NSW", "Australia"]);
    expect(within(group).getByRole("radio", { name: "All areas" })).toBeChecked();
    expect(within(group).getByRole("radio", { name: "NSW" })).not.toBeChecked();
  });

  it("choosing a reach puts it in the URL, keeping the tab, without scrolling", () => {
    render(<ReachFilter options={OPTIONS} selected="all" />);
    fireEvent.click(screen.getByRole("radio", { name: "NSW" }));
    expect(nav.push).toHaveBeenCalledWith("/audits/a1?tab=analysis&area=state", { scroll: false });
  });

  it("All areas takes it out", () => {
    nav.search = "tab=analysis&area=state";
    render(<ReachFilter options={OPTIONS} selected="state" />);
    expect(screen.getByRole("radio", { name: "NSW" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "All areas" }));
    expect(nav.push).toHaveBeenCalledWith("/audits/a1?tab=analysis", { scroll: false });
    nav.search = "tab=analysis";
  });
});
