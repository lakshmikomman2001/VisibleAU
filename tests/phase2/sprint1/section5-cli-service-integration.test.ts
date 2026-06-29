import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";

const ROOT = resolve(__dirname, "../../..");

// ──────────────────────────────────────────────────────
// PART A — Config Validation CLI (§7)
// ──────────────────────────────────────────────────────

describe("Part A: CLI handlers exist and route correctly", () => {
  const indexSource = readFileSync(resolve(ROOT, "cli/visibleau/index.ts"), "utf-8");

  it("cli/visibleau/index.ts exists", () => {
    expect(existsSync(resolve(ROOT, "cli/visibleau/index.ts"))).toBe(true);
  });

  it("routes config:validate to config-validate module", () => {
    expect(indexSource).toContain('"config:validate"');
    expect(indexSource).toContain("./config-validate");
  });

  it("routes config:coverage to config-coverage module", () => {
    expect(indexSource).toContain('"config:coverage"');
    expect(indexSource).toContain("./config-coverage");
  });

  it("routes config:diff to config-diff module", () => {
    expect(indexSource).toContain('"config:diff"');
    expect(indexSource).toContain("./config-diff");
  });

  it("exits non-zero on unknown command", () => {
    expect(indexSource).toContain("process.exit(1)");
  });

  it("package.json has 'visibleau' script entry pointing to cli/visibleau/index.ts", () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8"));
    expect(pkg.scripts.visibleau).toContain("cli/visibleau/index.ts");
  });
});

describe("Part A: config:validate checks all 5 items (source verification)", () => {
  const validateSource = readFileSync(resolve(ROOT, "cli/visibleau/config-validate.ts"), "utf-8");

  it("exports a run() function", () => {
    expect(validateSource).toContain("export async function run()");
  });

  it("checks for active config bundle (configBundleCache + isActive)", () => {
    expect(validateSource).toContain("configBundleCache");
    expect(validateSource).toContain("isActive");
  });

  it("checks for enabled providers (providerMarketCapabilities + isEnabled)", () => {
    expect(validateSource).toContain("providerMarketCapabilities");
    expect(validateSource).toContain("isEnabled");
  });

  it("checks for budget policy (marketAiBudgetPolicies)", () => {
    expect(validateSource).toContain("marketAiBudgetPolicies");
  });

  it("checks for sampling policy (samplingPolicies)", () => {
    expect(validateSource).toContain("samplingPolicies");
  });

  it("checks for prompt pack coverage (promptPackCoverage)", () => {
    expect(validateSource).toContain("promptPackCoverage");
  });

  it("exits non-zero on failure (process.exit(1))", () => {
    expect(validateSource).toContain("process.exit(1)");
  });

  it("accepts --market and --locale args", () => {
    expect(validateSource).toContain("--market");
    expect(validateSource).toContain("--locale");
  });
});

describe("Part A: config:coverage checks all markets (source verification)", () => {
  const coverageSource = readFileSync(resolve(ROOT, "cli/visibleau/config-coverage.ts"), "utf-8");

  it("exports a run() function", () => {
    expect(coverageSource).toContain("export async function run()");
  });

  it("groups by market and checks provider capabilities", () => {
    expect(coverageSource).toContain("supportsWebRetrieval");
    expect(coverageSource).toContain("supportsCitations");
    expect(coverageSource).toContain("supportsLocationContext");
    expect(coverageSource).toContain("supportsQueryFanOut");
  });

  it("exits non-zero when coverage insufficient", () => {
    expect(coverageSource).toContain("process.exit(1)");
  });
});

describe("Part A: config:diff compares bundle versions (source verification)", () => {
  const diffSource = readFileSync(resolve(ROOT, "cli/visibleau/config-diff.ts"), "utf-8");

  it("exports a run() function", () => {
    expect(diffSource).toContain("export async function run()");
  });

  it("accepts --from and --to and --market args", () => {
    expect(diffSource).toContain("--from");
    expect(diffSource).toContain("--to");
    expect(diffSource).toContain("--market");
  });

  it("compares by configDigest", () => {
    expect(diffSource).toContain("configDigest");
  });

  it("diffs resolvedConfig keys", () => {
    expect(diffSource).toContain("resolvedConfig");
  });

  it("exits non-zero when a version is not found", () => {
    expect(diffSource).toContain("process.exit(1)");
  });
});

