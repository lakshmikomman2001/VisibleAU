// @vitest-environment jsdom
/**
 * S00 part 2 (22 Nov; LLD section 17): the "Feature flags" card on /admin/settings. It loads its view from
 * GET /api/admin/feature-flags ("Loading…", then the table, or "Couldn't load the feature flags" with Try again);
 * every flag with its global value; for a chosen workspace its override (Default / On / Off) and what it gets; each
 * control saves when changed (POST) and the card loads again. It sits above the Changes log it writes to, and
 * without it the page is as before.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { GoogleOperatorHealth } from "@/lib/audit/google-surfaces/operator";
import type { FeatureFlagAdminView } from "@/lib/flags/admin";
import { FLAGS } from "@/lib/flags/flags";
import type { GoogleSurfaceAdminView } from "@/lib/governance/google-surfaces";

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: nav.refresh }) }));

const ORG = "11111111-1111-4111-8111-111111111111";

function flagsView(
  opts: { workspace?: boolean; reportV2Global?: boolean; reportV2Override?: boolean | null } = {},
): FeatureFlagAdminView {
  const workspace = opts.workspace ? { id: ORG, name: "Splice" } : null;
  return {
    workspace,
    flags: FLAGS.map((f) => {
      const global = f.name === "report_v2" ? (opts.reportV2Global ?? false) : false;
      const override = workspace && f.name === "report_v2" ? (opts.reportV2Override ?? null) : null;
      return {
        name: f.name,
        gates: f.gates,
        sprint: f.sprint,
        global,
        override,
        effective: workspace ? (override ?? global) : null,
      };
    }),
  };
}

function googleView(): GoogleSurfaceAdminView {
  return {
    envEnabled: true,
    credentialsPresent: true,
    settings: {
      aiOverviewsEnabled: false,
      aiModeEnabled: false,
      countInHeadline: false,
      queueMode: "standard",
      device: "desktop",
      maxCostUsdPerAudit: 0.1,
    },
    workspaces: [{ id: ORG, name: "Splice" }],
    selected: null,
    history: [],
  };
}

const HEALTH: GoogleOperatorHealth = {
  lastRun: null,
  providerErrorGroups: { groups: [], total: 0 },
  lastCleanRun: null,
};

type Module = typeof import("@/components/domain/admin/feature-flags-admin");
let Card: Module["FeatureFlagsAdmin"];
let Table: Module["FeatureFlagsTable"];
let Page: typeof import("@/components/domain/admin/google-surfaces-admin").GoogleSurfacesAdmin;

// A first render in jsdom can take seconds under load: load the components once first.
beforeAll(async () => {
  const mod = await import("@/components/domain/admin/feature-flags-admin");
  Card = mod.FeatureFlagsAdmin;
  Table = mod.FeatureFlagsTable;
  Page = (await import("@/components/domain/admin/google-surfaces-admin")).GoogleSurfacesAdmin;
  render(createElement(Table, { view: flagsView(), onSaved: () => {} }));
  cleanup();
}, 60_000);

beforeEach(() => {
  nav.refresh.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** GET answers `views` in turn (the last one repeats); POST answers `{ ok, status }`. Every call is recorded. */
function stubApi(
  views: Array<FeatureFlagAdminView | "fail">,
  status: "saved" | "unchanged" = "saved",
) {
  let gets = 0;
  const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
    if ((init?.method ?? "GET") === "POST") return Response.json({ ok: true, status });
    const answer = views[Math.min(gets++, views.length - 1)];
    return answer === "fail"
      ? Response.json({ error: "Database unavailable" }, { status: 500 })
      : Response.json(answer);
  });
  vi.stubGlobal("fetch", fetchImpl);
  return fetchImpl;
}

const posts = (fetchImpl: ReturnType<typeof stubApi>) =>
  fetchImpl.mock.calls.filter(([, init]) => init?.method === "POST");

