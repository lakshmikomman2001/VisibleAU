/**
 * Mock-gate and retention follow-ups (Sri, 2 Nov), part 2 -- every retention claim is true today, and every period
 * the code enforces lives in lib/governance/residency-config.ts:
 * - the Data Residency rows state a period only where a job deletes by it (audit data 12 months, crawler logs and
 *   referral hits 90 days, the answer cache once it expires); the rest say they're kept until the customer asks.
 *   It used to claim 12 months for the evidence archive and 30 days for the answer cache, which nothing deleted,
 *   and "duration of account" for data a closed workspace keeps;
 * - no copy anywhere states a retention period of its own (the landing page said "Prompt data deleted within
 *   24h"), and no job deletes by a period written into it.
 */
import { describe, expect, it } from "vitest";
import {
  AI_REFERRAL_HIT_RETENTION_DAYS,
  ANSWER_CACHE_REUSE_HOURS,
  AUDIT_DATA_RETENTION_MONTHS,
  CRAWLER_LOG_RETENTION_DAYS,
  RESIDENCY_CONFIG,
} from "@/lib/governance/residency-config";
import { NON_TEST_ROOTS, sourceFiles } from "../../helpers/source-files";

const retention = (dataType: string) =>
  RESIDENCY_CONFIG.find((e) => e.dataType === dataType)?.retentionPeriod ?? "";
const PERIOD = /\b\d+\s*(hours?|days?|weeks?|months?|years?)\b/i;

describe("the Data Residency rows state only periods the code enforces", () => {
  it("a period only where a job deletes by it, from the job's own constant", () => {
    expect(retention("audit_data")).toBe(
      `Deleted ${AUDIT_DATA_RETENTION_MONTHS} months after the audit`,
    );
    expect(retention("crawler_logs")).toBe(`${CRAWLER_LOG_RETENTION_DAYS} days`);
    expect(retention("ai_referral_hits")).toBe(`${AI_REFERRAL_HIT_RETENTION_DAYS} days`);
    expect(retention("llm_cache")).toBe(
      `Reused for at most ${ANSWER_CACHE_REUSE_HOURS.memoryOnly} hours, then deleted by the weekly clean-up`,
    );
  });

  it("nothing deletes the evidence archive, PDF reports or a closed workspace's data: kept until asked, no period", () => {
    for (const dataType of ["evidence_snapshots", "pdf_reports", "database"]) {
      expect(retention(dataType), dataType).toMatch(/^Kept until you ask us to delete (it|them)/);
      expect(retention(dataType), dataType).not.toMatch(PERIOD);
    }
  });

  it("no row claims 12 months except audit data, and none claims 30 days or the life of the account", () => {
    const twelve = RESIDENCY_CONFIG.filter((e) => /12 months/.test(e.retentionPeriod));
    expect(twelve.map((e) => e.dataType)).toEqual(["audit_data"]);
    for (const e of RESIDENCY_CONFIG) {
      expect(e.retentionPeriod, e.dataType).not.toMatch(/30 days|duration of account/i);
    }
  });
});

describe("no retention period written anywhere but residency-config", () => {
  const files = sourceFiles(NON_TEST_ROOTS).filter(
    (f) => f.path !== "lib/governance/residency-config.ts",
  );
  const COMMENT = /^\s*(\/\/|\*|\/\*|\{\/\*)/;

  it("no copy states a retention period of its own (a number of hours, days, months... next to kept or deleted)", () => {
    // Prose ("deleted within 24h", "90 days of retention") and config-like literals (retentionPeriod: "12 months").
    const CLAIM =
      /\b(kept|keep|keeps|retain(ed|s)?|retention|deleted|deletes|purged|removed|erased)\b[^.\n{}<>]{0,60}?\b\d+\s*(hours?|h|days?|weeks?|months?|years?)\b|\b\d+\s*(hours?|h|days?|weeks?|months?|years?)\b[^.\n{}<>]{0,30}?\b(retention|retained|kept)\b|retention\w*\s*[:=]\s*["'`][^"'`]*\b\d+\s*(hours?|days?|weeks?|months?|years?)\b/i;
    const offenders = files.flatMap((f) =>
      f.text
        .split("\n")
        .map((line, i) => ({ line, at: `${f.path}:${i + 1}` }))
        .filter(({ line }) => !COMMENT.test(line) && CLAIM.test(line))
        .map(({ at, line }) => `${at}  ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });

  it("no job deletes by a period written into it", () => {
    // A cutoff in the past: now minus a literal. (An expiry in the future, such as an invite link's, isn't one.)
    const CUTOFF =
      /Date\.now\(\)\s*-\s*\d|set(Date|Month|FullYear|Hours)\([^)]*-\s*\d|INTERVAL\s*'\d+\s*(hours?|days?|weeks?|months?|years?)'|-\s*\(?\d+\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000\b/i;
    const deleters = files.filter((f) => /\.delete\(|DELETE FROM|\.remove\(/i.test(f.text));
    const offenders = deleters.flatMap((f) =>
      f.text
        .split("\n")
        .map((line, i) => ({ line, at: `${f.path}:${i + 1}` }))
        .filter(({ line }) => !COMMENT.test(line) && CUTOFF.test(line))
        .map(({ at, line }) => `${at}  ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});
