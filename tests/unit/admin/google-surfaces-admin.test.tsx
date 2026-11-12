// @vitest-environment jsdom
/**
 * Google AI follow-ups (12 Nov) -- the operator's /admin/settings, clicked:
 * - part 4: Test connection says "Testing…", then what DataForSEO said and when, with a warning when the
 *   balance is under US$5; too soon, it says to wait (the server's words).
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
