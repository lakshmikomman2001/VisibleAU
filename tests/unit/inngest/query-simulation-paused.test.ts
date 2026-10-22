/**
 * "Pause query simulation" (Sri's decision, 23 Oct) -- the flag check
 * in simulate-query-fan-out.ts must run BEFORE step.run("fan-out", ...)
 * (the step that makes LLM calls, records cost, and writes
 * query_fan_out_results rows), not after it, and must return instead
 * of calling it at all -- otherwise "paused" would still make every
 * one of those happen before anyone noticed the flag.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = fs.readFileSync(
  path.resolve("inngest/functions/simulate-query-fan-out.ts"),
  "utf-8",
);

describe("simulate-query-fan-out.ts -- paused-flag guard runs before any real work", () => {
  it("imports isQuerySimulationEnabled from the shared feature-flags module", () => {
    expect(SOURCE).toMatch(/import\s*\{[^}]*isQuerySimulationEnabled[^}]*\}\s*from\s*"@\/lib\/feature-flags"/);
  });

  it("checks the flag strictly before step.run(\"fan-out\", ...) -- never after", () => {
    const flagCheckIndex = SOURCE.indexOf("isQuerySimulationEnabled()");
    const fanOutStepIndex = SOURCE.indexOf('step.run("fan-out"');
    expect(flagCheckIndex).toBeGreaterThan(-1);
    expect(fanOutStepIndex).toBeGreaterThan(-1);
    expect(flagCheckIndex).toBeLessThan(fanOutStepIndex);
  });

  it("returns early (does not call step.run at all) when the flag check fails", () => {
    const flagCheckIndex = SOURCE.indexOf("if (!isQuerySimulationEnabled())");
    const nextReturn = SOURCE.indexOf("return", flagCheckIndex);
    const nextStepRun = SOURCE.indexOf("step.run(", flagCheckIndex);
    // the very next "return" after the guard comes before the very next
    // step.run -- i.e. the guard's own branch returns, it doesn't fall
    // through into the real work.
    expect(nextReturn).toBeGreaterThan(-1);
    expect(nextReturn).toBeLessThan(nextStepRun);
  });

  it("the function is still registered on audit.complete either way (no Inngest resync needed to re-enable)", () => {
    expect(SOURCE).toContain('triggers: [{ event: "audit.complete" }]');
  });
});
