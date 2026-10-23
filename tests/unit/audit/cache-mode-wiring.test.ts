/**
 * "'Run audit' always fetches fresh answers" (23 Oct), item 1 -- both
 * real-audit runners must resolve a cache mode exactly once (inside
 * their one memoized load step) and pass it to EVERY llm.complete()
 * call they make. Source-level check, same pattern as this session's
 * other "did the wiring actually happen" guards -- a missed call site
 * would silently keep reading the cache with no restriction at all.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RUN_AUDIT_SOURCE = fs.readFileSync(path.resolve("inngest/functions/run-audit.ts"), "utf-8");
const RUN_AUDIT_INLINE_SOURCE = fs.readFileSync(
  path.resolve("lib/audit/run-audit-inline.ts"),
  "utf-8",
);

describe("inngest/functions/run-audit.ts", () => {
  it("imports resolveCacheMode from the shared helper", () => {
    expect(RUN_AUDIT_SOURCE).toContain(
      'import { resolveCacheMode } from "@/lib/audit/cache-mode"',
    );
  });

  it("calls resolveCacheMode inside its load-audit step, not per-call", () => {
    const loadStepIndex = RUN_AUDIT_SOURCE.indexOf('step.run("load-audit"');
    const resolveCallIndex = RUN_AUDIT_SOURCE.indexOf("resolveCacheMode(a)");
    const firstEngineCallIndex = RUN_AUDIT_SOURCE.indexOf('step.run(`call:');
    expect(loadStepIndex).toBeGreaterThan(-1);
    expect(resolveCallIndex).toBeGreaterThan(loadStepIndex);
    expect(resolveCallIndex).toBeLessThan(firstEngineCallIndex);
  });

  it("every llm.complete() call passes cacheMode: loaded.cacheMode", () => {
    const completeCalls = RUN_AUDIT_SOURCE.match(/llm\.complete\(\{[\s\S]*?\}\),/g) ?? [];
    expect(completeCalls.length).toBeGreaterThan(0);
    for (const call of completeCalls) {
      expect(call).toContain("cacheMode: loaded.cacheMode");
    }
  });
});

describe("lib/audit/run-audit-inline.ts", () => {
  it("imports resolveCacheMode from the shared helper", () => {
    expect(RUN_AUDIT_INLINE_SOURCE).toContain(
      'import { resolveCacheMode } from "@/lib/audit/cache-mode"',
    );
  });

  it("calls resolveCacheMode once, before the per-call loop", () => {
    const resolveCallIndex = RUN_AUDIT_INLINE_SOURCE.indexOf("resolveCacheMode(a)");
    const runOneCallIndex = RUN_AUDIT_INLINE_SOURCE.indexOf("async function runOneCall");
    expect(resolveCallIndex).toBeGreaterThan(-1);
    expect(resolveCallIndex).toBeLessThan(runOneCallIndex);
  });

  it("every llm.complete() call passes cacheMode", () => {
    const completeCalls = RUN_AUDIT_INLINE_SOURCE.match(/llm\.complete\(\{[\s\S]*?\}\),/g) ?? [];
    expect(completeCalls.length).toBeGreaterThan(0);
    for (const call of completeCalls) {
      // \r? (23 Oct baseline-reconciliation follow-up): this repo
      // checks out with CRLF line endings (core.autocrlf=true), so the
      // real separator here is "\r\n", not a bare "\n" -- the original
      // regex never matched on this checkout despite cacheMode
      // genuinely being present (lib/audit/run-audit-inline.ts:193),
      // failing a passing call site as if it were a missed one.
      expect(call).toMatch(/\bcacheMode,?\r?\n/);
    }
  });
});

// Both runners resolve mode through the identical shared helper and
// pass it through the identical CompleteInput.cacheMode field -- there
// is only one implementation to behave differently in the first
// place, so "the Inngest and inline runners behave the same" is
// structural, not something to re-verify per call shape.
describe("both runners share one cache-mode implementation", () => {
  it("both import resolveCacheMode from the SAME module path", () => {
    const runAuditImport = RUN_AUDIT_SOURCE.match(/from "([^"]*cache-mode)"/)?.[1];
    const runAuditInlineImport = RUN_AUDIT_INLINE_SOURCE.match(/from "([^"]*cache-mode)"/)?.[1];
    expect(runAuditImport).toBe("@/lib/audit/cache-mode");
    expect(runAuditInlineImport).toBe("@/lib/audit/cache-mode");
  });
});
