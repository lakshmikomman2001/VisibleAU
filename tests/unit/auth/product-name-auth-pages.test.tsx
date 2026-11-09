// @vitest-environment jsdom
/**
 * Team follow-ups (31 Oct), item 8 -- the invite and auth pages name the product from one constant
 * (lib/product.ts), never a literal: the invite page's error said "Back to VisibleAU". Their "visible au"
 * logo mark waits for the rebrand, so it isn't checked here.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AcceptInvite } from "@/app/invite/[orgId]/[token]/invite-client";
import { PRODUCT_NAME } from "@/lib/product";
import { readSourcesBeforeAll, sourcePaths, sourceText } from "@/tests/helpers/source-files";

vi.mock("@/lib/auth/client", () => ({
  authClient: { sendVerificationEmail: vi.fn() },
  signOut: vi.fn(),
}));

const AUTH_PAGES = [
  "app/invite",
  "app/sign-in",
  "app/sign-up",
  "app/forgot-password",
  "app/reset-password",
  "app/no-workspace",
  "components/domain/auth",
];

// One walk per file, cached (tests/helpers/source-files.ts); each test reads the cache.
readSourcesBeforeAll(AUTH_PAGES);

const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the invite and auth pages name the product from PRODUCT_NAME", () => {
  it("none of their code says VisibleAU", () => {
    const files = sourcePaths(AUTH_PAGES);
    expect(files).toContain("app/invite/[orgId]/[token]/invite-client.tsx");
    expect(files.length).toBeGreaterThan(8);
    const literal = files.filter((f) => /visibleau/i.test(stripComments(sourceText(f))));
    expect(literal).toEqual([]);
  });

  it("an invite that can't be accepted offers the way back by the product's name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "Invalid or expired invitation" }, { status: 404 })),
    );
    render(createElement(AcceptInvite, { orgId: "org", token: "token-123456", email: "a@b.co" }));
    const back = await screen.findByRole("link", { name: `Back to ${PRODUCT_NAME}` });
    expect(back).toHaveAttribute("href", "/dashboard");
    expect(PRODUCT_NAME).toBe("Vunnara");
  });
});
