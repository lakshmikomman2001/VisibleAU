// @vitest-environment jsdom
/**
 * Live invite test follow-ups (8 Nov), part 1 -- sign-in opened from an invite to an account says what's
 * happening, "Sign in as s***@outlook.com to join Splice Marketing", asks only for the password (the
 * address is the invite's own), signs in through the invite (part 2), and goes back to the invite.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), push: vi.fn() }));
const signInEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/client", () => ({
  authClient: { sendVerificationEmail: vi.fn() },
  signIn: { email: signInEmail },
  signUp: { email: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push }),
  useSearchParams: () => nav.params,
}));

const ORG = "0f9d8c7b-6a5e-4d3c-8b2a-1f0e9d8c7b6a";
const TOKEN = "AbC_-12345xyzAbC_-12345xyzAbC_-12345xyz12";
const INVITE = `/invite/${ORG}/${TOKEN}`;
const JOINING = {
  orgId: ORG,
  token: TOKEN,
  maskedEmail: "s***@outlook.com",
  orgName: "Splice Marketing",
};

beforeAll(async () => {
  await import("@/app/sign-in/[[...sign-in]]/sign-in-form");
}, 30_000);

beforeEach(() => {
  vi.clearAllMocks();
  nav.params = new URLSearchParams({ redirectTo: INVITE });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function form(invite = JOINING) {
  const { SignInForm } = await import("@/app/sign-in/[[...sign-in]]/sign-in-form");
  return render(createElement(SignInForm, { invite }));
}

describe("sign-in from an invite to an account", () => {
  it("says who to sign in as and what it joins, and asks only for the password", async () => {
    const { container } = await form();
    expect(
      screen.getByRole("heading", { name: "Sign in as s***@outlook.com to join Splice Marketing" }),
    ).toBeInTheDocument();
    expect(container.querySelector('input[type="email"]')).toBeNull();
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
    // The other page, and the reset, keep the invite.
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute(
      "href",
      `/sign-up?redirectTo=${encodeURIComponent(INVITE)}`,
    );
  });

  it("signs in through the invite, with the password only, and goes back to it", async () => {
    const fetchMock = vi.fn(async () => Response.json({ signedIn: true }));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = await form();
    fireEvent.change(container.querySelector('input[type="password"]') as HTMLInputElement, {
      target: { value: "CorrectHorse123!" },
    });
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith(INVITE));
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/invites/${ORG}/${TOKEN}/sign-in`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ password: "CorrectHorse123!" }),
      }),
    );
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it("a wrong password says so, and stays", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: "That password isn't right. Try again, or reset it.", code: "wrong_password" },
          { status: 401 },
        ),
      ),
    );
    const { container } = await form();
    fireEvent.change(container.querySelector('input[type="password"]') as HTMLInputElement, {
      target: { value: "wrong-one-1" },
    });
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    expect(
      await screen.findByText("That password isn't right. Try again, or reset it."),
    ).toBeInTheDocument();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("without an invite, it's the usual sign-in", async () => {
    const { SignInForm } = await import("@/app/sign-in/[[...sign-in]]/sign-in-form");
    const { container } = render(createElement(SignInForm, {}));
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(container.querySelector('input[type="email"]')).not.toBeNull();
  });
});
