import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const fn = (name: string) =>
  readFileSync(resolve(__dirname, `../../../inngest/functions/${name}.ts`), "utf-8");

describe("Bug 5 — score-agent-readiness reads orgId from event", () => {
  const src = fn("score-agent-readiness");

  it("destructures orgId (not organizationId) from event.data", () => {
    expect(src).toMatch(/orgId:\s*organizationId/);
  });

  it("event type declares orgId field", () => {
    expect(src).toMatch(/orgId:\s*string/);
  });

  it("insert passes organizationId to agentReadinessScores", () => {
    expect(src).toContain("organizationId,");
  });

  it("emit in technical-audit-run sends orgId in payload", () => {
    const emitter = fn("technical-audit-run");
    expect(emitter).toContain("orgId: context.organizationId");
  });

  it("audit-entity-home also destructures orgId (same bug class)", () => {
    const src = fn("audit-entity-home");
    expect(src).toMatch(/orgId:\s*organizationId/);
  });
});

describe("Bug 6 — post-audit functions trigger on audit.complete (dot)", () => {
  const auditFunctions = [
    "run-comparison-prompts",
    "detect-hallucinations",
    "ga4-push",
    "capture-evidence-snapshot",
  ];

  for (const name of auditFunctions) {
    it(`${name} triggers on audit.complete (dot), not audit/complete (slash)`, () => {
      const src = fn(name);
      expect(src).toContain('"audit.complete"');
      expect(src).not.toContain('"audit/complete"');
    });
  }

  it("run-audit.ts emits audit.complete", () => {
    const src = fn("run-audit");
    expect(src).toContain('"audit.complete"');
  });
});
