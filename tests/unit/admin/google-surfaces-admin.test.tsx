// @vitest-environment jsdom
/**
 * Google AI follow-ups (12 Nov) -- the operator's /admin/settings, clicked:
 * - part 4: Test connection says "Testing…", then what DataForSEO said and when, with a warning when the
 *   balance is under US$5; too soon, it says to wait (the server's words);
 * - part 5: every Save (postcodes, the ceiling, the dropdowns, the checkboxes) says "Saving…" and is
 *   disabled while it's sent, then "Saved", "No change" or the server's reason (keeping what was typed);
 *   a typed value's Save is disabled while it's unchanged or invalid (a postcode is four digits).
 *   Sri clicked Omega's postcode Save 15 times on 12 Nov because nothing on screen changed.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { GoogleOperatorHealth } from "@/lib/audit/google-surfaces/operator";
import type { GoogleSurfaceAdminView } from "@/lib/governance/google-surfaces";

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: nav.refresh }) }));

const ORG = "11111111-1111-4111-8111-111111111111";
const BRAND = "33333333-3333-4333-8333-333333333333";

function view(overrides: Partial<GoogleSurfaceAdminView> = {}): GoogleSurfaceAdminView {
  const off = { on: false, reason: "Off in the global settings" };
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
    selected: {
      id: ORG,
      name: "Splice",
      tier: "agency_pro",
      overrides: { google_ai_overviews: true, google_ai_mode: null },
      now: { google_ai_overviews: off, google_ai_mode: off },
      withEnvOn: { google_ai_overviews: off, google_ai_mode: off },
      brands: [
        { id: BRAND, name: "Omega Services", suburb: "Norwest", state: "NSW", postcode: "2153" },
      ],
    },
    history: [],
    ...overrides,
  };
}

const HEALTH: GoogleOperatorHealth = { lastRun: null, providerErrors: [] };

let Admin: typeof import("@/components/domain/admin/google-surfaces-admin").GoogleSurfacesAdmin;

// A first render in jsdom can take seconds under load: load the component once first.
beforeAll(async () => {
  Admin = (await import("@/components/domain/admin/google-surfaces-admin")).GoogleSurfacesAdmin;
}, 60_000);

beforeEach(() => {
  nav.refresh.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** A fetch whose answer the test releases, so "Testing…" / "Saving…" can be seen first. */
function heldFetch(answer: () => Response) {
  let release: () => void = () => {};
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = vi.fn(
    (url: string, init?: RequestInit) =>
      new Promise<Response>((resolve) => {
        calls.push({ url, init });
        release = () => resolve(answer());
      }),
  );
  vi.stubGlobal("fetch", fetchImpl);
  return { calls, release: () => release() };
}

describe("Test connection (part 4)", () => {
  it("'Testing…' while it runs, then DataForSEO's answer, the time checked and the low-balance warning", async () => {
    const held = heldFetch(() =>
      Response.json({
        state: "accepted",
        line: "Accepted · balance US$0.97",
        balanceUsd: 0.97,
        lowBalance: true,
        statusCode: 20000,
        checkedAt: "2026-11-12T03:15:00.000Z",
      }),
    );
    render(createElement(Admin, { view: view(), health: HEALTH }));
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    const testing = await screen.findByRole("button", { name: "Testing…" });
    expect(testing).toBeDisabled();
    expect(held.calls[0]).toMatchObject({
      url: "/api/admin/settings/test-connection",
      init: { method: "POST" },
    });
    held.release();
    expect(
      await screen.findByText("Accepted · balance US$0.97 · checked 03:15 UTC"),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("The balance is below US$5.");
    expect(screen.getByRole("button", { name: "Test connection" })).toBeEnabled();
  }, 30_000);

  it("rejected: the login is wrong, no balance warning", async () => {
    const held = heldFetch(() =>
      Response.json({
        state: "rejected",
        line: "Rejected: the login or password is wrong (DataForSEO 40100)",
        balanceUsd: null,
        lowBalance: false,
        statusCode: 40100,
        checkedAt: "2026-11-12T03:16:00.000Z",
      }),
    );
    render(createElement(Admin, { view: view(), health: HEALTH }));
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    held.release();
    expect(
      await screen.findByText(
        "Rejected: the login or password is wrong (DataForSEO 40100) · checked 03:16 UTC",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/below US\$5/)).not.toBeInTheDocument();
  }, 30_000);

  it("too soon: the server's words", async () => {
    const held = heldFetch(() =>
      Response.json({ error: "Wait 30 seconds between connection tests." }, { status: 429 }),
    );
    render(createElement(Admin, { view: view(), health: HEALTH }));
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    held.release();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Wait 30 seconds between connection tests.",
      ),
    );
  }, 30_000);
});

const ok =
  (status: "saved" | "unchanged" = "saved") =>
  () =>
    Response.json({ ok: true, status });

