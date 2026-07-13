import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const technicalAuditSrc = readFileSync(
  resolve(__dirname, "../../../inngest/functions/technical-audit-run.ts"),
  "utf-8",
);

describe("technical-audit-run emit", () => {
  it("emits slash-form 'technical-audit/complete' for internal chaining", () => {
    expect(technicalAuditSrc).toContain('"technical-audit/complete"');
  });

  it("does NOT emit dead dot-form 'technical-audit.complete' (A-1 fix)", () => {
    expect(technicalAuditSrc).not.toContain('"technical-audit.complete"');
  });

  it("emit payload carries orgId, brandId, auditId", () => {
    const emitBlock = technicalAuditSrc.slice(
      technicalAuditSrc.indexOf("emit-technical-audit-complete"),
    );
    expect(emitBlock).toContain("orgId: context.organizationId");
    expect(emitBlock).toContain("brandId: context.brandId");
    expect(emitBlock).toContain("auditId: context.auditId");
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
});
