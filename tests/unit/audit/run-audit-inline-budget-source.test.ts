/**
 * "Audits time out on Vercel" follow-up, item 4 -- lib/audit/run-
 * audit-inline.ts runs inside app/api/audits/route.ts's own request
 * (maxDuration, vercel.json). Two source-level checks that are hard
 * to prove any other way:
 *
 * 1. The route now wraps both fire-and-forget calls in after() --
 *    without it, Vercel's own docs describe waitUntil()/after() as
 *    exactly what "extends the lifetime of the request handler" for
 *    un-awaited work, meaning a bare, un-awaited call was never
 *    guaranteed the request's own maxDuration at all. A live
 *    integration test can't observe Vercel's real post-response
 *    behaviour (vitest has no such lifecycle to begin with) -- this
 *    is the one way to pin the fix in place.
 * 2. The real (non-sample) audit path now passes an explicit
 *    deadlineAt, the same INNGEST_STEP_BUDGET_MS-derived budget the
 *    Inngest path's own per-call deadline uses -- previously only the
 *    sample-audit caller ever passed one.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("app/api/audits/route.ts keeps the inline fallback runner alive for its own maxDuration", () => {
  const src = readFileSync("app/api/audits/route.ts", "utf8");

  it("imports after from next/server", () => {
    expect(src).toMatch(/import\s*\{[^}]*\bafter\b[^}]*\}\s*from\s*"next\/server"/);
  });

  it("wraps runAuditInline's fire-and-forget call in after()", () => {
    const afterIdx = src.indexOf("after(() =>");
    const runAuditInlineIdx = src.indexOf("runAuditInline(auditId,");
    expect(afterIdx).toBeGreaterThan(-1);
    expect(runAuditInlineIdx).toBeGreaterThan(afterIdx);
  });

  it("wraps runTechnicalAuditInline's fire-and-forget call in after() too", () => {
    const occurrences = [...src.matchAll(/after\(\(\) =>/g)];
    // Once for runAuditInline, once for runTechnicalAuditInline.
    expect(occurrences.length).toBe(2);
  });

  it("passes an explicit deadlineAt to the real (non-sample) runAuditInline call -- previously only the sample-audit caller did", () => {
    expect(src).toMatch(/deadlineAt\s*=\s*Date\.now\(\)\s*\+\s*INNGEST_STEP_BUDGET_MS/);
    expect(src).toMatch(/runAuditInline\(auditId,\s*\{\s*deadlineAt\s*\}\)/);
  });
});

describe("lib/audit/run-audit-inline.ts defaults to bounded, per-engine concurrency", () => {
  const src = readFileSync("lib/audit/run-audit-inline.ts", "utf8");

  it("imports ENGINE_CALL_CONCURRENCY from the shared concurrency-limit module", () => {
    expect(src).toMatch(
      /import\s*\{[^}]*\bENGINE_CALL_CONCURRENCY\b[^}]*\}\s*from\s*"@\/lib\/audit\/concurrency-limit"/,
    );
  });

  it("creates a fresh per-engine pLimit(ENGINE_CALL_CONCURRENCY) when no explicit concurrencyLimit override is given", () => {
    expect(src).toMatch(/pLimit\(ENGINE_CALL_CONCURRENCY\)/);
  });

  it("still honours an explicit concurrencyLimit override as ONE limiter shared across every engine -- the sample-audit caller's existing behaviour is unchanged", () => {
    expect(src).toMatch(/opts\?\.concurrencyLimit\s*!==\s*undefined\s*\?\s*pLimit\(opts\.concurrencyLimit\)/);
  });
});
