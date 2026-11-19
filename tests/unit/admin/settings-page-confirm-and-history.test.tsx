// @vitest-environment jsdom
/**
 * 19 Nov (Sri's review of /admin/settings, after "Count Google in the headline" was ticked by accident and was on
 * for 2 minutes):
 * - the headline box asks first, with what it does, and saves only once that's accepted; the other boxes and the
 *   dropdowns still save at once, and every control says which kind it is;
 * - one save at a time: a second save while one is on its way sends nothing;
 * - the Changes log shows a run of identical saves that changed nothing as one row ("13 saves, no change");
 * - Provider errors says "No provider errors since <the latest> (last Google run: ...)" when no error is newer than
 *   the last clean run, with the older ones folded away.
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { GoogleOperatorHealth } from "@/lib/audit/google-surfaces/operator";
import type { GoogleSurfaceAdminView } from "@/lib/governance/google-surfaces";

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: nav.refresh }) }));

const ORG = "11111111-1111-4111-8111-111111111111";

function view(overrides: Partial<GoogleSurfaceAdminView> = {}): GoogleSurfaceAdminView {
  return {
    envEnabled: true,
    credentialsPresent: true,
    settings: {
      aiOverviewsEnabled: true,
      aiModeEnabled: true,
      countInHeadline: false,
      queueMode: "standard",
      device: "desktop",
      maxCostUsdPerAudit: 0.1,
    },
    workspaces: [{ id: ORG, name: "Splice" }],
    selected: null,
    history: [],
    ...overrides,
  };
}

const LOGIN_REJECTED: GoogleOperatorHealth["providerErrorGroups"]["groups"][number] = {
  key: "a44|40100|login",
  // 12 Nov 19:31 Sydney time.
  at: "2026-11-12T08:31:00.000Z",
  auditNumber: 44,
  workspace: "Splice",
  brand: "Omega Services",
  code: 40100,
  category: "login rejected",
  message: "40100 You are not authorized to access this resource.",
  surfaces: [{ surface: "AI Mode", count: 13 }],
  rows: [{ id: "r1", at: "2026-11-12T08:31:00.000Z", surface: "AI Mode", prompt: "Best plumber?" }],
};

function health(overrides: Partial<GoogleOperatorHealth> = {}): GoogleOperatorHealth {
  return {
    lastRun: null,
    providerErrorGroups: { groups: [], total: 0 },
    lastCleanRun: null,
    ...overrides,
  };
}

let Admin: typeof import("@/components/domain/admin/google-surfaces-admin").GoogleSurfacesAdmin;
let CONFIRM = "";

beforeAll(async () => {
  const mod = await import("@/components/domain/admin/google-surfaces-admin");
  Admin = mod.GoogleSurfacesAdmin;
  CONFIRM = mod.COUNT_IN_HEADLINE_CONFIRM;
  render(createElement(Admin, { view: view(), health: health() }));
  cleanup();
}, 60_000);

beforeEach(() => {
  nav.refresh.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetch() {
  const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
    Response.json({ status: "saved" }),
  );
  vi.stubGlobal("fetch", fetchImpl);
  return fetchImpl;
}

const headlineBox = () =>
  screen.getByRole("checkbox", { name: /Count Google in the headline Visibility %/ });

describe("the headline box asks before it saves", () => {
  it("ticking it sends nothing: it says what it does, and Cancel leaves it as saved", () => {
    const fetchImpl = stubFetch();
    render(createElement(Admin, { view: view(), health: health() }));
    fireEvent.click(headlineBox());
    expect(fetchImpl).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent(
      "This changes how every new audit's score is calculated, and those scores won't compare with earlier audits.",
    );
    expect(CONFIRM).toBe(
      "This changes how every new audit's score is calculated, and those scores won't compare with earlier audits.",
    );
    expect(headlineBox()).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("accepted, it saves the change", async () => {
    const fetchImpl = stubFetch();
    render(createElement(Admin, { view: view(), health: health() }));
    fireEvent.click(headlineBox());
    fireEvent.click(screen.getByRole("button", { name: "Yes, turn it on" }));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(JSON.parse(String(init?.body))).toEqual({
      kind: "setting",
      name: "countInHeadline",
      value: true,
    });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("turning it off asks too", () => {
    const fetchImpl = stubFetch();
    const on = view();
    on.settings.countInHeadline = true;
    render(createElement(Admin, { view: on, health: health() }));
    fireEvent.click(headlineBox());
    expect(screen.getByRole("alertdialog")).toHaveTextContent(CONFIRM);
    expect(screen.getByRole("button", { name: "Yes, turn it off" })).toBeInTheDocument();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("the other boxes still save at once, and every control says which kind it is", () => {
    const fetchImpl = stubFetch();
    const { container } = render(createElement(Admin, { view: view(), health: health() }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: /AI Overviews on for every eligible workspace/ }),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(/Tick boxes and dropdowns save as soon as you change them/),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('[data-admin-saves="asks-first"]')).toHaveLength(1);
    // The two surface boxes and the two dropdowns.
    expect(container.querySelectorAll('[data-admin-saves="on-change"]')).toHaveLength(4);
    expect(
      container.querySelector('[data-admin-setting="countInHeadline"] [data-admin-saves]'),
    ).toHaveTextContent("Asks first, then saves");
  });
});

describe("one save at a time", () => {
  it("a second save while the first is on its way sends nothing", async () => {
    let release: () => void = () => {};
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(Response.json({ status: "saved" }));
        }),
    );
    vi.stubGlobal("fetch", fetchImpl);
    const { useSave } = await import("@/components/shared/save-feedback");
    const { result } = renderHook(() => useSave("/api/admin/settings"));
    let first: Promise<boolean> = Promise.resolve(false);
    let second: Promise<boolean> = Promise.resolve(true);
    act(() => {
      first = result.current.save({ kind: "brand", postcode: "2153" });
      second = result.current.save({ kind: "brand", postcode: "2153" });
    });
    expect(await second).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await act(async () => {
      release();
      await first;
    });
    // Once it's back, the next save goes.
    act(() => {
      void result.current.save({ kind: "brand", postcode: "2154" });
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("the Changes log folds saves that changed nothing", () => {
  it("13 identical '2153 → 2153' saves are one row; a real change is its own", () => {
    const history: GoogleSurfaceAdminView["history"] = [
      ...Array.from({ length: 13 }, (_, i) => ({
        at: new Date(Date.UTC(2026, 10, 11, 2, 30 - i)).toISOString(),
        scope: "brand" as const,
        setting: "google_location_postcode",
        target: "Omega Services",
        from: "2153",
        to: "2153",
        by: "operator@example.test",
      })),
      {
        at: "2026-11-11T01:00:00.000Z",
        scope: "brand" as const,
        setting: "google_location_postcode",
        target: "Omega Services",
        from: null,
        to: "2153",
        by: "operator@example.test",
      },
    ];
    const { container } = render(
      createElement(Admin, { view: view({ history }), health: health() }),
    );
    expect(container.querySelectorAll('[data-admin-history-row="no-change"]')).toHaveLength(1);
    expect(screen.getByText("13 saves, no change (2153)")).toBeInTheDocument();
    expect(container.querySelectorAll('[data-admin-history-row="change"]')).toHaveLength(1);
    expect(screen.getByText("none → 2153")).toBeInTheDocument();
    expect(screen.queryByText("2153 → 2153")).not.toBeInTheDocument();
  });
});

describe("Provider errors say when the last one was", () => {
  it("none since the last clean run: the line, and the 12 Nov error folded away", () => {
    const { container } = render(
      createElement(Admin, {
        view: view(),
        health: health({
          providerErrorGroups: { groups: [LOGIN_REJECTED], total: 1 },
          lastCleanRun: {
            startedAt: "2026-11-19T08:55:00.000Z",
            at: "2026-11-19T09:10:00.000Z",
            auditNumber: 61,
            brand: "Omega Services",
            questions: 26,
            checked: 26,
          },
        }),
      }),
    );
    expect(container.querySelector("[data-admin-provider-errors-summary]")).toHaveTextContent(
      "No provider errors since 12 Nov 19:31 Sydney time (last Google run: 26 of 26 questions checked at 19 Nov 20:10 Sydney time, audit #61, Omega Services)",
    );
    const older = container.querySelector("[data-admin-provider-errors-older]");
    expect(older).toHaveTextContent("1 older error, from before the last clean Google run");
    expect(older).not.toHaveAttribute("open");
    expect(older?.querySelector('[data-admin-provider-error="40100"]')).not.toBeNull();
  });

  it("an error newer than the last clean run is shown as current, with no 'none since' line", () => {
    const { container } = render(
      createElement(Admin, {
        view: view(),
        health: health({
          providerErrorGroups: {
            groups: [{ ...LOGIN_REJECTED, at: "2026-11-19T09:00:00.000Z", key: "a62" }],
            total: 1,
          },
          lastCleanRun: {
            startedAt: "2026-11-19T08:55:00.000Z",
            at: "2026-11-19T09:10:00.000Z",
            auditNumber: 61,
            brand: "Omega Services",
            questions: 26,
            checked: 26,
          },
        }),
      }),
    );
    expect(container.querySelector("[data-admin-provider-errors-summary]")).toBeNull();
    expect(container.querySelector("[data-admin-provider-errors-older]")).toBeNull();
    expect(container.querySelector('[data-admin-provider-error="40100"]')).not.toBeNull();
  });
});