describe("Part A: CLI real invocation — config:validate against dev DB", () => {
  it("config:validate runs and exits non-zero (dev DB missing sampling_policy + active bundle)", { timeout: 30000 }, () => {
    const DB_URL = "postgresql://postgres:password@localhost:5432/visibleau";
    try {
      execSync(
        `npx tsx cli/visibleau/index.ts config:validate --market AU_EN --locale en-AU`,
        {
          cwd: ROOT,
          env: { ...process.env, DATABASE_URL: DB_URL },
          stdio: "pipe",
          timeout: 15000,
        },
      );
      // If it reaches here, exit code was 0 — unexpected
      expect.unreachable("expected non-zero exit (missing sampling policy + active bundle)");
    } catch (err: unknown) {
      const e = err as { status: number; stderr: Buffer; stdout: Buffer };
      expect(e.status).toBe(1);
      const output = (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? "");
      expect(output).toContain("validation failure");
    }
  });

  it("config:validate prints check results (providers pass, sampling policy fails)", { timeout: 30000 }, () => {
    const DB_URL = "postgresql://postgres:password@localhost:5432/visibleau";
    try {
      execSync(
        `npx tsx cli/visibleau/index.ts config:validate --market AU_EN --locale en-AU`,
        {
          cwd: ROOT,
          env: { ...process.env, DATABASE_URL: DB_URL },
          stdio: "pipe",
          timeout: 15000,
        },
      );
    } catch (err: unknown) {
      const e = err as { stdout: Buffer; stderr: Buffer };
      const stdout = e.stdout?.toString() ?? "";
      const stderr = e.stderr?.toString() ?? "";
      const output = stdout + stderr;
      expect(output).toContain("Enabled providers");
      expect(output).toContain("Budget policy found");
    }
  });

  it("config:validate with unknown market → all checks fail", { timeout: 30000 }, () => {
    const DB_URL = "postgresql://postgres:password@localhost:5432/visibleau";
    try {
      execSync(
        `npx tsx cli/visibleau/index.ts config:validate --market XX_XX --locale xx-XX`,
        {
          cwd: ROOT,
          env: { ...process.env, DATABASE_URL: DB_URL },
          stdio: "pipe",
          timeout: 15000,
        },
      );
      expect.unreachable("expected non-zero exit");
    } catch (err: unknown) {
      const e = err as { status: number; stderr: Buffer; stdout: Buffer };
      expect(e.status).toBe(1);
    }
  });
});

