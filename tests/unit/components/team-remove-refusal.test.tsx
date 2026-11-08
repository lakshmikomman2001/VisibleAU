// @vitest-environment jsdom
/**
 * Follow-ups from 6e27afc..01a6a8c, part 3 -- when the server refuses a removal (the last owner: "A
 * workspace needs at least one owner. Make someone else owner first."), the Team page says so, in the
 * server's words. It used to ignore the answer and reload the list, so a refusal looked like nothing.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/team",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const ORG = "11111111-1111-4111-8111-111111111111";
const LAST_OWNER = "A workspace needs at least one owner. Make someone else owner first.";

const members = [
  {
    id: "m0",
    userId: "u0",
    role: "owner",
    brandAccess: null,
    isActive: true,
    acceptedAt: "2026-10-01T00:00:00.000Z",
    name: "Lee Owner",
    email: "lee@example.com.au",
  },
  {
    id: "m1",
    userId: "u1",
    role: "owner",
    brandAccess: null,
    isActive: true,
    acceptedAt: "2026-10-01T00:00:00.000Z",
    name: "Kim Owner",
    email: "kim@example.com.au",
  },
];

function stubTeam(remove: () => Response) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url === "/api/auth/me") {
        return Response.json({ id: "u0", organizationId: ORG, role: "owner", tier: "agency" });
      }
      if (url === `/api/organizations/${ORG}/members`) return Response.json(members);
      if (url === "/api/brands") return Response.json([]);
      if (url === `/api/organizations/${ORG}/members/m1` && init?.method === "DELETE")
        return remove();
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
  vi.stubGlobal("confirm", () => true);
  return calls;
}

async function team() {
  const { default: TeamPage } = await import("@/app/(auth)/settings/team/page");
  return render(createElement(TeamPage));
}

// The first jsdom render of a page can take several seconds here (module graph): load it once first.
beforeAll(async () => {
  await import("@/app/(auth)/settings/team/page");
}, 30_000);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("removing someone from the Team page", () => {
  it("a refusal shows the server's reason", async () => {
    stubTeam(() => Response.json({ error: LAST_OWNER }, { status: 409 }));
    await team();
    fireEvent.click(await screen.findByRole("button", { name: "Remove Kim Owner" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(LAST_OWNER);
    expect(screen.getByText("Kim Owner")).toBeInTheDocument();
  });

  it("a removal that goes through shows nothing and reloads the team", async () => {
    const calls = stubTeam(() => Response.json({ removed: true }));
    await team();
    fireEvent.click(await screen.findByRole("button", { name: "Remove Kim Owner" }));
    await vi.waitFor(() =>
      expect(calls.filter((c) => c === `GET /api/organizations/${ORG}/members`)).toHaveLength(2),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
