/**
 * Google AI surfaces, Phase 1, part 1 -- /admin/settings and its API are the operator's only: everyone
 * else gets 403 from the API (no settings, no workspace names) and "Forbidden" on the page, checked on
 * the server through lib/auth/platform-admin.ts. Operators' changes reach the writers that record them.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { admin, writes, result } = vi.hoisted(() => ({
  admin: { allowed: false, userId: null as string | null },
  writes: [] as unknown[][],
  /** What the writers say they did (12 Nov, part 5). */
  result: { value: "saved" as "saved" | "unchanged" },
}));

vi.mock("@/lib/auth/platform-admin", () => ({
  checkPlatformAdmin: vi.fn(async () => ({ ...admin })),
}));

const VIEW = {
  envEnabled: false,
  credentialsPresent: false,
  settings: {
    aiOverviewsEnabled: false,
    aiModeEnabled: false,
    countInHeadline: false,
    queueMode: "standard",
    device: "desktop",
    maxCostUsdPerAudit: 0.1,
  },
  workspaces: [{ id: "11111111-1111-4111-8111-111111111111", name: "Demo Workspace" }],
  selected: null,
  history: [],
};

vi.mock("@/lib/governance/google-surfaces", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/governance/google-surfaces")>();
  return {
    ...actual,
    loadGoogleSurfaceAdminView: vi.fn(async () => VIEW),
    operatorProfileId: vi.fn(async () => "22222222-2222-4222-8222-222222222222"),
    updateGoogleSurfaceSetting: vi.fn(async (...args: unknown[]) => {
      writes.push(["setting", ...args]);
      return result.value;
    }),
    setWorkspaceGoogleOverride: vi.fn(async (...args: unknown[]) => {
      writes.push(["workspace", ...args]);
      return result.value;
    }),
    setBrandGooglePostcode: vi.fn(async (...args: unknown[]) => {
      writes.push(["brand", ...args]);
      return result.value;
    }),
  };
});

/** 12 Nov, part 2: the provider's own code and message -- the operator's page is the only place it's shown. */
const RAW_40100 =
  "The provider refused the question: 40100 You are not authorized to access this resource. See your login details here: https://app.dataforseo.com/api-access .";
