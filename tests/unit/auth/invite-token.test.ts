/**
 * Follow-ups from d247ba7..f13411d, part 3 -- an invite's token is the only key to it. It's 256 bits from the
 * operating system's cryptographic random source (it was nanoid(21): 126 bits), compared in constant time
 * with every invite the workspace holds (never by the database), and the password rule for the invite's
 * sign-up is the normal sign-up's own.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { newInviteToken, rowWithToken, sameToken } from "@/lib/auth/invite-token";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_RULE,
  passwordProblem,
} from "@/lib/auth/password-rules";

const ROOT = join(__dirname, "../../..");
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

function sources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(ROOT, dir))) {
      const path = join(dir, name);
      if (statSync(join(ROOT, path)).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(path)) out.push(path.split(sep).join("/"));
    }
  };
  for (const dir of ["app", "components", "lib", "inngest"]) walk(dir);
  return out;
}

describe("a new invite token", () => {
  it("is 256 bits, base64url: 43 characters", () => {
    const token = newInviteToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("is never the same twice (2,000 of them)", () => {
    const tokens = new Set(Array.from({ length: 2000 }, () => newInviteToken()));
    expect(tokens.size).toBe(2000);
  });

  it("comes from node:crypto's randomBytes, and the invite route uses it, not nanoid", () => {
    expect(code("lib/auth/invite-token.ts")).toMatch(
      /import \{[^}]*\brandomBytes\b[^}]*\} from "node:crypto"/,
    );
    const route = code("app/api/organizations/[orgId]/members/invite/route.ts");
    expect(route).toMatch(/newInviteToken\(\)/);
    expect(route).not.toMatch(/nanoid/);
  });
});

describe("comparing a token", () => {
  it("matches only the same token", () => {
    const token = newInviteToken();
    expect(sameToken(token, token)).toBe(true);
    const oneCharOff = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
    expect(sameToken(token, oneCharOff)).toBe(false);
    expect(sameToken(token, token.slice(0, 20))).toBe(false);
    expect(sameToken(token, "")).toBe(false);
  });

  it("uses timingSafeEqual, on hashes of the same length", () => {
    const source = code("lib/auth/invite-token.ts");
    expect(source).toMatch(/timingSafeEqual\(digest\(stored\), digest\(given\)\)/);
  });

  it("finds the invite among a workspace's, reading every one: no early exit", () => {
    const reads: number[] = [0, 0, 0];
    const tokens = [newInviteToken(), newInviteToken(), newInviteToken()];
    const rows = tokens.map((token, i) => ({
      id: `invite-${i}`,
      get invitationToken() {
        reads[i]++;
        return token;
      },
    }));
    expect(rowWithToken(rows, tokens[0])?.id).toBe("invite-0");
    expect(reads.every((n) => n > 0)).toBe(true);
    expect(rowWithToken(rows, newInviteToken())).toBeNull();
    expect(rowWithToken([{ invitationToken: null }], "anything")).toBeNull();
  });

  it("nothing asks the database to compare a token: no query filters on invitation_token by value", () => {
    const offenders = sources().filter((file) =>
      /eq\(\s*orgMembers\.invitationToken\b|invitation_token\s*=\s*\$\{/.test(code(file)),
    );
    expect(offenders).toEqual([]);
  });
});

describe("the password rule: one, for every sign-up", () => {
  it(`is ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters`, () => {
    expect(passwordProblem("a".repeat(PASSWORD_MIN_LENGTH - 1))).toBe(PASSWORD_RULE);
    expect(passwordProblem("a".repeat(PASSWORD_MIN_LENGTH))).toBeNull();
    expect(passwordProblem("a".repeat(PASSWORD_MAX_LENGTH))).toBeNull();
    expect(passwordProblem("a".repeat(PASSWORD_MAX_LENGTH + 1))).toBe(PASSWORD_RULE);
  });

  it("better-auth's own check reads it, and so do the invite route and every password form", () => {
    expect(code("lib/auth/server.ts")).toMatch(/minPasswordLength: PASSWORD_MIN_LENGTH/);
    expect(code("lib/auth/server.ts")).toMatch(/maxPasswordLength: PASSWORD_MAX_LENGTH/);
    expect(code("app/api/invites/[orgId]/[token]/sign-up/route.ts")).toMatch(/passwordProblem\(/);
    for (const form of [
      "app/sign-up/[[...sign-up]]/sign-up-form.tsx",
      "components/domain/auth/invite-sign-up.tsx",
      "app/reset-password/page.tsx",
    ]) {
      expect(code(form), form).toMatch(/minLength=\{PASSWORD_MIN_LENGTH\}/);
      expect(code(form), form).not.toMatch(/minLength=\{\d+\}/);
    }
  });
});
