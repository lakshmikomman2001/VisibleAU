// @vitest-environment jsdom
/**
 * 6 Nov (Sri: "No link may lead to a 403") -- the client side of the locks. The team
 * page's invite shows the seats used against the plan's, from lib/pricing/tiers.ts, and
 * at the limit a way to the plans instead of the form; the server's 409 reads as it
 * was sent. The client portal page on a plan without the feature still lists the links
 * shared before, to revoke, and offers no new one.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/team",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const ORG = "11111111-1111-4111-8111-111111111111";

function member(n: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `m${n}`,
    userId: `u${n}`,
    role: n === 0 ? "owner" : "analyst",
    brandAccess: null,
    isActive: true,
    acceptedAt: "2026-10-01T00:00:00.000Z",
    name: `Member ${n}`,
    email: `member${n}@example.com.au`,
    ...overrides,
  };
}

/** The team page's three reads: who's signed in, the members, the brands for the form. */
function stubTeam(tier: string, members: unknown[], invite?: () => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/me") {
        return Response.json({ id: "u0", organizationId: ORG, role: "owner", tier });
      }
      if (url === `/api/organizations/${ORG}/members`) return Response.json(members);
      if (url === "/api/brands") return Response.json([]);
      if (url === `/api/organizations/${ORG}/members/invite` && init?.method === "POST" && invite) {
        return invite();
      }
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
}

async function team() {
  const { default: TeamPage } = await import("@/app/(auth)/settings/team/page");
  return render(createElement(TeamPage));
}

/** The invite card's seat line (the header says it too): at the limit, or above the form. */
async function inviteSeats(): Promise<HTMLElement> {
  return waitFor(() => {
    const line = document.querySelector<HTMLElement>("[data-seat-limit], [data-seat-usage]");
    if (!line) throw new Error("no seat line yet");
    return line;
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the team page's seats", () => {
  it("at the limit: 'N of N seats used' and a way to the plans, instead of the form", async () => {
    stubTeam(
      "agency",
      [0, 1, 2, 3, 4].map((n) => member(n)),
    );
    await team();
    const line = await inviteSeats();
    expect(line).toHaveAttribute("data-seat-limit");
    expect(line).toHaveTextContent("5 of 5 seats used.");
    expect(screen.getByRole("link", { name: "See the plans with more seats" })).toHaveAttribute(
      "href",
      "/pricing",
    );
    expect(screen.queryByLabelText("Email address")).toBeNull();
  });

  it("pending invites take seats too, as the server counts them", async () => {
    stubTeam("agency", [
      ...[0, 1, 2].map((n) => member(n)),
      member(3, { isActive: false, acceptedAt: null }),
      member(4, { isActive: false, acceptedAt: null }),
    ]);
    await team();
    expect(await inviteSeats()).toHaveTextContent("5 of 5 seats used.");
  });

  it("below the limit: the count, then the form", async () => {
    stubTeam(
      "agency",
      [0, 1, 2].map((n) => member(n)),
    );
    await team();
    const line = await inviteSeats();
    expect(line).toHaveAttribute("data-seat-usage");
    expect(line).toHaveTextContent("3 of 5 seats used");
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
  });

  it("on Growth (one seat) the team shows, at 1 of 1, with no Agency-only overlay", async () => {
    stubTeam("growth", [member(0)]);
    await team();
    expect(await inviteSeats()).toHaveTextContent("1 of 1 seat used.");
    expect(screen.getByText("Member 0")).toBeInTheDocument();
    expect(screen.queryByText(/plan required/)).toBeNull();
    expect(screen.getByText(/Growth plan/)).toBeInTheDocument();
  });

  it("Enterprise has no limit: the count alone, and the form", async () => {
    stubTeam(
      "enterprise",
      [0, 1, 2].map((n) => member(n)),
    );
    await team();
    expect(await screen.findByText("3 seats used")).toBeInTheDocument();
    expect(screen.getByText(/Enterprise plan · 3 seats used/)).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
  });

  it("the server's 409 is shown as it was sent", async () => {
    stubTeam(
      "agency",
      [0, 1, 2, 3].map((n) => member(n)),
      () => Response.json({ error: "Your plan includes 5 seats" }, { status: 409 }),
    );
    await team();
    fireEvent.change(await screen.findByLabelText("Email address"), {
      target: { value: "new@example.com.au" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    expect(await screen.findByText("Your plan includes 5 seats")).toBeInTheDocument();
  });
});

describe("the client portal page on a plan without it", () => {
  it("lists the links shared before, with Revoke, and offers no new one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/client-portal/invites") {
          return Response.json({
            invites: [
              {
                id: "i1",
                inviteToken: "tok_abcdefghijklmnop",
                brandId: "b1",
                brandName: "Omega Services",
                inviteeName: "Harbour client",
                status: "active",
                expiresAt: null,
                isRevoked: false,
                createdAt: "2026-10-01T00:00:00.000Z",
              },
            ],
          });
        }
        if (url === "/api/brands") return Response.json({ brands: [] });
        throw new Error(`unexpected fetch ${url}`);
      }),
    );
    const { ClientPortalsView } = await import(
      "@/app/(auth)/agency/client-portals/client-portals-view"
    );
    render(createElement(ClientPortalsView, { canCreate: false }));
    expect(await screen.findByText("Harbour client")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create Invite" })).toBeNull();
    await waitFor(() => expect(screen.queryByText(/Create one/)).toBeNull());
  });
});
