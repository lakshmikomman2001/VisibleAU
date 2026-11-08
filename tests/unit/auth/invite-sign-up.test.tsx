// @vitest-environment jsdom
/**
 * Team follow-ups (31 Oct), item 4 -- the sign-up page for an invite to an address with no account: the
 * address filled in and locked, no workspace name, and creating the account joins the inviting workspace.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => nav.params,
}));
vi.mock("@/lib/auth/client", () => ({
  authClient: { sendVerificationEmail: vi.fn() },
  signUp: { email: vi.fn() },
  signIn: { email: vi.fn() },
}));

const ORG = "0f9d8c7b-6a5e-4d3c-8b2a-1f0e9d8c7b6a";
const TOKEN = "AbC_-12345xyzAbC_-123";
const INVITE = `/invite/${ORG}/${TOKEN}`;
const SIGN_IN = `/sign-in?redirectTo=${encodeURIComponent(INVITE)}`;

type Answer = { status: number; body: Record<string, unknown> };
let answers: Record<string, Answer> = {};
const calls: { url: string; init?: RequestInit }[] = [];

beforeEach(() => {
  answers = {};
  calls.length = 0;
  nav.params = new URLSearchParams({ redirectTo: INVITE });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const answer = answers[url.endsWith("/sign-up") ? "sign-up" : "preview"];
      return Response.json(answer.body, { status: answer.status });
    }),
  );
  Object.defineProperty(window, "location", { value: { href: "" }, writable: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function signUpPage() {
  const { SignUpForm } = await import("@/app/sign-up/[[...sign-up]]/sign-up-form");
  render(createElement(SignUpForm));
}

const NEW_ACCOUNT = {
  status: 200,
  body: {
    orgName: "Splice Marketing",
    role: "analyst",
    forNewAccount: true,
    email: "lee@example.com",
  },
};

describe("sign-up from an invite to an address with no account", () => {
  it("fills in the invited address and locks it, and asks for no workspace name", async () => {
    answers.preview = NEW_ACCOUNT;
    await signUpPage();
    expect(
      await screen.findByRole("heading", { name: "Join Splice Marketing on Vunnara" }),
    ).toBeVisible();
    const email = screen.getByLabelText("Email");
    expect(email).toHaveValue("lee@example.com");
    expect(email).toHaveAttribute("readonly");
    expect(screen.queryByLabelText(/agency name/i)).toBeNull();
    expect(screen.getByText(/invited to join Splice Marketing as an analyst/)).toBeVisible();
    expect(calls[0].url).toBe(`/api/invites/${ORG}/${TOKEN}`);
  });

  it("creating the account sends the invited address, and lands on the dashboard", async () => {
    answers.preview = NEW_ACCOUNT;
    answers["sign-up"] = { status: 201, body: { joined: true, signedIn: true } };
    await signUpPage();
    fireEvent.change(await screen.findByLabelText("Full name"), { target: { value: "Lee" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "CorrectHorse123!" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Create account and join Splice Marketing" }),
    );
    await waitFor(() => expect(window.location.href).toBe("/dashboard"));
    const post = calls.find((c) => c.url.endsWith("/sign-up"));
    expect(post?.url).toBe(`/api/invites/${ORG}/${TOKEN}/sign-up`);
    // Part 3 (follow-ups from d247ba7..f13411d): not the address -- the server takes it from the invite.
    expect(JSON.parse(String(post?.init?.body))).toEqual({
      name: "Lee",
      password: "CorrectHorse123!",
    });
  });

  it("an address that already has an account is told to sign in, back to the invite", async () => {
    answers.preview = NEW_ACCOUNT;
    answers["sign-up"] = {
      status: 409,
      body: {
        code: "account_exists",
        error: "An account already uses this address. Sign in to accept the invitation.",
      },
    };
    await signUpPage();
    fireEvent.change(await screen.findByLabelText("Full name"), { target: { value: "Lee" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "CorrectHorse123!" } });
    fireEvent.click(screen.getByRole("button", { name: /Create account and join/ }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/already uses this address/);
    expect(alert.querySelector("a")).toHaveAttribute("href", SIGN_IN);
    expect(window.location.href).toBe("");
  });

  it("an expired invite says so, with no form", async () => {
    answers.preview = {
      status: 404,
      body: {
        code: "invite_unusable",
        error:
          "This invitation link can't be used: it may have expired or already been used. Ask whoever invited you to send a new one.",
      },
    };
    await signUpPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(/expired/);
    expect(screen.queryByLabelText("Password")).toBeNull();
  });

  it("an invite for an existing account says to sign in, back to the invite", async () => {
    answers.preview = {
      status: 200,
      body: { orgName: "Splice Marketing", role: "admin", forNewAccount: false },
    };
    await signUpPage();
    expect(await screen.findByText(/for an existing Vunnara account/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", SIGN_IN);
    expect(screen.queryByLabelText("Password")).toBeNull();
  });
});
