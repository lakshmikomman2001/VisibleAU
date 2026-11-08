// @vitest-environment jsdom
/**
 * Live invite test follow-ups (8 Nov), part 2 -- someone who opens an invite and can't remember their
 * password: "Forgot your password?" keeps where they were going, through the reset email's link and back to
 * sign-in, so the reset leads back to the invite. A link to another site is still ignored.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  signInEmail: vi.fn(),
}));
const nav = vi.hoisted(() => ({ params: new URLSearchParams(), push: vi.fn() }));

vi.mock("@/lib/auth/client", () => ({
  authClient: {
    requestPasswordReset: auth.requestPasswordReset,
    resetPassword: auth.resetPassword,
    sendVerificationEmail: vi.fn(),
  },
  signIn: { email: auth.signInEmail },
  signUp: { email: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push }),
  useSearchParams: () => nav.params,
}));

const INVITE =
  "/invite/0f9d8c7b-6a5e-4d3c-8b2a-1f0e9d8c7b6a/AbC_-12345xyzAbC_-12345xyzAbC_-12345xyz12";
const ENCODED = encodeURIComponent(INVITE);

// A first render of these pages can take seconds under load: load them once first.
beforeAll(async () => {
  await import("@/app/sign-in/[[...sign-in]]/sign-in-form");
  await import("@/app/forgot-password/page");
  await import("@/app/reset-password/page");
}, 30_000);

beforeEach(() => {
  vi.clearAllMocks();
  nav.params = new URLSearchParams();
});
afterEach(cleanup);

describe("Forgot your password?, from an invite's sign-in", () => {
  it("the sign-in page's link carries the invite", async () => {
    nav.params = new URLSearchParams({ redirectTo: INVITE });
    const { SignInForm } = await import("@/app/sign-in/[[...sign-in]]/sign-in-form");
    render(createElement(SignInForm));
    expect(screen.getByRole("link", { name: "Forgot your password?" })).toHaveAttribute(
      "href",
      `/forgot-password?redirectTo=${ENCODED}`,
    );
  });

  it("the reset email's link comes back to the reset page with the invite, and 'Back to sign in' keeps it", async () => {
    nav.params = new URLSearchParams({ redirectTo: INVITE });
    auth.requestPasswordReset.mockResolvedValue({ error: null });
    const { default: ForgotPasswordPage } = await import("@/app/forgot-password/page");
    const { container } = render(createElement(ForgotPasswordPage));
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute(
      "href",
      `/sign-in?redirectTo=${ENCODED}`,
    );
    fireEvent.change(container.querySelector('input[type="email"]') as HTMLInputElement, {
      target: { value: "lee@example.com" },
    });
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    await waitFor(() =>
      expect(auth.requestPasswordReset).toHaveBeenCalledWith({
        email: "lee@example.com",
        redirectTo: `/reset-password?redirectTo=${ENCODED}`,
      }),
    );
  });

  it("once the password is changed, signing in goes on to the invite", async () => {
    nav.params = new URLSearchParams({ token: "reset-token", redirectTo: INVITE });
    auth.resetPassword.mockResolvedValue({ error: null });
    const { default: ResetPasswordPage } = await import("@/app/reset-password/page");
    const { container } = render(createElement(ResetPasswordPage));
    const [first, second] = Array.from(container.querySelectorAll('input[type="password"]'));
    fireEvent.change(first, { target: { value: "CorrectHorse123!" } });
    fireEvent.change(second, { target: { value: "CorrectHorse123!" } });
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      `/sign-in?redirectTo=${ENCODED}`,
    );
  });

  it("a link to another site is ignored: the reset goes to the plain reset page", async () => {
    nav.params = new URLSearchParams({ redirectTo: "https://evil.example/x" });
    auth.requestPasswordReset.mockResolvedValue({ error: null });
    const { default: ForgotPasswordPage } = await import("@/app/forgot-password/page");
    const { container } = render(createElement(ForgotPasswordPage));
    fireEvent.change(container.querySelector('input[type="email"]') as HTMLInputElement, {
      target: { value: "lee@example.com" },
    });
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    await waitFor(() =>
      expect(auth.requestPasswordReset).toHaveBeenCalledWith({
        email: "lee@example.com",
        redirectTo: "/reset-password",
      }),
    );
  });
});