describe("the Feature flags table", () => {
  it("lists every flag, off by default, with what it turns on; no workspace column until one is chosen", () => {
    render(createElement(Table, { view: flagsView(), onSaved: () => {} }));
    expect(document.querySelectorAll("[data-admin-flag]").length).toBe(13);
    for (const f of FLAGS) {
      expect(screen.getByTestId(`admin-flag-global-${f.name}`)).not.toBeChecked();
      expect(screen.getByText(`${f.gates} (${f.sprint})`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId("admin-flag-override-report_v2")).toBeNull();
    expect(
      screen.getByText("Choose a workspace under One workspace to set its own value for a flag."),
    ).toBeInTheDocument();
  });

  it("for a chosen workspace: its override, what it gets, and the global value in the Default option", () => {
    render(
      createElement(Table, {
        view: flagsView({ workspace: true, reportV2Global: true, reportV2Override: false }),
        onSaved: () => {},
      }),
    );
    expect(screen.getByRole("columnheader", { name: "Splice" })).toBeInTheDocument();
    expect(screen.getByTestId("admin-flag-global-report_v2")).toBeChecked();
    const select = screen.getByTestId("admin-flag-override-report_v2") as HTMLSelectElement;
    expect(select.value).toBe("off");
    expect(within(select).getByRole("option", { name: "Default (on)" })).toBeInTheDocument();
    const row = select.closest("[data-admin-flag]") as HTMLElement;
    expect(row.querySelector("[data-admin-flag-effective]")).toHaveAttribute(
      "data-admin-flag-effective",
      "off",
    );
    const other = screen.getByTestId("admin-flag-override-qi_website") as HTMLSelectElement;
    expect(other.value).toBe("default");
    expect(within(other).getByRole("option", { name: "Default (off)" })).toBeInTheDocument();
  });
});

describe("the Feature flags card", () => {
  it("says it's loading, then shows the flags the API sent for the chosen workspace", async () => {
    const fetchImpl = stubApi([flagsView({ workspace: true })]);
    render(createElement(Card, { workspaceId: ORG }));
    expect(screen.getByText("Loading the feature flags…")).toBeInTheDocument();
    expect(await screen.findByTestId("admin-flag-override-report_v2")).toBeInTheDocument();
    expect(String(fetchImpl.mock.calls[0][0])).toBe(`/api/admin/feature-flags?workspace=${ORG}`);
  });

  it("couldn't load: says so with the server's reason and Try again, and no table of defaults", async () => {
    stubApi(["fail", flagsView()]);
    render(createElement(Card, { workspaceId: null }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveAttribute("data-load-error");
    expect(alert).toHaveTextContent("Database unavailable");
    expect(screen.queryByTestId("admin-flag-global-report_v2")).toBeNull();
    fireEvent.click(within(alert).getByRole("button"));
    expect(await screen.findByTestId("admin-flag-global-report_v2")).toBeInTheDocument();
  });

  // S03 part 0, LLD amendment 81: "Ticking a flag's Everyone box asks first, with the existing confirm dialog" -- it
  // saved on the tick until then (S00 part 2).
  it("ticking a flag's Everyone box and confirming saves the global value, then the card loads again", async () => {
    const fetchImpl = stubApi([flagsView(), flagsView({ reportV2Global: true })]);
    render(createElement(Card, { workspaceId: null }));
    fireEvent.click(await screen.findByTestId("admin-flag-global-report_v2"));
    const dialog = await screen.findByRole("alertdialog", {
      name: "Turn report_v2 on for every workspace?",
    });
    expect(posts(fetchImpl)).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Turn on for everyone" }));
    await waitFor(() => expect(posts(fetchImpl)).toHaveLength(1));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    const [url, init] = posts(fetchImpl)[0];
    expect(url).toBe("/api/admin/feature-flags");
    expect(JSON.parse(String(init?.body))).toEqual({
      scope: "global",
      flag: "report_v2",
      enabled: true,
    });
    await waitFor(() => expect(screen.getByTestId("admin-flag-global-report_v2")).toBeChecked());
    expect(nav.refresh).toHaveBeenCalled();
  });

  it("choosing On for the workspace saves its override; choosing the value already set sends nothing", async () => {
    const fetchImpl = stubApi([flagsView({ workspace: true })]);
    render(createElement(Card, { workspaceId: ORG }));
    const select = await screen.findByTestId("admin-flag-override-visibility_reach");
    fireEvent.change(select, { target: { value: "default" } });
    expect(posts(fetchImpl)).toHaveLength(0);
    fireEvent.change(select, { target: { value: "on" } });
    await waitFor(() => expect(posts(fetchImpl)).toHaveLength(1));
    expect(JSON.parse(String(posts(fetchImpl)[0][1]?.body))).toEqual({
      scope: "workspace",
      workspaceId: ORG,
      flag: "visibility_reach",
      state: "on",
    });
  });

  it("says when a save changed nothing", async () => {
    stubApi([flagsView()], "unchanged");
    render(createElement(Card, { workspaceId: null }));
    fireEvent.click(await screen.findByTestId("admin-flag-global-qi_learning"));
    fireEvent.click(await screen.findByRole("button", { name: "Turn on for everyone" }));
    expect(await screen.findByText(/no change/i)).toBeInTheDocument();
  });
});

/** S03 part 0 (LLD amendment 81): switching a flag on for every workspace asks first; switching it off doesn't. */
describe("the Everyone box asks before turning a flag on for every workspace (amendment 81)", () => {
  it("the dialog: its title, what the flag turns on, and focus on Cancel", async () => {
    stubApi([flagsView()]);
    render(createElement(Card, { workspaceId: null }));
    fireEvent.click(await screen.findByTestId("admin-flag-global-question_library"));
    const dialog = await screen.findByRole("alertdialog", {
      name: "Turn question_library on for every workspace?",
    });
    expect(dialog).toHaveTextContent(
      "The brand's Questions tab. A workspace with its own setting keeps it.",
    );
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(within(dialog).getByRole("button", { name: "Turn on for everyone" })).toBeEnabled();
  });

  it("Cancel leaves the box unticked and saves nothing", async () => {
    const fetchImpl = stubApi([flagsView()]);
    render(createElement(Card, { workspaceId: null }));
    const box = await screen.findByTestId("admin-flag-global-question_library");
    fireEvent.click(box);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(box).not.toBeChecked();
    expect(posts(fetchImpl)).toHaveLength(0);
  });

  it("Escape is Cancel: nothing saved", async () => {
    const fetchImpl = stubApi([flagsView()]);
    render(createElement(Card, { workspaceId: null }));
    fireEvent.click(await screen.findByTestId("admin-flag-global-agency_questions"));
    await screen.findByRole("alertdialog");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.getByTestId("admin-flag-global-agency_questions")).not.toBeChecked();
    expect(posts(fetchImpl)).toHaveLength(0);
  });

  it("unticking needs no confirmation: it saves at once", async () => {
    const fetchImpl = stubApi([flagsView({ reportV2Global: true }), flagsView()]);
    render(createElement(Card, { workspaceId: null }));
    const box = await screen.findByTestId("admin-flag-global-report_v2");
    expect(box).toBeChecked();
    fireEvent.click(box);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(posts(fetchImpl)).toHaveLength(1));
    expect(JSON.parse(String(posts(fetchImpl)[0][1]?.body))).toEqual({
      scope: "global",
      flag: "report_v2",
      enabled: false,
    });
  });

  it("the workspace dropdown is unchanged: choosing On saves at once, with no dialog", async () => {
    const fetchImpl = stubApi([flagsView({ workspace: true })]);
    render(createElement(Card, { workspaceId: ORG }));
    fireEvent.change(await screen.findByTestId("admin-flag-override-question_library"), {
      target: { value: "on" },
    });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(posts(fetchImpl)).toHaveLength(1));
  });
});

describe("/admin/settings with and without the card", () => {
  it("the card sits above the Changes log", () => {
    stubApi([flagsView()]);
    render(
      createElement(Page, {
        view: googleView(),
        health: HEALTH,
        flags: createElement(Card, { workspaceId: null }),
      }),
    );
    const flags = document.querySelector("[data-admin-flags]");
    const history = document.querySelector("[data-admin-history]");
    expect(flags).not.toBeNull();
    expect(history).not.toBeNull();
    expect(
      (flags as Element).compareDocumentPosition(history as Element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("without it, the page is as before: no Feature flags section", () => {
    render(createElement(Page, { view: googleView(), health: HEALTH }));
    expect(document.querySelector("[data-admin-flags]")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Feature flags" })).toBeNull();
  });
});
