/**
 * Audit reliability, Part A -- the same cross-runner parity concern as
 * the sibling run-audit-citedurls-parity.test.ts (task #43): both
 * audit runners must call the ONE shared retry wrapper
 * (lib/llm/with-retry.ts) and write an identical engine_call_failures
 * row shape, not two independently-drifting reimplementations.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const RUNNER_FILES = ["lib/audit/run-audit-inline.ts", "inngest/functions/run-audit.ts"];

const EXPECTED_FAILURE_ROW_FIELDS = [
  "auditId",
  "organizationId",
  "engine",
  "prompt",
  "isBrandedPrompt",
  "errorClass",
  "errorMessage",
  "attempts",
  "latencyMs",
  "costUsd",
];

describe("both audit runners use the one shared retry wrapper", () => {
  for (const file of RUNNER_FILES) {
    it(`${file} imports callWithRetry from lib/llm/with-retry`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toMatch(/import\s*\{\s*callWithRetry\s*\}\s*from\s*"@\/lib\/llm\/with-retry"/);
    });

    it(`${file} never calls llm.complete() directly outside callWithRetry`, () => {
      const src = readFileSync(file, "utf8");
      // The only "llm.complete(" text in either file must be inside a
      // callWithRetry(() => llm.complete(...)) call -- never a second,
      // bare call site that would bypass retry/classification/cost
      // tracking entirely.
      const completeCalls = src.match(/llm\.complete\(/g) ?? [];
      expect(completeCalls.length).toBe(1);
      const retryIdx = src.indexOf("callWithRetry(");
      const completeIdx = src.indexOf("llm.complete(");
      expect(retryIdx).toBeGreaterThan(-1);
      expect(completeIdx).toBeGreaterThan(retryIdx);
    });
  }

  for (const file of RUNNER_FILES) {
    it(`${file} writes every engine_call_failures field (identical shape)`, () => {
      const src = readFileSync(file, "utf8");
      const insertIdx = src.indexOf("insert(engineCallFailures)");
      expect(insertIdx).toBeGreaterThan(-1);
      const valuesBlock = src.slice(insertIdx, insertIdx + 600);
      for (const field of EXPECTED_FAILURE_ROW_FIELDS) {
        // Either `field: value` or shorthand `field,` (auditId above
        // is shorthand -- the variable name already matches the key).
        const pattern = new RegExp(`\\b${field}\\s*[,:]`);
        expect(pattern.test(valuesBlock), `${file} is missing field "${field}"`).toBe(true);
      }
    });

    it(`${file} adds the failed call's real cost to totalCost (never drops it)`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toMatch(/totalCost\s*\+=\s*(r|callResult)\.costUsd/);
    });
  }
});