describe("Part A: CI wiring check (§7 — LLD 5082)", () => {
  it("config:validate step is parked (commented) in CI workflow with TODO", () => {
    const ciYml = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf-8");
    expect(ciYml).toContain("TODO(phase2)");
    expect(ciYml).toContain("# - name: Validate Phase 2 config");
    expect(ciYml).toContain("#   run: pnpm visibleau config:validate");
  });

  it("parked step is in the test job (has DB access for activation)", () => {
    const ciYml = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf-8");
    const testJobIdx = ciYml.indexOf("name: Unit + Integration tests");
    const nextJobIdx = ciYml.indexOf("\n  e2e:", testJobIdx);
    const testJobBlock = ciYml.substring(testJobIdx, nextJobIdx);
    expect(testJobBlock).toContain("config:validate");
  });

  it("parked step is NOT active (won't fail CI)", () => {
    const ciYml = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf-8");
    const lines = ciYml.split("\n");
    const validateLines = lines.filter((l) => l.includes("config:validate"));
    for (const line of validateLines) {
      expect(line.trimStart().startsWith("#")).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────────────
// PART B — Service Integration into Phase 1 audit flow
// ──────────────────────────────────────────────────────

describe("Part B1: Pre-flight estimate + hard-stop wiring", () => {
  const runAuditSource = readFileSync(
    resolve(ROOT, "lib/audit/run-audit-inline.ts"),
    "utf-8",
  );

  it("RESOLVED: audit runner is lib/audit/run-audit-inline.ts (NOT runner.ts or run-audit.ts)", () => {
    expect(existsSync(resolve(ROOT, "lib/audit/run-audit-inline.ts"))).toBe(true);
    expect(existsSync(resolve(ROOT, "lib/audit/runner.ts"))).toBe(false);
    // There is no separate run-audit.ts — the Inngest function wraps run-audit-inline
  });

  it("imports BudgetPolicyService", () => {
    expect(runAuditSource).toContain(
      'import { BudgetPolicyService } from "@/lib/platform/budget-policy.service"',
    );
  });

  it("calls BudgetPolicyService.estimate() BEFORE the LLM loop", () => {
    const estimateIdx = runAuditSource.indexOf("BudgetPolicyService.estimate(");
    const totalCostIdx = runAuditSource.indexOf("let totalCost = 0");
    expect(estimateIdx).toBeGreaterThan(0);
    expect(totalCostIdx).toBeGreaterThan(estimateIdx);
  });

  it("calls BudgetPolicyService.enforce() after estimate", () => {
    const estimateIdx = runAuditSource.indexOf("BudgetPolicyService.estimate(");
    const enforceIdx = runAuditSource.indexOf("BudgetPolicyService.enforce(");
    expect(enforceIdx).toBeGreaterThan(estimateIdx);
  });

  it("hard-stop: throws 'Budget exceeded' when !enforcement.allowed", () => {
    expect(runAuditSource).toContain('throw new Error("Budget exceeded")');
    expect(runAuditSource).toContain("if (!enforcement.allowed)");
  });

  it("re-throws 'Budget exceeded' but swallows other budget errors (non-fatal)", () => {
    expect(runAuditSource).toContain('budgetErr.message === "Budget exceeded"');
    expect(runAuditSource).toContain("throw budgetErr");
    expect(runAuditSource).toContain("budget estimate failed (non-fatal)");
  });

  it("stores estimatedCostCents on the audit row", () => {
    expect(runAuditSource).toContain("estimatedCostCents: estimate.estimatedCostCents");
  });

  it("passes hardStopOnBudget: true to enforce()", () => {
    expect(runAuditSource).toContain("hardStopOnBudget: true");
  });
});

describe("Part B2: Post-scoring record() + evaluate() wiring", () => {
  const runAuditSource = readFileSync(
    resolve(ROOT, "lib/audit/run-audit-inline.ts"),
    "utf-8",
  );

  it("calls BudgetPolicyService.record() after compositeVisibilityScore", () => {
    const compositeIdx = runAuditSource.indexOf("compositeVisibilityScore(");
    const recordIdx = runAuditSource.indexOf("BudgetPolicyService.record(");
    expect(compositeIdx).toBeGreaterThan(0);
    expect(recordIdx).toBeGreaterThan(compositeIdx);
  });

  it("calls QualityGateService.evaluate() after record()", () => {
    const recordIdx = runAuditSource.indexOf("BudgetPolicyService.record(");
    const evaluateIdx = runAuditSource.indexOf("QualityGateService.evaluate(");
    expect(evaluateIdx).toBeGreaterThan(recordIdx);
  });

  it("record() is wrapped in try-catch (non-fatal)", () => {
    const recordLine = runAuditSource.indexOf("BudgetPolicyService.record(");
    const precedingContext = runAuditSource.substring(recordLine - 100, recordLine);
    expect(precedingContext).toContain("try");
    // Verify the catch logs but doesn't throw
    const afterRecord = runAuditSource.substring(recordLine, recordLine + 200);
    expect(afterRecord).toContain("cost snapshot record failed (non-fatal)");
  });

  it("evaluate() is wrapped in try-catch (non-fatal)", () => {
    const evaluateLine = runAuditSource.indexOf("QualityGateService.evaluate(");
    const precedingContext = runAuditSource.substring(evaluateLine - 100, evaluateLine);
    expect(precedingContext).toContain("try");
    const afterEvaluate = runAuditSource.substring(evaluateLine, evaluateLine + 200);
    expect(afterEvaluate).toContain("quality gate evaluation failed (non-fatal)");
  });

  it("record() passes auditId and totalCost", () => {
    expect(runAuditSource).toContain("BudgetPolicyService.record(auditId, totalCost)");
  });

  it("evaluate() passes auditId", () => {
    expect(runAuditSource).toContain("QualityGateService.evaluate(auditId)");
  });
});

describe("Part B2: BudgetPolicyService.record() sample-org skip", () => {
  const recordSource = readFileSync(
    resolve(ROOT, "lib/platform/budget-policy.service.ts"),
    "utf-8",
  );

  it("skips org.slug === 'sample' (D-03, O-03)", () => {
    expect(recordSource).toContain('org?.slug === "sample"');
    expect(recordSource).toContain("return;");
  });

  it("sample-skip happens BEFORE the insert", () => {
    const sampleSkipIdx = recordSource.indexOf('org?.slug === "sample"');
    const insertIdx = recordSource.indexOf("db.insert(auditCostSnapshots)");
    expect(sampleSkipIdx).toBeGreaterThan(0);
    expect(insertIdx).toBeGreaterThan(sampleSkipIdx);
  });

  it("returns early when audit not found", () => {
    const notFoundIdx = recordSource.indexOf("if (!audit) return;");
    expect(notFoundIdx).toBeGreaterThan(0);
  });
});

describe("Part B2: QualityGateService.evaluate() writes quality_status", () => {
  const qgSource = readFileSync(
    resolve(ROOT, "lib/platform/quality-gate.service.ts"),
    "utf-8",
  );

  it("updates audits.qualityStatus via db.update", () => {
    expect(qgSource).toContain(".update(audits)");
    expect(qgSource).toContain("qualityStatus: status");
  });

  it("returns 'pending' when no audit found", () => {
    expect(qgSource).toContain('if (!audit) return "pending"');
  });

  it("returns 'pending' when no quality gates exist", () => {
    expect(qgSource).toContain('if (gates.length === 0) return "pending"');
  });

  it("evaluates all 5 DIMENSION_METRICS", () => {
    expect(qgSource).toContain('"frequency"');
    expect(qgSource).toContain('"sentiment"');
    expect(qgSource).toContain('"accuracy"');
    expect(qgSource).toContain('"position"');
    expect(qgSource).toContain('"context"');
  });

  it("produces 3 possible outcomes: sufficient, insufficient, partial", () => {
    expect(qgSource).toContain('"sufficient"');
    expect(qgSource).toContain('"insufficient"');
    expect(qgSource).toContain('"partial"');
  });
});

describe("Part B3: serve() integrity — no new Inngest functions added in Sprint 1", () => {
  const serveSource = readFileSync(
    resolve(ROOT, "app/api/webhooks/inngest/route.ts"),
    "utf-8",
  );

  it("serve() exists and is called", () => {
    expect(serveSource).toContain("serve(");
  });

  it("no Sprint 1 service functions were registered", () => {
    expect(serveSource).not.toContain("configBundle");
    expect(serveSource).not.toContain("budgetPolicy");
    expect(serveSource).not.toContain("qualityGate");
    expect(serveSource).not.toContain("samplingPolicy");
    expect(serveSource).not.toContain("providerCapability");
    expect(serveSource).not.toContain("configValidate");
  });

  it("existing Phase 1 functions are still registered (15 functions)", () => {
    const expectedFunctions = [
      "auditDataRetention",
      "auditSchedulesCron",
      "bulkReauditOrchestrate",
      "classifyExistingBrands",
      "classifyOnBrandCreate",
      "deliverWebhookFn",
      "detectDriftFn",
      "fanoutWebhooksFn",
      "ga4PushFn",
      "generateRecommendations",
      "localSeoAuditFn",
      "runAudit",
      "sampleAuditCleanup",
      "sendAuditCompleteEmail",
      "weeklyDigestCron",
    ];
    for (const fn of expectedFunctions) {
      expect(serveSource).toContain(fn);
    }
  });

  it("functions array has at least 15 entries (Phase 1 base + Sprint 2 additions)", () => {
    const fnArrayMatch = serveSource.match(/functions:\s*\[([\s\S]*?)\]/);
    expect(fnArrayMatch).toBeDefined();
    const entries = fnArrayMatch![1]
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    expect(entries.length).toBeGreaterThanOrEqual(15);
  });
});
