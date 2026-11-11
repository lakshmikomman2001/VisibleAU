/**
 * Google AI surfaces, Phase 1, part 1 -- /admin/settings and its API are the operator's only: everyone
 * else gets 403 from the API (no settings, no workspace names) and "Forbidden" on the page, checked on
 * the server through lib/auth/platform-admin.ts. Operators' changes reach the writers that record them.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { admin, writes } = vi.hoisted(() => ({
  admin: { allowed: false, userId: null as string | null },
  writes: [] as unknown[][],
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
    }),
    setWorkspaceGoogleOverride: vi.fn(async (...args: unknown[]) => {
      writes.push(["workspace", ...args]);
    }),
    setBrandGooglePostcode: vi.fn(async (...args: unknown[]) => {
      writes.push(["brand", ...args]);
    }),
  };
});

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
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("/api/admin/settings", () => {
  it("403 for a signed-in user who isn't an operator, with nothing in the body", async () => {
    const res = await GET(new Request("http://localhost/api/admin/settings"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
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
    expect(await res.json()).toEqual(VIEW);
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
  });
});
