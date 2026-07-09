import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const src = readFileSync(resolve(__dirname, "../../../inngest/functions/run-journey.ts"), "utf-8");

describe("run-journey integration (source analysis)", () => {
  it("uses step.run() per engine per turn with stable names", () => {
    expect(src).toContain("step.run(");
    expect(src).toMatch(/step\.run\(`turn-\$\{turn\.turn\}-\$\{engine\}`/);
  });

  it("persist step per engine for retry-idempotent INSERT", () => {
    expect(src).toMatch(/step\.run\(`persist-\$\{engine\}`/);
  });

  it("has concurrency limit of 3", () => {
    expect(src).toMatch(/concurrency:\s*\{\s*limit:\s*3\s*\}/);
  });

  it("triggers on journey/run-requested", () => {
    expect(src).toContain('"journey/run-requested"');
  });

  it("maps engines via ENGINE_TO_PROVIDER and gates with isEngineEnabled", () => {
    expect(src).toContain("ENGINE_TO_PROVIDER");
    expect(src).toContain("isEngineEnabled");
  });

  it("returns early when 0 engines enabled", () => {
    expect(src).toContain("engines.length === 0");
    expect(src).toContain("no_enabled_engines");
  });
});
