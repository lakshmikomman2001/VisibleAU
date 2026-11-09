/**
 * Team follow-ups (31 Oct), item 3 -- the signed-in check on /sign-in and /sign-up keeps `redirectTo`. It
 * was app/sign-in/layout.tsx's, and a layout can't read the query: a workspace-less account that came from
 * an invite went to /no-workspace every time. And the verification email's link comes back, through
 * sign-in, to the invite.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  currentUser: null as { id: string } | null,
}));
const redirectMock = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { to });
  }),
);
const sent = vi.hoisted(() => ({ url: "" }));
// cd410f2 made sign-in read the invite row for its heading ("Sign in as ... to join ..."). A unit test never
// reaches the database (tests/helpers/no-database-guard.ts), so the read is mocked: null = no heading.
const heading = vi.hoisted(() =>
  vi.fn(
    async (_orgId: string, _token: string) =>
      null as { maskedEmail: string; orgName: string } | null,
  ),
);

vi.mock("@/lib/auth/invite", () => ({ inviteSignInHeading: heading }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/auth/server", () => ({
  auth: { api: { getSession: async () => state.session } },
}));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: async () => state.currentUser }));
vi.mock("@/app/sign-in/[[...sign-in]]/sign-in-form", () => ({ SignInForm: () => null }));
vi.mock("@/app/sign-up/[[...sign-up]]/sign-up-form", () => ({ SignUpForm: () => null }));
vi.mock("@/lib/governance/pg-rate-limit", () => ({
  checkPostgresRateLimit: async () => ({ allowed: true }),
}));
vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendEmail: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/email/templates/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/templates/auth")>()),
  emailVerificationEmail: (input: { url: string }) => {
    sent.url = input.url;
    return { subject: "s", html: "h", text: "t" };
  },
}));

const INVITE = "/invite/0f9d8c7b-6a5e-4d3c-8b2a-1f0e9d8c7b6a/AbC_-12345xyzAbC_-123";

async function destination(page: "sign-in" | "sign-up", redirectTo?: string) {
  const { default: Page } =
    page === "sign-in"
      ? await import("@/app/sign-in/[[...sign-in]]/page")
      : await import("@/app/sign-up/[[...sign-up]]/page");
  try {
    await Page({ searchParams: Promise.resolve(redirectTo ? { redirectTo } : {}) });
    return "(the form)";
  } catch (e) {
    return (e as { to?: string }).to ?? String(e);
  }
}

// The first import of each page and of lib/auth/emails transforms its whole module graph, which took 5-7 s
// on this machine (1 of 2 solo runs and 1 of 3 in the 8 Nov nightly timed out at the 5 s test limit). Done
// once here, under a hook limit that says why, so each test times only its own work.
beforeAll(async () => {
  await import("@/app/sign-in/[[...sign-in]]/page");
  await import("@/app/sign-up/[[...sign-up]]/page");
  await import("@/lib/auth/emails");
}, 30_000);

beforeEach(() => {
  state.session = null;
  state.currentUser = null;
  redirectMock.mockClear();
  heading.mockReset();
  heading.mockResolvedValue(null);
});

describe.each(["sign-in", "sign-up"] as const)("/%s for someone already signed in", (page) => {
  it("with no workspace, from an invite: back to the invite, not /no-workspace", async () => {
    state.session = { user: { id: "acct" } };
    expect(await destination(page, INVITE)).toBe(INVITE);
  });

  it("with no workspace and no link: /no-workspace, which says so", async () => {
    state.session = { user: { id: "acct" } };
    expect(await destination(page)).toBe("/no-workspace");
  });

  it("with a workspace, a redirectTo to another site is ignored: the dashboard", async () => {
    state.session = { user: { id: "acct" } };
    state.currentUser = { id: "profile" };
    expect(await destination(page, "https://evil.example/invite")).toBe("/dashboard");
    expect(await destination(page, "//evil.example")).toBe("/dashboard");
  });

  it("nobody signed in: the form", async () => {
    expect(await destination(page, INVITE)).toBe("(the form)");
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe("/sign-in from an invite, nobody signed in", () => {
  async function signInFormProps(redirectTo: string) {
    const { default: Page } = await import("@/app/sign-in/[[...sign-in]]/page");
    const element = (await Page({ searchParams: Promise.resolve({ redirectTo }) })) as {
      props: { invite?: { orgId: string; token: string; maskedEmail: string; orgName: string } };
    };
    return element.props;
  }

  it("says who to sign in as and what it joins, read for that invite's workspace and token", async () => {
    heading.mockResolvedValue({ maskedEmail: "lee…om@example.com", orgName: "Splice Marketing" });
    const props = await signInFormProps(INVITE);
    expect(heading).toHaveBeenCalledWith(
      "0f9d8c7b-6a5e-4d3c-8b2a-1f0e9d8c7b6a",
      "AbC_-12345xyzAbC_-123",
    );
    expect(props.invite).toEqual({
      orgId: "0f9d8c7b-6a5e-4d3c-8b2a-1f0e9d8c7b6a",
      token: "AbC_-12345xyzAbC_-123",
      maskedEmail: "lee…om@example.com",
      orgName: "Splice Marketing",
    });
  });

  it("an invite that can't be used (no heading): the usual form", async () => {
    expect((await signInFormProps(INVITE)).invite).toBeUndefined();
  });

  it("a link that isn't an invite reads nothing", async () => {
    expect((await signInFormProps("/dashboard")).invite).toBeUndefined();
    expect(heading).not.toHaveBeenCalled();
  });
});

describe("the verification email", () => {
  it("comes back through sign-in to the invite", async () => {
    const { sendVerificationEmailMessage } = await import("@/lib/auth/emails");
    await sendVerificationEmailMessage({
      user: { email: "lee@example.com" },
      url: `https://app.example/api/auth/verify-email?token=t&callbackURL=${encodeURIComponent(INVITE)}`,
    });
    const callback = new URL(sent.url).searchParams.get("callbackURL") ?? "";
    expect(callback).toBe(`/sign-in?verified=1&redirectTo=${encodeURIComponent(INVITE)}`);
  });
});
