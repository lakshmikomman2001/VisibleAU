// @vitest-environment jsdom
/**
 * S04B part 2 (LLD amendment 100): /admin/settings' Provider errors section lists the AI engines' spend and quota
 * refusals beside Google's, newest first: the engine, the class, the provider's own message, first and last seen
 * (Sydney time), and the audits affected with the calls refused and not sent. "None recorded." when there are none;
 * nothing when the health data has no engine list (the section is as before).
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { GoogleOperatorHealth } from "@/lib/audit/google-surfaces/operator";
import type { GoogleSurfaceAdminView } from "@/lib/governance/google-surfaces";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const ORG = "11111111-1111-4111-8111-111111111111";

function view(): GoogleSurfaceAdminView {
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
    workspaces: [{ id: ORG, name: "Kookaburra Agency" }],
    selected: {
      id: ORG,
      name: "Kookaburra Agency",
      tier: "agency_pro",
      overrides: { google_ai_overviews: null, google_ai_mode: null },
      now: { google_ai_overviews: off, google_ai_mode: off },
      withEnvOn: { google_ai_overviews: off, google_ai_mode: off },
      brands: [],
    },
    history: [],
  };
}

const BASE: GoogleOperatorHealth = {
  lastRun: null,
  providerErrorGroups: { groups: [], total: 0 },
  lastCleanRun: null,
};

const CLAUDE_LIMIT =
  "You have reached your specified API usage limits. You will regain access on 2026-12-01 at 00:00 UTC.";

let Admin: typeof import("@/components/domain/admin/google-surfaces-admin").GoogleSurfacesAdmin;
beforeAll(async () => {
  Admin = (await import("@/components/domain/admin/google-surfaces-admin")).GoogleSurfacesAdmin;
}, 60_000);
afterEach(cleanup);

describe("Provider errors: the AI engines' refusals", () => {
  it("one row per engine and message, newest first, with every column", () => {
    const health: GoogleOperatorHealth = {
      ...BASE,
      engineRefusals: {
        total: 2,
        groups: [
          {
            key: "claude|provider_quota|a",
            engine: "Claude",
            errorClass: "provider_quota",
            message: CLAUDE_LIMIT,
            firstSeen: "2026-11-28T01:00:00.000Z",
            lastSeen: "2026-11-28T03:30:00.000Z",
            audits: 2,
            refused: 4,
            notSent: 22,
          },
          {
            key: "chatgpt|provider_quota|b",
            engine: "ChatGPT",
            errorClass: "provider_quota",
            message: "You exceeded your current quota, please check your plan and billing details.",
            firstSeen: "2026-11-20T01:00:00.000Z",
            lastSeen: "2026-11-20T01:00:00.000Z",
            audits: 1,
            refused: 1,
            notSent: 12,
          },
        ],
      },
    };
    render(createElement(Admin, { view: view(), health }));
    const block = document.querySelector("[data-admin-engine-refusals]") as HTMLElement;
    expect(block).not.toBeNull();
    expect(within(block).getByRole("heading", { name: "AI engines" })).toBeInTheDocument();
    const headers = within(block)
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headers).toEqual([
      "Engine",
      "Class",
      "Provider's message",
      "First seen (Sydney time)",
      "Last seen",
      "Audits affected",
    ]);
    const rows = within(block).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.getAttribute("data-admin-engine-refusal"))).toEqual([
      "Claude",
      "ChatGPT",
    ]);
    const cells = within(rows[0])
      .getAllByRole("cell")
      .map((c) => c.textContent);
    expect(cells).toEqual([
      "Claude",
      "provider_quota",
      CLAUDE_LIMIT,
      "28 Nov 12:00",
      "28 Nov 14:30",
      "2 (4 refused, 22 not sent)",
    ]);
    expect(screen.getByText("Provider errors")).toBeInTheDocument();
  });

  it("says so when there are none", () => {
    render(
      createElement(Admin, {
        view: view(),
        health: { ...BASE, engineRefusals: { groups: [], total: 0 } },
      }),
    );
    const block = document.querySelector("[data-admin-engine-refusals]") as HTMLElement;
    expect(within(block).getByText("None recorded.")).toBeInTheDocument();
  });

  it("without an engine list the section is as before", () => {
    render(createElement(Admin, { view: view(), health: BASE }));
    expect(document.querySelector("[data-admin-engine-refusals]")).toBeNull();
  });
});