const HEALTH = {
  // 12 Nov, part 3: what the provider last said, not only that the env vars exist.
  lastRun: {
    auditId: "55555555-5555-4555-8555-555555555555",
    auditNumber: 44,
    brand: "Omega Services",
    workspace: "Splice",
    at: "2026-11-12T03:04:00.000Z",
    questions: 26,
    checked: 0,
    problem: { code: 40100, label: "login rejected", at: "2026-11-12T03:03:00.000Z" },
    line: "Last Google run: login rejected at 12 Nov 14:03 Sydney time (audit #44, Omega Services)",
  },
  // 13 Nov, part 13: audit #44's 26 identical failures are one line, the questions behind it.
  providerErrorGroups: {
    groups: [
      {
        key: "55555555-5555-4555-8555-555555555555|40100|login",
        at: "2026-11-12T03:03:00.000Z",
        auditNumber: 44,
        workspace: "Splice",
        brand: "Omega Services",
        code: 40100,
        category: "login rejected",
        message: RAW_40100,
        surfaces: [
          { surface: "AI Mode", count: 13 },
          { surface: "AI Overviews", count: 13 },
        ],
        rows: Array.from({ length: 26 }, (_, i) => ({
          id: `row-${i}`,
          at: "2026-11-12T03:03:00.000Z",
          surface: i < 13 ? "AI Mode" : "AI Overviews",
          prompt: `best plumber question ${i % 13}`,
        })),
      },
    ],
    total: 3,
  },
};
const { loadHealth } = vi.hoisted(() => ({ loadHealth: vi.fn() }));
vi.mock("@/lib/audit/google-surfaces/operator", () => ({ loadGoogleOperatorHealth: loadHealth }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import AdminSettingsPage from "@/app/(auth)/admin/settings/page";
import { GET, POST } from "@/app/api/admin/settings/route";

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/admin/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  admin.allowed = false;
  admin.userId = "better-auth-user";
  writes.length = 0;
  result.value = "saved";
  loadHealth.mockReset();
  loadHealth.mockResolvedValue(HEALTH);
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("/api/admin/settings", () => {
  it("403 for a signed-in user who isn't an operator, with nothing in the body", async () => {
    const res = await GET(new Request("http://localhost/api/admin/settings"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(loadHealth).not.toHaveBeenCalled();
  });

  it("403 for a POST too, and nothing is written", async () => {
    const res = await post({ kind: "setting", name: "aiModeEnabled", value: true });
    expect(res.status).toBe(403);
    expect(writes).toEqual([]);
  });

  it("403 with no session at all", async () => {
    admin.userId = null;
    expect((await GET(new Request("http://localhost/api/admin/settings"))).status).toBe(403);
  });

  it("an operator gets the settings view", async () => {
    admin.allowed = true;
    const res = await GET(new Request("http://localhost/api/admin/settings?workspace=x"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...VIEW, health: HEALTH });
  });

  it("an operator's changes go to the writers with the operator's profile id", async () => {
    admin.allowed = true;
    expect((await post({ kind: "setting", name: "aiModeEnabled", value: true })).status).toBe(200);
    expect(
      (
        await post({
          kind: "workspace",
          workspaceId: "11111111-1111-4111-8111-111111111111",
          surface: "google_ai_overviews",
          state: "on",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post({
          kind: "workspace",
          workspaceId: "11111111-1111-4111-8111-111111111111",
          surface: "google_ai_mode",
          state: "default",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post({
          kind: "brand",
          brandId: "33333333-3333-4333-8333-333333333333",
          postcode: "2153",
        })
      ).status,
    ).toBe(200);
    const actor = "22222222-2222-4222-8222-222222222222";
    expect(writes).toEqual([
      ["setting", "aiModeEnabled", true, actor],
      ["workspace", "11111111-1111-4111-8111-111111111111", "google_ai_overviews", true, actor],
      ["workspace", "11111111-1111-4111-8111-111111111111", "google_ai_mode", null, actor],
      ["brand", "33333333-3333-4333-8333-333333333333", "2153", actor],
    ]);
  });

  it("a save says what it did: 'saved', or 'unchanged' when the value was the one in force (part 5)", async () => {
    admin.allowed = true;
    const saved = await post({
      kind: "brand",
      brandId: "33333333-3333-4333-8333-333333333333",
      postcode: "2153",
    });
    expect(await saved.json()).toEqual({ ok: true, status: "saved" });
    result.value = "unchanged";
    const again = await post({
      kind: "brand",
      brandId: "33333333-3333-4333-8333-333333333333",
      postcode: "2153",
    });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true, status: "unchanged" });
  });

  it("an operator's malformed change is a 400, and nothing is written", async () => {
    admin.allowed = true;
    expect((await post({ kind: "setting", name: "notASetting", value: 1 })).status).toBe(400);
    expect(
      (await post({ kind: "workspace", workspaceId: "x", surface: "google_ai_mode", state: "on" }))
        .status,
    ).toBe(400);
    expect(writes).toEqual([]);
  });
});

describe("/admin/settings (the page)", () => {
  it("a non-operator sees Forbidden and none of the settings or workspace names", async () => {
    const html = renderToStaticMarkup(
      await AdminSettingsPage({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain("Forbidden");
    expect(html).toContain("data-admin-forbidden");
    expect(html).not.toContain("data-admin-settings");
    expect(html).not.toContain("Demo Workspace");
    expect(html).not.toContain("40100");
    expect(loadHealth).not.toHaveBeenCalled();
  });

  it("an operator sees each switch, the kill switch's state and the workspace list", async () => {
    admin.allowed = true;
    const html = renderToStaticMarkup(
      await AdminSettingsPage({ searchParams: Promise.resolve({}) }),
    ).replace(/<!-- -->/g, "");
    expect(html).toContain("data-admin-settings");
    expect(html).toContain("GOOGLE_AI_SURFACES_ENABLED");
    expect(html).toContain("AI Overviews on for every eligible workspace");
    expect(html).toContain("Count Google in the headline");
    expect(html).toContain("Demo Workspace");
    // 13 Nov, part 1: the heading is the page's breadcrumb (lib/navigation/breadcrumbs.ts ADMIN_PAGE_TITLES).
    expect(html).toMatch(/<h1[^>]*>Operator settings<\/h1>/);
  });

  it("an operator sees the provider's own code and message (12 Nov, part 2)", async () => {
    admin.allowed = true;
    const html = renderToStaticMarkup(
      await AdminSettingsPage({ searchParams: Promise.resolve({}) }),
    ).replace(/<!-- -->/g, "");
    expect(html).toContain("data-admin-provider-errors");
    expect(html).toContain('data-admin-provider-error="40100"');
    expect(html).toContain("40100 login rejected");
    expect(html).toContain("You are not authorized to access this resource");
    expect(html).toContain('data-admin-last-run="problem"');
    expect(html).toContain(
      "Last Google run: login rejected at 12 Nov 14:03 Sydney time (audit #44, Omega Services)",
    );
  });

  it("13 Nov, part 13: one line per audit and answer, the questions behind it, how many are shown, Sydney time", async () => {
    admin.allowed = true;
    const html = renderToStaticMarkup(
      await AdminSettingsPage({ searchParams: Promise.resolve({}) }),
    ).replace(/<!-- -->/g, "");
    const text = html.replace(/<[^>]+>/g, "");
    expect(text).toContain(
      `12 Nov 14:03 · Audit #44 · Omega Services (Splice) · AI Mode ×13, AI Overviews ×13 · 40100 login rejected · ${RAW_40100}`,
    );
    // One line, not 26: the questions are behind it, not 26 copies of the message.
    expect(html.match(/data-admin-provider-error=/g)).toHaveLength(1);
    expect(html.split(RAW_40100).length - 1).toBe(1);
    expect(html.match(/<details/g)).toHaveLength(1);
    expect(html).toContain("best plumber question 12");
    // Not silently capped: 1 of the 3 groups is shown, and it says so.
    expect(text).toContain("Showing the latest 1 of 3.");
    // Sydney time, UTC on hover.
    expect(html).toContain('title="2026-11-12 03:03 UTC"');
    expect(html).toContain("When (Sydney time)");
    expect(html).not.toContain("When (UTC)");
  });
});
