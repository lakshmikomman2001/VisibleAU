import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

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

// Task #46 (10th follow-up): this describe block's 3 tests shell out to a
// real CLI subprocess via execSync. All 3 used to call `npx tsx ...`
// directly -- measured standalone, a single `npx tsx` invocation took
// 4-12s (npx's own resolution/freshness-check overhead, not the CLI's own
// work: the same command via the already-resolved ./node_modules/.bin/tsx
// binary took 1.8s), against a hardcoded 15s execSync timeout. Under a
// full-suite run's CPU/IO contention from every other concurrently
// running test file, that 3-11s of margin could vanish entirely --
// execSync then kills the child with SIGTERM, and the caught error has
// `status: null` (not a different exit code), which is exactly the
// "expected null to be 1" failure this test flickered with. Passing in
// isolation every time was never evidence the test was correct -- it was
// evidence isolation doesn't reproduce the contention. `npx --no-install`
// skips that resolution/freshness check (tsx is already a resolved local
// devDependency; nothing to check), bringing a cold invocation down to a
// stable 3-4s -- most of the lost margin back, without the platform risk
// of hardcoding a .bin path that behaves differently under cmd.exe vs a
// POSIX shell. The 15s execSync timeout is also raised to 25s (under the
// unchanged 30s test timeout) as defence in depth.
const CLI_EXEC_TIMEOUT_MS = 25000;

describe("Part A: CLI real invocation — config:validate against dev DB", () => {
  it("config:validate runs and exits non-zero (dev DB missing sampling_policy + active bundle)", {
    timeout: 30000,
  }, () => {
    const DB_URL = "postgresql://postgres:password@localhost:5432/visibleau";
    try {
      execSync(`npx --no-install tsx cli/visibleau/index.ts config:validate --market AU_EN --locale en-AU`, {
        cwd: ROOT,
        env: { ...process.env, DATABASE_URL: DB_URL },
        stdio: "pipe",
        timeout: CLI_EXEC_TIMEOUT_MS,
      });
      // If it reaches here, exit code was 0 — unexpected
      expect.unreachable("expected non-zero exit (missing sampling policy + active bundle)");
    } catch (err: unknown) {
      const e = err as { status: number; stderr: Buffer; stdout: Buffer };
      expect(e.status).toBe(1);
      const output = (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? "");
      expect(output).toContain("validation failure");
    }
  });

  it("config:validate prints check results (providers pass, sampling policy fails)", {
    timeout: 30000,
  }, () => {
    const DB_URL = "postgresql://postgres:password@localhost:5432/visibleau";
    try {
      execSync(`npx --no-install tsx cli/visibleau/index.ts config:validate --market AU_EN --locale en-AU`, {
        cwd: ROOT,
        env: { ...process.env, DATABASE_URL: DB_URL },
        stdio: "pipe",
        timeout: CLI_EXEC_TIMEOUT_MS,
      });
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
      execSync(`npx --no-install tsx cli/visibleau/index.ts config:validate --market XX_XX --locale xx-XX`, {
        cwd: ROOT,
        env: { ...process.env, DATABASE_URL: DB_URL },
        stdio: "pipe",
        timeout: CLI_EXEC_TIMEOUT_MS,
      });
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
  const runAuditSource = readFileSync(resolve(ROOT, "lib/audit/run-audit-inline.ts"), "utf-8");

  it("RESOLVED: audit runner is lib/audit/run-audit-inline.ts (NOT runner.ts or run-audit.ts)", () => {
    expect(existsSync(resolve(ROOT, "lib/audit/run-audit-inline.ts"))).toBe(true);
    expect(existsSync(resolve(ROOT, "lib/audit/runner.ts"))).toBe(false);
    // There is no separate run-audit.ts — the Inngest function wraps run-audit-inline
  });

  it("imports BudgetPolicyService", () => {
    // "Make the daily spend cap real" follow-up: this import line now
    // also brings in DailySpendCapExceededError -- a regex (not an
    // exact-string match) so this stays true regardless of what else
    // that line imports alongside BudgetPolicyService.
    expect(runAuditSource).toMatch(
      /import\s*\{[^}]*\bBudgetPolicyService\b[^}]*\}\s*from\s*"@\/lib\/platform\/budget-policy\.service"/,
    );
  });

  it("calls BudgetPolicyService.estimate() BEFORE the LLM loop", () => {
    const estimateIdx = runAuditSource.indexOf("BudgetPolicyService.estimate(");
    const totalCostIdx = runAuditSource.indexOf("let costTally = EMPTY_COST_TALLY");
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
  const runAuditSource = readFileSync(resolve(ROOT, "lib/audit/run-audit-inline.ts"), "utf-8");

  // Vunnara (19 Oct, post-aa83b3a): compositeVisibilityScore was
  // deleted along with the weighted composite ("the headline is the
  // mention rate") -- `const headline = freqScore` is its direct
  // replacement at the same spot in the scoring sequence, so the
  // ordering check this test exists for still holds.
  it("calls BudgetPolicyService.record() after scoring the headline", () => {
    const headlineIdx = runAuditSource.indexOf("const headline = freqScore");
    const recordIdx = runAuditSource.indexOf("BudgetPolicyService.record(");
    expect(headlineIdx).toBeGreaterThan(0);
    expect(recordIdx).toBeGreaterThan(headlineIdx);
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

  it("record() passes auditId and the run's cost tally", () => {
    expect(runAuditSource).toContain(
      'BudgetPolicyService.record(auditId, costTally.knownUsd, "audit", capReserve)',
    );
  });

  it("evaluate() passes auditId", () => {
    expect(runAuditSource).toContain("QualityGateService.evaluate(auditId)");
  });
});

describe("Audit reliability Part C, item 5: BudgetPolicyService.record() has no sample-org skip", () => {
  const recordSource = readFileSync(
    resolve(ROOT, "lib/platform/budget-policy.service.ts"),
    "utf-8",
  );
  const recordBody = recordSource.slice(
    recordSource.indexOf("static async record("),
    recordSource.indexOf("static getPhase2CostTarget("),
  );

  // Superseded: the old "D-03, O-03" skip compared org.slug === "sample",
  // but the real sample org's slug is "__sample__" (lib/sample-audit/
  // synthetic-org.ts) -- that check never once matched, so sample audit
  // costs were ALREADY being recorded. Removed outright rather than
  // "corrected" to the real slug, because lib/sample-audit/daily-cap.ts's
  // SAMPLE_AUDIT_DAILY_SPEND_CAP_CENTS guard depends on exactly that.
  it("no longer has a dead org.slug==='sample' check, or any organizations lookup, inside record()", () => {
    expect(recordBody).not.toContain('org?.slug === "sample"');
    expect(recordBody).not.toMatch(/organizations\.slug/);
  });

  it("documents, at record(), why sample-org costs are deliberately never skipped", () => {
    expect(recordBody).toMatch(/SAMPLE_AUDIT_DAILY_SPEND_CAP_CENTS/);
  });

  it("returns early when audit not found", () => {
    const notFoundIdx = recordBody.indexOf("if (!audit) return;");
    expect(notFoundIdx).toBeGreaterThan(0);
  });
});

describe("Part B2: QualityGateService.evaluate() writes quality_status", () => {
  const qgSource = readFileSync(resolve(ROOT, "lib/platform/quality-gate.service.ts"), "utf-8");

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
  const serveSource = readFileSync(resolve(ROOT, "app/api/webhooks/inngest/route.ts"), "utf-8");

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
