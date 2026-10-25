import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

describe("send-scheduled-reports Inngest function", () => {
  const srcPath = resolve(__dirname, "../../../inngest/functions/send-scheduled-reports.ts");
  const src = readFileSync(srcPath, "utf-8");

  it("uses an hourly cron schedule", () => {
    expect(src).toMatch(/cron.*every\s+1\s+hour|0\s+\*\s+\*\s+\*\s+\*/i);
  });

  it("finds due schedules by checking active schedules", () => {
    expect(src).toContain("find-due-schedules");
    expect(src).toContain("isActive");
  });

  it("updates emailSentAt after successful send", () => {
    expect(src).toContain("emailSentAt");
  });

  it("updates lastSentAt on the schedule after send", () => {
    expect(src).toContain("lastSentAt");
  });

  // Task 15: delivery goes through lib/email/send.ts (Resend), one
  // idempotent send per recipient.
  it("sends through lib/email/send for email delivery", () => {
    expect(src).toContain('from "@/lib/email/send"');
    expect(src).toContain("idempotencyKeyFor(");
  });

  it("does not hardcode model names", () => {
    expect(src).not.toMatch(/["']gpt-4/);
    expect(src).not.toMatch(/["']claude-3/);
  });
});

describe("generate-narrative-report Inngest function", () => {
  const srcPath = resolve(__dirname, "../../../inngest/functions/generate-narrative-report.ts");
  const src = readFileSync(srcPath, "utf-8");

  it("listens on trend/aggregated event", () => {
    expect(src).toContain("trend/aggregated");
  });

  it("has concurrency limit of 5", () => {
    expect(src).toMatch(/concurrency.*5|limit.*5/s);
  });

  it("emits report/generated event", () => {
    expect(src).toContain("report/generated");
  });

  it("calls generateNarrative from lib/communication", () => {
    expect(src).toContain("generateNarrative");
  });

  it("inserts into generatedReports", () => {
    expect(src).toContain("generatedReports");
  });
});

describe("EM-01 dedup guard in weekly-digest-cron", () => {
  const srcPath = resolve(__dirname, "../../../inngest/functions/weekly-digest-cron.ts");
  const src = readFileSync(srcPath, "utf-8");

  it("imports reportDeliverySchedules", () => {
    expect(src).toContain("reportDeliverySchedules");
  });

  it("builds skipBrandIds set for Phase 2 weekly schedules", () => {
    expect(src).toContain("skipBrandIds");
  });

  it("checks for active weekly frequency", () => {
    expect(src).toContain('"weekly"');
    expect(src).toContain("isActive");
  });

  it("filters brands with active Phase 2 schedules", () => {
    expect(src).toContain("skipBrandIds.has");
  });
});
