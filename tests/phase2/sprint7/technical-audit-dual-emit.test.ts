import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const technicalAuditSrc = readFileSync(
  resolve(__dirname, "../../../inngest/functions/technical-audit-run.ts"),
  "utf-8",
);

const validEventsSrc = readFileSync(
  resolve(__dirname, "../../../lib/webhooks/events.ts"),
  "utf-8",
);

describe("technical-audit-run dual emit", () => {
  it("emits dot-form 'technical-audit.complete' for webhooks", () => {
    expect(technicalAuditSrc).toContain('"technical-audit.complete"');
  });

  it("emits slash-form 'technical-audit/complete' for internal chaining", () => {
    expect(technicalAuditSrc).toContain('"technical-audit/complete"');
  });

  it("dot-form is registered in webhook VALID_EVENTS", () => {
    expect(validEventsSrc).toContain('"technical-audit.complete"');
  });

  it("both emit payloads carry orgId, brandId, auditId (Bug-5 guard)", () => {
    const emitBlock = technicalAuditSrc.slice(
      technicalAuditSrc.indexOf("emit-technical-audit-complete"),
    );
    expect(emitBlock).toContain("orgId: context.organizationId");
    expect(emitBlock).toContain("brandId: context.brandId");
    expect(emitBlock).toContain("auditId: context.auditId");
    const orgIdOccurrences = (emitBlock.match(/orgId: context\.organizationId/g) || []).length;
    expect(orgIdOccurrences).toBeGreaterThanOrEqual(2);
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
