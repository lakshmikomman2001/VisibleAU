// @vitest-environment jsdom
/**
 * Team follow-ups (31 Oct), item 3 -- on production, signing in from an invite landed on /no-workspace and
 * Sri had to paste the invite link again. From an invite link, sign-in and sign-up keep `redirectTo`
 * through signing in, the verification email and the signed-in check, and land back on the invite. A
 * `redirectTo` to another site is ignored.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  sendVerificationEmail: vi.fn(),
  signUpEmail: vi.fn(),
  signInEmail: vi.fn(),
}));
const nav = vi.hoisted(() => ({ params: new URLSearchParams(), push: vi.fn() }));

vi.mock("@/lib/auth/client", () => ({
  authClient: { sendVerificationEmail: auth.sendVerificationEmail },
  signUp: { email: auth.signUpEmail },
  signIn: { email: auth.signInEmail },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push }),
  useSearchParams: () => nav.params,
}));

const INVITE = "/invite/0f9d8c7b-6a5e-4d3c-8b2a-1f0e9d8c7b6a/AbC_-12345xyzAbC_-123";

beforeEach(() => {
  vi.clearAllMocks();
  nav.params = new URLSearchParams();
});
afterEach(cleanup);

async function signInForm() {
  const { SignInForm } = await import("@/app/sign-in/[[...sign-in]]/sign-in-form");
  return render(createElement(SignInForm));
}

function signIn(container: HTMLElement) {
  fireEvent.change(container.querySelector('input[type="email"]') as HTMLInputElement, {
    target: { value: "lee@example.com" },
  });
  fireEvent.change(container.querySelector('input[type="password"]') as HTMLInputElement, {
    target: { value: "CorrectHorse123!" },
  });
  fireEvent.submit(container.querySelector("form") as HTMLFormElement);
}

describe("sign-in from an invite link", () => {
  it("signs in and lands back on the invite", async () => {
    nav.params = new URLSearchParams({ redirectTo: INVITE });
    auth.signInEmail.mockResolvedValue({ data: { user: {} }, error: null });
    const { container } = await signInForm();
    signIn(container);
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith(INVITE));
    // The verification email sign-in sends an unverified account comes back there too.
    expect(auth.signInEmail).toHaveBeenCalledWith(expect.objectContaining({ callbackURL: INVITE }));
  });

  it.each([
    ["https://evil.example/invite/x/y"],
    ["//evil.example/invite/x/y"],
    ["/\\evil.example"],
  ])("ignores a redirectTo to another site (%s): goes to the dashboard", async (redirectTo) => {
    nav.params = new URLSearchParams({ redirectTo });
    auth.signInEmail.mockResolvedValue({ data: { user: {} }, error: null });
    const { container } = await signInForm();
    signIn(container);
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/dashboard"));
    expect(auth.signInEmail).toHaveBeenCalledWith(
      expect.objectContaining({ callbackURL: "/dashboard" }),
    );
  });

  it("'Sign up' keeps the invite, for someone without an account", async () => {
    nav.params = new URLSearchParams({ redirectTo: INVITE });
    await signInForm();
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute(
      "href",
      `/sign-up?redirectTo=${encodeURIComponent(INVITE)}`,
    );
  });
});

// An invite's own link opens the invite sign-up (item 4, tests/unit/auth/invite-sign-up.test.tsx); any
// other page on this site is carried through the same way.
const PAGE = "/settings/team";

describe("sign-up with a redirectTo", () => {
  async function signUpForm() {
    const { SignUpForm } = await import("@/app/sign-up/[[...sign-up]]/sign-up-form");
    return render(createElement(SignUpForm));
  }

  it("makes no workspace of its own: no workspace name, and the link comes back there", async () => {
    nav.params = new URLSearchParams({ redirectTo: PAGE });
    auth.signUpEmail.mockResolvedValue({ data: { token: null, user: {} }, error: null });
    const { container } = await signUpForm();
    expect(screen.queryByLabelText(/agency name/i)).toBeNull();
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Lee" } });
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "lee@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "CorrectHorse123!" } });
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    await screen.findByText(/Check your inbox to verify/);
    expect(auth.signUpEmail).toHaveBeenCalledWith(expect.objectContaining({ callbackURL: PAGE }));
  });

  it("'Sign in' keeps it", async () => {
    nav.params = new URLSearchParams({ redirectTo: PAGE });
    await signUpForm();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      `/sign-in?redirectTo=${encodeURIComponent(PAGE)}`,
    );
  });

  it("ignores a redirectTo to another site: an ordinary sign-up that names its workspace", async () => {
    nav.params = new URLSearchParams({ redirectTo: "https://evil.example" });
    auth.signUpEmail.mockResolvedValue({ data: { token: null, user: {} }, error: null });
    const { container } = await signUpForm();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Lee" } });
    fireEvent.change(screen.getByLabelText(/agency name/i), { target: { value: "Harbour" } });
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "lee@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "CorrectHorse123!" } });
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    await screen.findByText(/Check your inbox to verify/);
    expect(auth.signUpEmail).toHaveBeenCalledWith(
      expect.objectContaining({ callbackURL: "/no-workspace?name=Harbour" }),
    );
  });
});
