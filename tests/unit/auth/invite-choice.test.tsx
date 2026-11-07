// @vitest-environment jsdom
/**
 * Team follow-ups (31 Oct), item 5 -- accepting while the account has its own open workspace. It said
 * "You've joined the team" with nothing changed. Now it's a choice: "Switch to <org>", which says plainly
 * that the account's own workspace stays as it is out of sight and that there's no switching back, and asks
 * again; or "Not now", which changes nothing.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/client", () => ({
  authClient: { sendVerificationEmail: vi.fn() },
  signOut: vi.fn(),
}));

const ORG = "0f9d8c7b-6a5e-4d3c-8b2a-1f0e9d8c7b6a";
const TOKEN = "AbC_-12345xyzAbC_-123";
const CHOICE = {
  choice: true,
  orgName: "Splice Marketing",
  role: "analyst",
  ownWorkspaceName: "Lee's Agency",
  expiresAt: "2026-11-13T23:00:00Z", // 14 Nov in Sydney
};

let calls: { url: string; method: string }[] = [];
let postAnswer: { status: number; body: Record<string, unknown> } = { status: 200, body: {} };

beforeEach(() => {
  calls = [];
  postAnswer = { status: 200, body: { accepted: true, joined: true } };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method });
      return method === "POST"
        ? Response.json(postAnswer.body, { status: postAnswer.status })
        : Response.json(CHOICE, { status: 200 });
    }),
  );
  Object.defineProperty(window, "location", { value: { href: "", pathname: "" }, writable: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function page() {
  const { AcceptInvite } = await import("@/app/invite/[orgId]/[token]/invite-client");
  render(createElement(AcceptInvite, { orgId: ORG, token: TOKEN, email: "lee@example.com" }));
  await screen.findByRole("button", { name: "Switch to Splice Marketing" });
}

const posts = () => calls.filter((c) => c.method === "POST");

describe("an invite for an account with its own workspace", () => {
  it("offers the choice, and never says it has joined", async () => {
    await page();
    expect(
      screen.getByText(
        "You're invited to join Splice Marketing as analyst. You're working in Lee's Agency now.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Not now" })).toBeVisible();
    expect(document.body.textContent).not.toMatch(/joined the team/);
    expect(posts()).toEqual([]);
  });

  it("'Switch' says what happens to its own workspace, plainly, before anything changes", async () => {
    await page();
    fireEvent.click(screen.getByRole("button", { name: "Switch to Splice Marketing" }));
    const warning = document.querySelector("[data-switch-warning]");
    expect(warning).toHaveTextContent("Lee's Agency stays exactly as it is");
    expect(warning).toHaveTextContent("including billing");
    expect(warning).toHaveTextContent("you won't see it");
    expect(warning).toHaveTextContent("switching back isn't supported yet");
    expect(posts()).toEqual([]);
  });

  it("confirming switches: POSTs the accept, then opens the dashboard", async () => {
    await page();
    fireEvent.click(screen.getByRole("button", { name: "Switch to Splice Marketing" }));
    fireEvent.click(screen.getByRole("button", { name: "Switch to Splice Marketing" }));
    await waitFor(() => expect(window.location.href).toBe("/dashboard"));
    expect(posts()).toEqual([
      {
        url: `/api/organizations/${ORG}/members/accept?token=${encodeURIComponent(TOKEN)}`,
        method: "POST",
      },
    ]);
  });

  it("'Cancel' goes back to the choice, with nothing sent", async () => {
    await page();
    fireEvent.click(screen.getByRole("button", { name: "Switch to Splice Marketing" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Not now" })).toBeVisible();
    expect(posts()).toEqual([]);
  });

  it("'Not now' changes nothing, and says until when the invitation stays open", async () => {
    await page();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(
      screen.getByText(
        "Nothing has changed: you're still in Lee's Agency. The invitation stays open until 14 Nov; open its link again to switch.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to Vunnara" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(posts()).toEqual([]);
  });

  it("a switch that's refused says why", async () => {
    postAnswer = {
      status: 410,
      body: {
        error: "This invitation has expired. Ask your organization admin to send a new one.",
      },
    };
    await page();
    fireEvent.click(screen.getByRole("button", { name: "Switch to Splice Marketing" }));
    fireEvent.click(screen.getByRole("button", { name: "Switch to Splice Marketing" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/expired/);
    expect(window.location.href).toBe("");
  });
});
