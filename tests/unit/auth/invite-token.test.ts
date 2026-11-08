/**
 * Follow-ups from d247ba7..f13411d, part 3 -- an invite's token is the only key to it. It's 256 bits from the
 * operating system's cryptographic random source (it was nanoid(21): 126 bits), and the password rule for
 * the invite's sign-up is the normal sign-up's own.
 *
 * Follow-ups from 6e27afc..01a6a8c, part 4 (Sri, 8 Nov; migration 0134) -- only the token's SHA-256 hash is
 * stored, and an invite is found by that hash. No code writes a token to org_members.invitation_token any
 * more (it only clears it), and nothing looks an invite up by the plain token.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { hashInviteToken, newInviteToken } from "@/lib/auth/invite-token";
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

describe("storing and finding a token: by its hash", () => {
  it("the hash is SHA-256 of the token's UTF-8 bytes, as 64 lower-case hex characters", () => {
    // SHA-256("abc"), FIPS 180-2's own example: what Postgres's encode(sha256(convert_to('abc', 'UTF8')),
    // 'hex') gives too, which migration 0134 used for the tokens it found.
    expect(hashInviteToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    const token = newInviteToken();
    expect(hashInviteToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInviteToken(token)).toBe(hashInviteToken(token));
    const oneCharOff = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
    expect(hashInviteToken(oneCharOff)).not.toBe(hashInviteToken(token));
  });

  it("the invite route stores the new token's hash, on a new invite and on a re-send", () => {
    const route = code("app/api/organizations/[orgId]/members/invite/route.ts");
    expect(route.match(/invitationTokenHash: hashInviteToken\(token\)/g)).toHaveLength(2);
  });

  it("no code stores a token: every write to invitationToken clears it", () => {
    const offenders = sources().flatMap((file) =>
      [...code(file).matchAll(/\binvitationToken:\s*([^,\n}]+)/g)]
        .map((m) => m[1].trim())
        .filter((value) => value !== "null")
        .map((value) => `${file}: invitationToken: ${value}`),
    );
    expect(offenders).toEqual([]);
  });

  it("the one lookup is by the hash, in findInviteByToken; nothing looks a plain token up", () => {
    expect(code("lib/auth/invite.ts")).toMatch(
      /eq\(\s*orgMembers\.invitationTokenHash,\s*hashInviteToken\(token\)\s*\)/,
    );
    const byHash = sources().filter((file) =>
      /eq\(\s*orgMembers\.invitationTokenHash\b/.test(code(file)),
    );
    expect(byHash).toEqual(["lib/auth/invite.ts"]);
    const byPlainToken = sources().filter((file) =>
      /eq\(\s*orgMembers\.invitationToken\b|invitation_token\s*=\s*\$\{/.test(code(file)),
    );
    expect(byPlainToken).toEqual([]);
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
