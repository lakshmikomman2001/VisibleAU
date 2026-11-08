// @vitest-environment jsdom
/**
 * 3 Nov -- the "Check your inbox" screen sign-up and sign-in share, and what the
 * two pages do with it: no workspace step before the address is verified, and an
 * unverified sign-in lands here instead of on an error.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  sendVerificationEmail: vi.fn(),
  signUpEmail: vi.fn(),
  signInEmail: vi.fn(),
}));
const nav = vi.hoisted(() => ({ params: new URLSearchParams(), push: vi.fn() }));
const workspace = vi.hoisted(() => ({ requestWorkspace: vi.fn() }));

vi.mock("@/lib/auth/client", () => ({
  authClient: { sendVerificationEmail: auth.sendVerificationEmail },
  signUp: { email: auth.signUpEmail },
  signIn: { email: auth.signInEmail },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push }),
  useSearchParams: () => nav.params,
}));
vi.mock("@/lib/auth/workspace-errors", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/workspace-errors")>()),
  requestWorkspace: workspace.requestWorkspace,
}));

const ADDRESS = "person@example.com";
// 9 Nov (part 7): a 6-character local part shows half of itself at most (lib/email/mask.ts).
const MASKED = "pe…n@example.com";

beforeEach(() => {
  vi.clearAllMocks();
  nav.params = new URLSearchParams();
});
afterEach(cleanup);

describe("CheckInbox", () => {
  async function inbox(onStartAgain = vi.fn()) {
    const { CheckInbox } = await import("@/components/domain/auth/check-inbox");
    render(<CheckInbox email={ADDRESS} callbackURL="/dashboard" onStartAgain={onStartAgain} />);
    return onStartAgain;
  }

  it("says where to look with the address masked, and never prints the whole address", async () => {
    await inbox();
    expect(screen.getByText(`Check your inbox to verify ${MASKED}`)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(ADDRESS);
  });

  it("Resend link sends for that address and that destination, and says so", async () => {
    auth.sendVerificationEmail.mockResolvedValue({ data: { status: true }, error: null });
    await inbox();
    fireEvent.click(screen.getByRole("button", { name: "Resend link" }));
    await screen.findByText(/sent another link/i);
    expect(auth.sendVerificationEmail).toHaveBeenCalledWith({
      email: ADDRESS,
      callbackURL: "/dashboard",
    });
  });

  it("over the limit it says to wait, in the words the other auth pages use", async () => {
    auth.sendVerificationEmail.mockResolvedValue({ data: null, error: { status: 429 } });
    await inbox();
    fireEvent.click(screen.getByRole("button", { name: "Resend link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/try again in an hour/i);
  });

  it("any other failure says it couldn't send", async () => {
    auth.sendVerificationEmail.mockResolvedValue({ data: null, error: { status: 500 } });
    await inbox();
    fireEvent.click(screen.getByRole("button", { name: "Resend link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't be sent/i);
  });

  it("'Wrong address? Start again' goes back", async () => {
    const onStartAgain = await inbox();
    fireEvent.click(screen.getByRole("button", { name: "Wrong address? Start again" }));
    expect(onStartAgain).toHaveBeenCalledTimes(1);
  });
});

function fill(label: RegExp | string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("the sign-up page", () => {
  async function signUpWith(agency = "Harbour Agency") {
    const { SignUpForm } = await import("@/app/sign-up/[[...sign-up]]/sign-up-form");
    const { container } = render(<SignUpForm />);
    fill(/full name/i, "A Person");
    fill(/agency name/i, agency);
    fill(/^email$/i, ADDRESS);
    fill(/password/i, "CorrectHorse123!");
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
  }

  it("shows 'Check your inbox', and makes no workspace before the address is verified", async () => {
    auth.signUpEmail.mockResolvedValue({ data: { token: null, user: {} }, error: null });
    await signUpWith();
    await screen.findByText(`Check your inbox to verify ${MASKED}`);
    expect(workspace.requestWorkspace).not.toHaveBeenCalled();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("the link brings the workspace name back to /no-workspace", async () => {
    auth.signUpEmail.mockResolvedValue({ data: { token: null, user: {} }, error: null });
    await signUpWith("Harbour & Co's Agency");
    await screen.findByText(`Check your inbox to verify ${MASKED}`);
    const sent = auth.signUpEmail.mock.calls[0][0] as { callbackURL: string };
    expect(new URLSearchParams(sent.callbackURL.split("?")[1]).get("name")).toBe(
      "Harbour & Co's Agency",
    );
    // What better-auth accepts as a relative callback (trusted-origins.mjs).
    expect(sent.callbackURL).toMatch(/^\/(?!\/|\\|%2f|%5c)[\w\-.+/@]*(?:\?[\w\-.+/=&%@]*)?$/);
  });

  it("a refused sign-up stays on the form and says why", async () => {
    auth.signUpEmail.mockResolvedValue({ data: null, error: { message: "Password too short" } });
    await signUpWith();
    await screen.findByText("Password too short");
    expect(screen.queryByText(/Check your inbox/)).toBeNull();
  });

  it("'Start again' comes back to the form", async () => {
    auth.signUpEmail.mockResolvedValue({ data: { token: null, user: {} }, error: null });
    await signUpWith();
    fireEvent.click(await screen.findByRole("button", { name: "Wrong address? Start again" }));
    await waitFor(() => expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument());
  });
});

describe("the sign-in page", () => {
  async function page() {
    const { SignInForm } = await import("@/app/sign-in/[[...sign-in]]/sign-in-form");
    return render(<SignInForm />);
  }

  async function signInWith(container: HTMLElement) {
    fireEvent.change(container.querySelector('input[type="email"]') as HTMLInputElement, {
      target: { value: ADDRESS },
    });
    fireEvent.change(container.querySelector('input[type="password"]') as HTMLInputElement, {
      target: { value: "CorrectHorse123!" },
    });
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
  }

  it("an unverified account gets 'Check your inbox', not an error", async () => {
    auth.signInEmail.mockResolvedValue({
      data: null,
      error: { code: "EMAIL_NOT_VERIFIED", status: 403, message: "Email not verified" },
    });
    const { container } = await page();
    await signInWith(container);
    await screen.findByText(`Check your inbox to verify ${MASKED}`);
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("Resend comes back to where sign-in was going", async () => {
    nav.params = new URLSearchParams({ redirectTo: "/invite/org/token" });
    auth.signInEmail.mockResolvedValue({
      data: null,
      error: { code: "EMAIL_NOT_VERIFIED", status: 403, message: "Email not verified" },
    });
    auth.sendVerificationEmail.mockResolvedValue({ data: { status: true }, error: null });
    const { container } = await page();
    await signInWith(container);
    fireEvent.click(await screen.findByRole("button", { name: "Resend link" }));
    await waitFor(() =>
      expect(auth.sendVerificationEmail).toHaveBeenCalledWith({
        email: ADDRESS,
        callbackURL: "/invite/org/token",
      }),
    );
  });

  it("a wrong password is still an ordinary error", async () => {
    auth.signInEmail.mockResolvedValue({
      data: null,
      error: {
        code: "INVALID_EMAIL_OR_PASSWORD",
        status: 401,
        message: "Invalid email or password",
      },
    });
    const { container } = await page();
    await signInWith(container);
    await screen.findByText("Invalid email or password");
    expect(screen.queryByText(/Check your inbox/)).toBeNull();
  });

  it("back from the link: says the address is confirmed", async () => {
    nav.params = new URLSearchParams({ verified: "1", redirectTo: "/dashboard" });
    await page();
    expect(screen.getByRole("status")).toHaveTextContent(/email address is confirmed/i);
  });

  it("back from an expired link: says so, and how to get a new one, never 'confirmed'", async () => {
    nav.params = new URLSearchParams({ verified: "1", error: "TOKEN_EXPIRED" });
    await page();
    expect(screen.getByRole("status")).toHaveTextContent(/expired/i);
    expect(screen.getByRole("status")).toHaveTextContent(/sign in/i);
    expect(document.body.textContent).not.toMatch(/is confirmed/i);
  });
});

describe("/no-workspace", () => {
  it("offers the name typed at sign-up", async () => {
    const { NoWorkspaceClient } = await import("@/app/no-workspace/no-workspace-client");
    render(
      <NoWorkspaceClient
        email={ADDRESS}
        state={{ kind: "none" }}
        initialError={null}
        initialName="Harbour Agency"
      />,
    );
    expect(screen.getByLabelText(/name your workspace/i)).toHaveValue("Harbour Agency");
    expect(screen.getByRole("button", { name: "Create workspace" })).toBeEnabled();
  });
});