describe("every Save says what happened (part 5)", () => {
  it("a postcode: disabled while unchanged and while not four digits; 'Saving…', then 'Saved', and the page reloads", async () => {
    const held = heldFetch(ok());
    render(createElement(Admin, { view: view(), health: HEALTH }));
    const row = screen.getByLabelText("Postcode for Omega Services");
    const save = () =>
      screen
        .getAllByRole("button")
        .find((b) => b.closest(`[data-admin-field="postcode-${BRAND}"]`)) as HTMLElement;
    expect(row).toHaveValue("2153");
    expect(save()).toBeDisabled();

    fireEvent.change(row, { target: { value: "21" } });
    expect(save()).toBeDisabled();
    expect(screen.getByText("An Australian postcode is four digits.")).toBeInTheDocument();

    fireEvent.change(row, { target: { value: "2154" } });
    expect(save()).toBeEnabled();
    expect(screen.queryByText("An Australian postcode is four digits.")).not.toBeInTheDocument();
    fireEvent.click(save());
    expect(save()).toHaveTextContent("Saving…");
    expect(save()).toBeDisabled();
    expect(JSON.parse(String(held.calls[0].init?.body))).toEqual({
      kind: "brand",
      brandId: BRAND,
      postcode: "2154",
    });
    held.release();
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(nav.refresh).toHaveBeenCalledTimes(1);
  }, 30_000);

  it("a failed save shows the server's reason and keeps what was typed", async () => {
    const held = heldFetch(() =>
      Response.json({ error: "That brand doesn't exist." }, { status: 400 }),
    );
    render(createElement(Admin, { view: view(), health: HEALTH }));
    const row = screen.getByLabelText("Postcode for Omega Services");
    fireEvent.change(row, { target: { value: "2000" } });
    fireEvent.click(
      screen
        .getAllByRole("button")
        .find((b) => b.closest(`[data-admin-field="postcode-${BRAND}"]`)) as HTMLElement,
    );
    held.release();
    expect(await screen.findByRole("alert")).toHaveTextContent("That brand doesn't exist.");
    expect(row).toHaveValue("2000");
    expect(nav.refresh).not.toHaveBeenCalled();
  }, 30_000);

  it("the server had that value already: 'No change'", async () => {
    const held = heldFetch(ok("unchanged"));
    render(createElement(Admin, { view: view(), health: HEALTH }));
    fireEvent.change(screen.getByLabelText("Postcode for Omega Services"), {
      target: { value: "2000" },
    });
    fireEvent.click(
      screen
        .getAllByRole("button")
        .find((b) => b.closest(`[data-admin-field="postcode-${BRAND}"]`)) as HTMLElement,
    );
    held.release();
    expect(await screen.findByText("No change: that was already the value")).toBeInTheDocument();
  }, 30_000);

  it("the cost ceiling: disabled while unchanged or out of range", () => {
    render(createElement(Admin, { view: view(), health: HEALTH }));
    const input = screen.getByLabelText("Cost ceiling per audit (US$)");
    const save = () =>
      screen
        .getAllByRole("button")
        .find((b) => b.closest('[data-admin-field="maxCostUsdPerAudit"]')) as HTMLElement;
    expect(save()).toBeDisabled();
    fireEvent.change(input, { target: { value: "5" } });
    expect(save()).toBeDisabled();
    expect(screen.getByText("A number from 0 to 1.")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "0.2" } });
    expect(save()).toBeEnabled();
  });

  it("a workspace override dropdown: disabled and 'Saving…', then 'Saved'", async () => {
    const held = heldFetch(ok());
    render(createElement(Admin, { view: view(), health: HEALTH }));
    const select = screen.getByLabelText("AI Mode for this workspace");
    fireEvent.change(select, { target: { value: "on" } });
    expect(select).toBeDisabled();
    const box = select.closest('[data-admin-select="override-google_ai_mode"]') as HTMLElement;
    expect(box).toHaveTextContent("Saving…");
    expect(JSON.parse(String(held.calls[0].init?.body))).toEqual({
      kind: "workspace",
      workspaceId: ORG,
      surface: "google_ai_mode",
      state: "on",
    });
    held.release();
    await waitFor(() => expect(box).toHaveTextContent("Saved"));
    expect(select).toBeEnabled();
  }, 30_000);

  it("a global checkbox: disabled and 'Saving…', then 'Saved'", async () => {
    const held = heldFetch(ok());
    render(createElement(Admin, { view: view(), health: HEALTH }));
    const box = screen.getByLabelText(
      "Count Google in the headline Visibility % (off: shown in its own block)",
    );
    fireEvent.click(box);
    expect(box).toBeDisabled();
    const row = box.closest('[data-admin-setting="countInHeadline"]') as HTMLElement;
    expect(row).toHaveTextContent("Saving…");
    held.release();
    await waitFor(() => expect(row).toHaveTextContent("Saved"));
  }, 30_000);
});

describe("the plan by name (part 6)", () => {
  it("'Plan: Agency Pro', never 'agency_pro'", () => {
    render(createElement(Admin, { view: view(), health: HEALTH }));
    expect(screen.getByText("Plan: Agency Pro")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("agency_pro");
  });
});
