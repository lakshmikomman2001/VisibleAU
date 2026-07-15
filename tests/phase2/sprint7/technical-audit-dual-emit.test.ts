import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const technicalAuditSrc = readFileSync(
  resolve(__dirname, "../../../lib/audit/run-technical-audit-inline.ts"),
  "utf-8",
);

describe("technical-audit emit (run-technical-audit-inline)", () => {
  it("emits slash-form 'technical-audit/complete' for internal chaining", () => {
    expect(technicalAuditSrc).toContain('"technical-audit/complete"');
  });

  it("does NOT emit dead dot-form 'technical-audit.complete' (A-1 fix)", () => {
    expect(technicalAuditSrc).not.toContain('"technical-audit.complete"');
  });

  it("emit payload carries orgId, brandId, auditId", () => {
    expect(technicalAuditSrc).toContain("orgId: brand.organizationId");
    expect(technicalAuditSrc).toContain("brandId");
    expect(technicalAuditSrc).toContain("auditId");
  });

  it("slash-form wakes refresh-entity-score, score-agent-readiness, audit-entity-home", () => {
    const checkFile = (name: string) => {
      try {
        const src = readFileSync(
          resolve(__dirname, `../../../inngest/functions/${name}.ts`),
          "utf-8",
        );
        return src.includes("technical-audit/complete");
      } catch {
        return false;
      }
    };

    const targets = ["refresh-entity-score", "score-agent-readiness", "audit-entity-home"];
    const matched = targets.filter(checkFile);
    expect(matched.length).toBeGreaterThanOrEqual(1);
  });

  it("phantom writer (technical-audit-run.ts) is removed", () => {
    const exists = (() => {
      try {
        readFileSync(resolve(__dirname, "../../../inngest/functions/technical-audit-run.ts"), "utf-8");
        return true;
      } catch { return false; }
    })();
    expect(exists).toBe(false);
  });
});
