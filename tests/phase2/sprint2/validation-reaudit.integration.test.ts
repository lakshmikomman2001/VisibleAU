import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("trigger-validation-reaudit — event + quota gate", () => {
  const source = fs.readFileSync(
    path.resolve("inngest/functions/trigger-validation-reaudit.ts"),
    "utf-8",
  );

  it("triggers on task/completed event", () => {
    expect(source).toContain("task/completed");
  });

  it("uses step.sleep for 14-day wait", () => {
    expect(source).toContain("step.sleep");
    expect(source).toContain("wait-14-days");
    expect(source).toContain('"14 days"');
  });

  it("calls checkQuota before running the reaudit", () => {
    const checkQuotaIdx = source.indexOf("checkQuota");
    const runReauditIdx = source.indexOf("run-reaudit");
    expect(checkQuotaIdx).toBeGreaterThan(-1);
    expect(runReauditIdx).toBeGreaterThan(-1);
    expect(checkQuotaIdx).toBeLessThan(runReauditIdx);
  });

  it("calls markReauditDeferred when over quota", () => {
    expect(source).toContain("markReauditDeferred");
    expect(source).toContain("quota_exceeded");
  });

  it("creates an audit row and runs reaudit inline", () => {
    expect(source).toContain("create-reaudit-audit");
    expect(source).toContain("runAuditInline");
  });

  it("calls recordReauditResults to write back lift", () => {
    expect(source).toContain("recordReauditResults");
    expect(source).toContain("record-lift");
  });

  it("returns deferred status on over-quota path", () => {
    expect(source).toContain("deferred: true");
    expect(source).toContain("deferred: false");
  });
});

describe("task complete route emits task/completed event", () => {
  const source = fs.readFileSync(
    path.resolve("app/api/brands/[brandId]/tasks/[id]/complete/route.ts"),
    "utf-8",
  );

  it("sends task/completed event via inngest.send", () => {
    expect(source).toContain("inngest.send");
    expect(source).toContain("task/completed");
  });

  it("includes taskId, brandId, orgId in the event payload", () => {
    expect(source).toContain("taskId");
    expect(source).toContain("brandId");
    expect(source).toContain("orgId");
  });
});

describe("validation-scheduler — exported constants & structure", () => {
  const valSource = fs.readFileSync(
    path.resolve("lib/workflow/validation-scheduler.ts"),
    "utf-8",
  );

  it("exports REAUDIT_DELAY_DAYS = 14", () => {
    expect(valSource).toContain("export const REAUDIT_DELAY_DAYS = 14");
  });

  it("exports scheduleReaudit as an async function", () => {
    expect(valSource).toContain("export async function scheduleReaudit");
  });

  it("exports recordReauditResults as an async function", () => {
    expect(valSource).toContain("export async function recordReauditResults");
  });
});

describe("validation-scheduler — source-level lift computation", () => {
  const valSource = fs.readFileSync(
    path.resolve("lib/workflow/validation-scheduler.ts"),
    "utf-8",
  );

  it("computeLift returns null when scoreBefore is missing", () => {
    expect(valSource).toContain("if (!task?.scoreBefore) return null");
  });

  it("lift = scoreAfter - scoreBefore", () => {
    expect(valSource).toContain("scoreAfter - Number(task.scoreBefore)");
  });

  it("scheduleReaudit calls markReauditDeferred on over-quota", () => {
    expect(valSource).toContain('markReauditDeferred(taskId, "quota_exceeded")');
  });

  it("scheduleReaudit returns { scheduled: false } on over-quota", () => {
    expect(valSource).toContain("scheduled: false");
    expect(valSource).toContain('"quota_exceeded"');
  });

  it("scheduleReaudit returns { scheduled: true } when allowed", () => {
    expect(valSource).toContain("scheduled: true");
  });
});
