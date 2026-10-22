/**
 * "Inngest: fit within the 5 concurrent steps of the free plan",
 * items 1 -- config-level checks for every function this task
 * touches. Inngest's own `concurrency`/`priority` options only take
 * effect after a Resync (there is no local way to exercise the real
 * Inngest scheduler's queueing behaviour against the account's
 * actual 5-slot ceiling), so these are source/config assertions,
 * not live-queueing proof.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// A few of these files' own doc comments mention the OLD concurrency:
// { limit: N } value they replaced, in prose explaining why -- strip
// comments before checking for a real, live leftover (same heuristic
// as tests/unit/scoring/no-stored-position-read.test.ts).
function stripComments(source: string): string {
  const noBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  return noBlockComments.replace(/(^|\s)\/\/.*$/gm, "$1");
}

// The full graph reachable from audit.complete (confirmed by
// following every inngest.send/step.sendEvent transitively): 13
// functions triggered directly by audit.complete, plus
// build-citation-source-intelligence (citations/classified, from
// classify-citation-sources), generate-narrative-report (trend/
// aggregated, from aggregate-visibility-trend), render-report-pdf
// (report/generated, from generate-narrative-report), and
// deliver-webhook (webhook.deliver, from fanout-webhooks) -- 17 total.
const POST_AUDIT_FUNCTION_FILES = [
  "inngest/functions/aggregate-visibility-trend.ts",
  "inngest/functions/calculate-share-of-voice.ts",
  "inngest/functions/calculate-topical-gaps.ts",
  "inngest/functions/capture-evidence-snapshot.ts",
  "inngest/functions/classify-citation-sources.ts",
  "inngest/functions/detect-drift.ts",
  "inngest/functions/detect-hallucinations.ts",
  "inngest/functions/fanout-webhooks.ts",
  "inngest/functions/ga4-push.ts",
  "inngest/functions/generate-recommendations.ts",
  "inngest/functions/run-comparison-prompts.ts",
  "inngest/functions/send-audit-complete-email.ts",
  "inngest/functions/simulate-query-fan-out.ts",
  "inngest/functions/build-citation-source-intelligence.ts",
  "inngest/functions/generate-narrative-report.ts",
  "inngest/functions/render-report-pdf.ts",
  "inngest/functions/deliver-webhook.ts",
];

describe("every function reachable from audit.complete shares the ONE post-audit concurrency pool", () => {
  for (const file of POST_AUDIT_FUNCTION_FILES) {
    it(`${file} imports and uses POST_AUDIT_POOL as its concurrency config`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toMatch(
        /import\s*\{[^}]*\bPOST_AUDIT_POOL\b[^}]*\}\s*from\s*"@\/lib\/inngest\/concurrency"/,
      );
      expect(src).toMatch(/concurrency:\s*POST_AUDIT_POOL/);
      // No leftover independent fn-scoped limit alongside it -- a few
      // of these (run-comparison-prompts, simulate-query-fan-out,
      // render-report-pdf) had their own concurrency: { limit: N }
      // before this follow-up; it must be fully replaced, not
      // stacked, so the shared pool is genuinely the only constraint.
      const code = stripComments(src);
      expect(code).not.toMatch(/concurrency:\s*\{\s*limit:\s*\d/);
    });
  }
});

describe("lib/inngest/concurrency.ts's POST_AUDIT_POOL", () => {
  it("is account-scoped with a fixed string key, so every function above draws from the SAME bucket", async () => {
    const { POST_AUDIT_POOL } = await import("@/lib/inngest/concurrency");
    expect(POST_AUDIT_POOL.scope).toBe("account");
    expect(POST_AUDIT_POOL.key).toBe('"post-audit-pool"');
  });

  it("its limit is the same ACCOUNT_CONCURRENCY_HEADROOM_SLOTS run-audit's own per-engine formula reserves -- the two can't silently drift apart", async () => {
    const { POST_AUDIT_POOL } = await import("@/lib/inngest/concurrency");
    const { ACCOUNT_CONCURRENCY_HEADROOM_SLOTS } = await import("@/lib/audit/concurrency-limit");
    expect(POST_AUDIT_POOL.limit).toBe(ACCOUNT_CONCURRENCY_HEADROOM_SLOTS);
  });
});

describe("inngest/functions/run-audit.ts has its own org-keyed function-level concurrency", () => {
  const src = readFileSync("inngest/functions/run-audit.ts", "utf8");

  it("sets concurrency with key: event.data.organizationId (not account/env-scoped -- only this function's own runs should count)", () => {
    expect(src).toMatch(/concurrency:\s*\{/);
    expect(src).toMatch(/key:\s*"event\.data\.organizationId"/);
    expect(src).not.toMatch(/scope:\s*"(account|env)"/);
  });

  it("sizes the limit from deriveEngineCallConcurrency, not a hardcoded number", () => {
    expect(src).toMatch(/deriveEngineCallConcurrency\(MAX_ENGINES_PER_AUDIT\)\s*\*\s*MAX_ENGINES_PER_AUDIT/);
  });

  it("uses the derived per-engine concurrency (not the flat ENGINE_CALL_CONCURRENCY) for each engine's own pLimit", () => {
    expect(src).toMatch(/pLimit\(perEngineConcurrency\)/);
    expect(src).not.toMatch(/pLimit\(ENGINE_CALL_CONCURRENCY\)/);
  });
});

describe("app/api/audits/route.ts sends organizationId on the audit.run event", () => {
  const src = readFileSync("app/api/audits/route.ts", "utf8");

  it("includes organizationId in the event data -- without it, run-audit's concurrency key can't group by org at all", () => {
    const sendIdx = src.indexOf('name: "audit.run"');
    expect(sendIdx).toBeGreaterThan(-1);
    const nextBlock = src.slice(sendIdx, sendIdx + 200);
    expect(nextBlock).toMatch(/organizationId/);
  });
});
