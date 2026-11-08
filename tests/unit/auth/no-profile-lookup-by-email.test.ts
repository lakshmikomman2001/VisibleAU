/**
 * 3 Nov -- a profile is found by its account id, never by an address: sign-up
 * doesn't prove an address until it's verified, and a lookup by address hands
 * whoever claims it someone else's workspace. A source scan of everything that
 * ships.
 *
 * The one exception is lib/auth/invite.ts's findInviteTarget, which is sending an
 * invite, not signing anyone in: an owner names an address, the invite is stored
 * against that profile's id, and it gives nothing until that profile's own
 * account opens the emailed token (members/accept/route.ts compares ids). Accepting
 * needs no lookup by address at all.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");
const SCANNED = ["app", "components", "inngest", "lib", "middleware.ts"];
const INVITE_SENDING = "lib/auth/invite.ts";

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (path: string) => {
    if (!existsSync(path)) return;
    if (statSync(path).isDirectory()) {
      for (const entry of readdirSync(path)) walk(join(path, entry));
    } else if (/\.tsx?$/.test(path)) {
      out.push(relative(ROOT, path).split(sep).join("/"));
    }
  };
  for (const entry of SCANNED) walk(join(ROOT, entry));
  return out;
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const FILES = sourceFiles();
const code = (file: string) => stripComments(readFileSync(join(ROOT, file), "utf8"));

/** A profile looked up by an address: eq(users.email, x), or the same in raw SQL. (Comparing with the
 * sign-up placeholder is not a lookup by anyone's address.) */
const PROFILE_BY_ADDRESS =
  /eq\(\s*users\.email\s*,\s*(?!PLACEHOLDER_EMAIL)|\$\{users\.email\}\s*=\s*\$\{(?!PLACEHOLDER_EMAIL)|WHERE\s+(?:u\.|users\.)?email\s*=\s*\$\{/;

/** A sign-in account (better-auth's auth_users) found by an address: Drizzle or raw SQL. */
const ACCOUNT_BY_ADDRESS =
  /eq\(\s*authUsers\.email\s*,|\$\{authUsers\.email\}\)?\s*=|auth_users\s+WHERE[^;`]*\bemail\b\s*\)?\s*=/;
const SIGN_IN_ACCOUNT = "lib/auth/sign-in-account.ts";

describe("no profile is looked up by its address", () => {
  it("found the code it's meant to scan", () => {
    expect(FILES.length).toBeGreaterThan(500);
    expect(FILES).toContain("lib/auth/current-user.ts");
  });

  it("only invite sending does, and nothing that signs anyone in", () => {
    expect(FILES.filter((f) => PROFILE_BY_ADDRESS.test(code(f)))).toEqual([INVITE_SENDING]);
  });

  it("invite sending does it in one function, and that function grants nothing", () => {
    const invite = code(INVITE_SENDING);
    const functions = invite.split(/\nexport (?:async )?function /);
    const looking = functions.filter((body) => PROFILE_BY_ADDRESS.test(body));
    expect(looking).toHaveLength(1);
    expect(looking[0].startsWith("findInviteTarget(")).toBe(true);
    expect(looking[0]).not.toMatch(/\.(?:insert|update|delete)\(/);
  });

  it("getCurrentUser and findAccountProfile take the account id, and no address", () => {
    const current = code("lib/auth/current-user.ts");
    expect(current).toMatch(/eq\(users\.clerkUserId, session\.user\.id\)/);
    expect(current).not.toMatch(/session\.user\.email/);
    const profile = code("lib/auth/profile.ts");
    expect(profile).toMatch(/findAccountProfile\(authUserId: string\)/);
    expect(profile).not.toMatch(/users\.email/);
  });

  // Live invite test follow-ups (8 Nov), part 2: "has an account" is a sign-in account for the address. It's
  // read in one place, as a yes or no, and the only write keyed by an address marks the invited address
  // verified, for the invite sign-in, after better-auth has accepted the password.
  it("a sign-in account is found by its address only as a yes or no, in lib/auth/sign-in-account.ts", () => {
    expect(FILES.filter((f) => ACCOUNT_BY_ADDRESS.test(code(f))).sort()).toEqual([
      INVITE_SENDING,
      SIGN_IN_ACCOUNT,
    ]);
    const helper = code(SIGN_IN_ACCOUNT);
    expect(helper).toMatch(
      /SELECT EXISTS \(SELECT 1 FROM auth_users WHERE lower\(email\) = lower\(trim\(\$\{address\}\)\)\) AS found/,
    );
    expect(helper).toMatch(/return row\?\.found === true;/);
    // Nothing else is read from auth_users here; the one write sets email_verified and nothing else.
    expect(helper.match(/\bSELECT\b/g)).toHaveLength(2);
    expect(helper).toMatch(/UPDATE auth_users SET email_verified = true, updated_at = now\(\)/);
    expect(helper).not.toMatch(/\.(?:insert|delete)\(|DELETE FROM|INSERT INTO/);
  });

  it("only the invite sign-in marks an address verified, with the address from the invite row", () => {
    const callers = FILES.filter(
      (f) => f !== SIGN_IN_ACCOUNT && /markInvitedAddressVerified\(/.test(code(f)),
    );
    expect(callers).toEqual(["app/api/invites/[orgId]/[token]/sign-in/route.ts"]);
    const route = code(callers[0]);
    expect(route).toMatch(/inviteSignInAddress\(orgId, token\)/);
    expect(route).toMatch(/markInvitedAddressVerified\(target\.email\)/);
    // The form sends a password and nothing else.
    expect(route).toMatch(/z\.object\(\{ password: z\.string\(\)/);
    expect(route).not.toMatch(/email: z\./);
  });

  it("accepting an invite compares ids, needs its token, and looks nothing up by address", () => {
    const accept = code("app/api/organizations/[orgId]/members/accept/route.ts");
    // By its token, compared in constant time (follow-ups from d247ba7..f13411d, part 3).
    expect(accept).toMatch(/findInviteByToken\(tx, orgId, token, false\)/);
    expect(accept).toMatch(/profile\?\.id !== member\.userId/);
    expect(accept).toMatch(/findAccountProfile\(session\.user\.id\)/);
    expect(accept).not.toMatch(/users\.email/);
  });
});
