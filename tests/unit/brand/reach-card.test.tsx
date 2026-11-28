// @vitest-environment jsdom
/**
 * S04 part 6 (contract P01.reach; LLD 8.4.1): the reach card.
 * - Local's switch is locked on ("Local, always on", aria-disabled) and clicking it does nothing; the Local row shows
 *   only the chips the brand has, and "Change" opens the location editor.
 * - Turning NSW on splits 10 as 5/5; Australia then 4/3/3, "10 of 10"; at the limit every + is off with the tooltip.
 * - Fewer than 5 questions reads "(small sample)" with its tooltip; the bar is named "Local 4, NSW 3, Australia 3".
 * - On Growth (2 areas) with NSW on, Australia and Worldwide stay off with the Agency lock and an Upgrade link.
 * - Save is off until something changes; it PUTs every reach, keeps the returned draft and opens the Questions tab in
 *   edit mode; a 402 shows appendix E's sentence under the total; Cancel restores the saved values.
 * - View only: the banner, switches and steppers off, no actions. Loading: the skeleton; an error: Retry.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push, replace: vi.fn() }),
  usePathname: () => "/brands",
  useSearchParams: () => new URLSearchParams(),
}));

import { ReachCard } from "@/components/domain/brand/reach-card";
import type { ReachSettingsView } from "@/lib/reach/settings";

const BRAND = "8a2d4c6e-1f3b-4a5c-9d7e-0b1c2d3e4f50";
const LIMIT =
  "Your plan includes 10 everyday questions per brand. Remove one, or add a question pack.";

function view(plan: "agency" | "growth" = "agency"): ReachSettingsView {
  return {
    reaches: [
      {
        reach: "local",
        title: "Local",
        label: "Local · Chatswood",
        available: true,
        enabled: true,
        place: { suburb: "Chatswood", state: "NSW", postcode: "2067" },
        targetCount: 10,
      },
      {
        reach: "state",
        title: "State",
        label: "NSW",
        available: true,
        enabled: false,
        place: { state: "NSW" },
        targetCount: 0,
      },
      {
        reach: "country",
        title: "Country",
        label: "Australia",
        available: true,
        enabled: false,
        place: { country: "AU" },
        targetCount: 0,
      },
      {
        reach: "global",
        title: "Worldwide",
        label: "Worldwide",
        available: true,
        enabled: false,
        place: {},
        targetCount: 0,
      },
    ],
    plan:
      plan === "agency"
        ? { key: "agency", name: "Agency", reachesAllowed: 4 }
        : { key: "growth", name: "Growth", reachesAllowed: 2 },
    plansForReaches:
      plan === "agency"
        ? {}
        : { 3: { key: "agency", name: "Agency" }, 4: { key: "agency", name: "Agency" } },
    everydayAllowed: 10,
    everydayMin: 5,
    localMin: 4,
    stateCapital: "Sydney",
    areas: ["NSW:Chatswood", "NSW:Lane Cove"],
    suggestions: [],
    packsOffered: false,
  };
}

type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];
function stubFetch(get: ReachSettingsView | number, putRes?: { status: number; body: unknown }) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (init?.method === "PUT" && putRes)
        return new Response(JSON.stringify(putRes.body), { status: putRes.status });
      if (typeof get === "number") return new Response("{}", { status: get });
      return new Response(JSON.stringify(get), { status: 200 });
    }),
  );
}

async function renderCard(props: { canEdit?: boolean; onChangeLocation?: () => void } = {}) {
  await act(async () => {
    render(
      <ReachCard
        brandId={BRAND}
        canEdit={props.canEdit ?? true}
        onChangeLocation={props.onChangeLocation ?? (() => {})}
      />,
    );
  });
}

const row = (reach: string) => screen.getByTestId(`p01-reach-row-${reach}`);
const value = (reach: string) =>
  within(row(reach)).getByRole("spinbutton").getAttribute("aria-valuenow");

beforeAll(async () => {
  // jsdom's first render is slow on this machine (project_jsdom_first_render_timeout): warm up once.
  stubFetch(view());
  await renderCard();
  cleanup();
}, 30_000);
beforeEach(() => {
  push.mockReset();
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ReachCard", () => {
  it("Local is locked on; its chips and Change", async () => {
    const change = vi.fn();
    stubFetch(view());
    await renderCard({ onChangeLocation: change });
    const local = within(row("local")).getByRole("switch", { name: "Local, always on" });
    expect(local).toHaveAttribute("aria-checked", "true");
    expect(local).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(local);
    expect(local).toHaveAttribute("aria-checked", "true");
    expect(row("local")).toHaveTextContent("Areas: Chatswood, Lane Cove");
    expect(row("local")).toHaveTextContent("Suburb: Chatswood NSW 2067");
    expect(row("local")).not.toHaveTextContent("City:");
    fireEvent.click(within(row("local")).getByRole("button", { name: "Change" }));
    expect(change).toHaveBeenCalledOnce();
    expect(row("state")).toHaveTextContent(
      "Google AI checked from NSW, or Sydney if a state can't be set (labelled)",
    );
    expect(screen.getByTestId("p01-reach")).toHaveTextContent(
      "Local is always on. Add NSW, Australia or worldwide to see whether AI recommends you beyond your area.",
    );
    expect(screen.getByTestId("p01-reach-plan")).toHaveTextContent("Agency: up to 4 areas");
  });

  it("the default split, the total, the bar, small samples and the limit", async () => {
    stubFetch(view());
    await renderCard();
    expect(screen.getByTestId("p01-reach-save")).toBeDisabled();
    fireEvent.click(within(row("state")).getByRole("switch", { name: "State" }));
    expect([value("local"), value("state")]).toEqual(["5", "5"]);
    fireEvent.click(within(row("country")).getByRole("switch", { name: "Country" }));
    expect([value("local"), value("state"), value("country")]).toEqual(["4", "3", "3"]);
    expect(screen.getByTestId("p01-reach-total")).toHaveTextContent("10 of 10");
    expect(screen.getByRole("img", { name: "Local 4, NSW 3, Australia 3" })).toBeInTheDocument();
    const legend = screen.getByTestId("p01-reach-legend");
    expect(legend).toHaveTextContent(
      "Local 4 (small sample)· NSW 3 (small sample)· Australia 3 (small sample)",
    );
    expect(within(legend).getAllByTitle(/^Small sample \(3 questions\)/)).toHaveLength(2);
    const more = within(row("state")).getByRole("button", { name: "More NSW questions" });
    expect(more).toBeDisabled();
    expect(more).toHaveAttribute(
      "title",
      "Limit reached. Lower another area or add a question pack.",
    );
    expect(within(row("global")).getByRole("spinbutton")).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(
      within(row("country")).getByRole("button", { name: "Fewer Australia questions" }),
    );
    expect(screen.getByTestId("p01-reach-total")).toHaveTextContent("9 of 10");
    expect(more).not.toBeDisabled();
  });

  it("a plan's reach limit locks the rest, with the plan and Upgrade", async () => {
    stubFetch(view("growth"));
    await renderCard();
    fireEvent.click(within(row("state")).getByRole("switch", { name: "State" }));
    const lock = screen.getByTestId("p01-reach-lock-country");
    expect(lock).toHaveTextContent("Agency");
    expect(lock).toHaveTextContent("Available on Agency and up");
    expect(within(lock).getByRole("link", { name: "Upgrade" })).toHaveAttribute("href", "/pricing");
    expect(screen.getByTestId("p01-reach-lock-global")).toBeInTheDocument();
    const country = within(row("country")).getByRole("switch", { name: "Country" });
    fireEvent.click(country);
    expect(country).toHaveAttribute("aria-checked", "false");
  });

  it("Save PUTs every reach, keeps the draft and opens edit mode; Cancel restores", async () => {
    const draft = { baseVersion: 1, items: [], archive: [] };
    stubFetch(view(), { status: 200, body: { ...view(), draft } });
    await renderCard();
    fireEvent.click(within(row("state")).getByRole("switch", { name: "State" }));
    fireEvent.click(screen.getByTestId("p01-reach-cancel"));
    expect(value("local")).toBe("10");
    expect(screen.getByTestId("p01-reach-save")).toBeDisabled();

    fireEvent.click(within(row("state")).getByRole("switch", { name: "State" }));
    await act(async () => {
      fireEvent.click(screen.getByTestId("p01-reach-save"));
    });
    const put = calls.find((c) => c.init?.method === "PUT");
    expect(JSON.parse(String(put?.init?.body))).toEqual({
      reaches: [
        {
          reach: "local",
          enabled: true,
          place: { suburb: "Chatswood", state: "NSW", postcode: "2067" },
          targetCount: 5,
        },
        { reach: "state", enabled: true, place: { state: "NSW" }, targetCount: 5 },
        { reach: "country", enabled: false, place: null, targetCount: 0 },
        { reach: "global", enabled: false, place: null, targetCount: 0 },
      ],
    });
    expect(
      JSON.parse(window.sessionStorage.getItem(`vunnara:questions-draft:${BRAND}`) ?? ""),
    ).toEqual(draft);
    expect(push).toHaveBeenCalledWith(`/brands/${BRAND}/questions?edit=1`);
  });

  it("a 402 shows the plan's sentence under the total", async () => {
    stubFetch(view(), {
      status: 402,
      body: { error: "question_limit", message: LIMIT, limit: 10 },
    });
    await renderCard();
    fireEvent.click(within(row("state")).getByRole("switch", { name: "State" }));
    await act(async () => {
      fireEvent.click(screen.getByTestId("p01-reach-save"));
    });
    expect(screen.getByTestId("p01-reach-over-limit")).toHaveTextContent(LIMIT);
    expect(push).not.toHaveBeenCalled();
  });

  it("view only: the banner, controls off, no actions", async () => {
    stubFetch(view());
    await renderCard({ canEdit: false });
    expect(screen.getByTestId("p01-reach-no-permission")).toHaveTextContent(
      "View only. Owners and admins can change these settings.",
    );
    const state = within(row("state")).getByRole("switch", { name: "State" });
    expect(state).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(state);
    expect(state).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByTestId("p01-reach-save")).toBeNull();
    expect(within(row("local")).queryByRole("button", { name: "Change" })).toBeNull();
  });

  it("loading, then an error with Retry", async () => {
    stubFetch(500);
    await renderCard();
    expect(screen.getByTestId("p01-reach-error")).toHaveTextContent(
      "We couldn't load these settings. Check your connection and try again.",
    );
    stubFetch(view());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    });
    expect(screen.getByTestId("p01-reach-list")).toBeInTheDocument();
  });
});

// S04B part 5 (LLD amendment 103; contract v1.10 P01.reach): the plan chip reads "up to 1 area" for one (it once
// printed "up to 1 areas"; S04 built the singular) and "up to {n} areas" otherwise; "(small sample)" shows for any
// reach under 5 questions, Local included (above: "Local 4 (small sample)").
describe("P01 copy (amendment 103)", () => {
  it("one area reads 'up to 1 area'", async () => {
    stubFetch({ ...view(), plan: { key: "starter", name: "Starter", reachesAllowed: 1 } });
    await renderCard();
    const chip = await screen.findByTestId("p01-reach-plan");
    expect(chip).toHaveTextContent("Starter: up to 1 area");
    expect(chip.textContent).not.toMatch(/areas/);
  });
});
