/**
 * Brand-feature locks and pricing claims (8 Nov), part 5 -- which requests better-auth's shared limiter counts
 * (lib/auth/rate-limit-rules.ts): its own guarded routes, per caller address, and nothing else. A request
 * without an address is never counted: in development and tests better-auth would count it as 127.0.0.1,
 * one counter for everybody. tests/integration/auth-rate-limit-shared.integration.test.ts proves the same
 * through better-auth's own handler and its own path matching.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AUTH_RATE_LIMIT_RETENTION_MS } from "@/lib/auth/rate-limit-cleanup";
import {
  type AuthRateLimitRule,
  authRateLimitRules,
  COUNTED_AUTH_PATHS,
  callerIp,
} from "@/lib/auth/rate-limit-rules";
import { AUTH_RATE_LIMIT_RETENTION_HOURS } from "@/lib/governance/residency-config";

const SIGN_IN_RULE: AuthRateLimitRule = { window: 10, max: 3 };
const request = (headers: Record<string, string> = {}) =>
  new Request("http://localhost:3000/api/auth/sign-in/email", { method: "POST", headers });

describe("the caller's address", () => {
  it("is the first x-forwarded-for entry, as better-auth reads it and Vercel sets it", () => {
    expect(callerIp(request({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
    expect(callerIp(request({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(callerIp(request({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
  });

  it("is nobody's when the header is missing or isn't an address", () => {
    expect(callerIp(request())).toBeNull();
    expect(callerIp(request({ "x-forwarded-for": "" }))).toBeNull();
    expect(callerIp(request({ "x-forwarded-for": "unknown" }))).toBeNull();
    expect(callerIp(request({ "x-forwarded-for": "localhost, 203.0.113.7" }))).toBeNull();
  });
});

describe("the rules better-auth reads (rateLimit.customRules)", () => {
  const rules = authRateLimitRules();

  it("each guarded route keeps better-auth's own rule for a caller with an address, and none without", () => {
    for (const path of COUNTED_AUTH_PATHS) {
      const rule = rules[path];
      expect(typeof rule, path).toBe("function");
      if (typeof rule !== "function") continue;
      expect(rule(request({ "x-forwarded-for": "203.0.113.7" }), SIGN_IN_RULE), path).toEqual(
        SIGN_IN_RULE,
      );
      expect(rule(request(), SIGN_IN_RULE), path).toBe(false);
    }
  });

  it("sign-in, sign-up, password changes and resets, and verification emails are the guarded ones", () => {
    expect([...COUNTED_AUTH_PATHS]).toEqual([
      "/sign-in/**",
      "/sign-up/**",
      "/change-password",
      "/change-email",
      "/request-password-reset",
      "/forget-password/**",
      "/reset-password/**",
      "/send-verification-email",
    ]);
  });

  it("every other route keeps no count, and the catch-all comes last so it hides none of them", () => {
    expect(rules["/**"]).toBe(false);
    expect(Object.keys(rules)).toEqual([...COUNTED_AUTH_PATHS, "/**"]);
  });
});

describe("the privacy page", () => {
  it("states the period the daily cleanup enforces, and the cleanup runs every day", () => {
    // 9 Nov (retention follow-ups, part 2): the page states the period from the constant the cleanup deletes by
    // (lib/governance/residency-config.ts), not a literal of its own.
    expect(AUTH_RATE_LIMIT_RETENTION_MS).toBe(AUTH_RATE_LIMIT_RETENTION_HOURS * 60 * 60 * 1000);
    expect(AUTH_RATE_LIMIT_RETENTION_HOURS).toBe(24);
    const page = readFileSync("app/(marketing)/privacy/page.tsx", "utf8").replace(/\s+/g, " ");
    expect(page).toContain("by the internet (IP) address they come from");
    expect(page).toContain(
      "once {AUTH_RATE_LIMIT_RETENTION_HOURS} hours have passed since the last attempt",
    );
    const cron = readFileSync("inngest/functions/sample-audit-cleanup.ts", "utf8");
    expect(cron).toContain('cron: "0 3 * * *"');
    expect(cron).toMatch(/await deleteStaleAuthRateLimits\(\)/);
  });
});
