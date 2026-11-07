// @vitest-environment jsdom
/**
 * Team follow-ups (31 Oct), item 2 -- opening someone else's invite while signed in. On production it said
 * only "This invite was sent to a different email address" and "Back to VisibleAU". Now it says which
 * account is signed in and who the invite is for, both masked, and "Sign out and continue" signs out and
 * comes back to the same invite through sign-in.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  signOut: vi.fn(),
  sendVerificationEmail: vi.fn(),
}));
vi.mock("@/lib/auth/client", () => ({
  authClient: { sendVerificationEmail: auth.sendVerificationEmail },
  signOut: auth.signOut,
}));

const ORG = "0f9d8c7b-6a5e-4d3c-8b2a-1f0e9d8c7b6a";
const TOKEN = "AbC_-12345xyzAbC_-123";
const SIGNED_IN = "sam.someone@vunnara.com.au";

function answer(status: number, body: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(body, { status })),
  );
}

async function page() {
  const { AcceptInvite } = await import("@/app/invite/[orgId]/[token]/invite-client");
  render(createElement(AcceptInvite, { orgId: ORG, token: TOKEN, email: SIGNED_IN }));
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "location", { value: { href: "", pathname: "" }, writable: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("an invite for a different account", () => {
  it("says who's signed in and who it's for, masked, never the full addresses", async () => {
    answer(403, {
      error: "This invite was sent to a different email address",
      code: "wrong_account",
      signedInAs: "s***@vunnara.com.au",
      invitedAs: "l***@gmail.com",
    });
    await page();
    expect(await screen.findByText(/You're signed in as/)).toHaveTextContent(
      "You're signed in as s***@vunnara.com.au. This invite is for l***@gmail.com.",
    );
    expect(document.body.textContent).not.toContain(SIGNED_IN);
    expect(screen.getByRole("link", { name: "Back to Vunnara" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });

  it("'Sign out and continue' signs out and returns to this invite on the sign-in page", async () => {
    answer(403, { code: "wrong_account", invitedAs: "l***@gmail.com" });
    auth.signOut.mockImplementation(async (opts: { fetchOptions: { onSuccess: () => void } }) =>
      opts.fetchOptions.onSuccess(),
    );
    await page();
    fireEvent.click(await screen.findByRole("button", { name: "Sign out and continue" }));
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(window.location.href).toBe(
        `/sign-in?redirectTo=${encodeURIComponent(`/invite/${ORG}/${TOKEN}`)}`,
      ),
    );
  });

  it("when the invite's address isn't known, it still says it's for a different one", async () => {
    answer(403, { code: "wrong_account", invitedAs: null });
    await page();
    expect(await screen.findByText(/You're signed in as/)).toHaveTextContent(
      "You're signed in as s***@vunnara.com.au. This invite is for a different email address.",
    );
    expect(screen.getByRole("button", { name: "Sign out and continue" })).toBeEnabled();
  });

  it("if signing out fails, it says so", async () => {
    answer(403, { code: "wrong_account", invitedAs: "l***@gmail.com" });
    auth.signOut.mockImplementation(async (opts: { fetchOptions: { onError: () => void } }) =>
      opts.fetchOptions.onError(),
    );
    await page();
    fireEvent.click(await screen.findByRole("button", { name: "Sign out and continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Signing out didn't work/);
    expect(window.location.href).toBe("");
  });
});
