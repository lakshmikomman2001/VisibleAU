/**
 * S01B part 1 (LLD amendment 49, D-RT4): an Enhanced report's checks run in their own function,
 * `refresh-enhanced-checks`, one per brand and at most one account-wide, and never in POST_AUDIT_POOL -- so a refresh
 * (up to five minutes) no longer holds every workspace's post-audit jobs.
 *
 * Inngest's scheduler can't run locally (tests/unit/inngest/post-audit-concurrency.test.ts says the same), so this reads
 * each function's real `concurrency` option and admits runs the way Inngest documents it: each constraint's key is
 * evaluated for the event (a quoted string is a fixed key; `event.data.x` the event's value), `scope` defaults to the
 * function, and a run starts only when every one of its keys has a free slot.
 */
import { beforeAll, describe, expect, it } from "vitest";

interface Constraint {
  key?: string;
  limit: number;
  scope?: "fn" | "env" | "account";
}

interface Run {
  fnId: string;
  concurrency: Constraint | Constraint[];
  data: Record<string, unknown>;
}

function slotKeys(run: Run): Array<{ key: string; limit: number }> {
  const list = Array.isArray(run.concurrency) ? run.concurrency : [run.concurrency];
  return list.map((c) => {
    let value = "";
    if (c.key?.startsWith('"')) value = JSON.parse(c.key) as string;
    else if (c.key?.startsWith("event.data."))
      value = String(run.data[c.key.slice("event.data.".length)]);
    else if (c.key) throw new Error(`unknown key expression ${c.key}`);
    const scope = c.scope ?? "fn";
    return { key: `${scope === "fn" ? run.fnId : scope}:${c.key ?? ""}=${value}`, limit: c.limit };
  });
}

/** Which of these runs, queued in this order, are running at once (none has finished yet). */
function runningTogether(runs: Run[]): number[] {
  const used = new Map<string, number>();
  const started: number[] = [];
  runs.forEach((run, i) => {
    const keys = slotKeys(run);
    if (keys.every((k) => (used.get(k.key) ?? 0) < k.limit)) {
      for (const k of keys) used.set(k.key, (used.get(k.key) ?? 0) + 1);
      started.push(i);
    }
  });
  return started;
}

async function load() {
  const { refreshEnhancedChecksFn, ENHANCED_CHECKS_CONCURRENCY } = await import(
    "@/inngest/functions/refresh-enhanced-checks"
  );
  const { generateNarrativeReport } = await import("@/inngest/functions/generate-narrative-report");
  const { POST_AUDIT_POOL } = await import("@/lib/inngest/concurrency");
  const opts = (fn: unknown) =>
    (fn as { opts: { id: string; concurrency: Run["concurrency"] } }).opts;
  const refresh = (brandId: string): Run => ({
    fnId: opts(refreshEnhancedChecksFn).id,
    concurrency: opts(refreshEnhancedChecksFn).concurrency,
    data: { brandId, reportId: `report-${brandId}` },
  });
  const postAudit = (brandId: string): Run => ({
    fnId: opts(generateNarrativeReport).id,
    concurrency: opts(generateNarrativeReport).concurrency,
    data: { brandId },
  });
  return {
    refreshEnhancedChecksFn,
    ENHANCED_CHECKS_CONCURRENCY,
    POST_AUDIT_POOL,
    opts,
    refresh,
    postAudit,
  };
}

describe("refresh-enhanced-checks: its concurrency", () => {
  // The first load imports the Inngest functions, which can outlast a test's 5 s beside a heavy run; pay for it here.
  beforeAll(async () => {
    await load();
  }, 60_000);

  // S01B part 6a, LLD amendment 49 (revised 25 Nov): "S01B moves it into its own function refresh-enhanced-checks, one
  // per brand and at most 1 account-wide" (it was 2): the account-wide expectations below change with it.
  it("is one per brand and at most one account-wide, and none of its keys is POST_AUDIT_POOL's", async () => {
    const { refreshEnhancedChecksFn, ENHANCED_CHECKS_CONCURRENCY, POST_AUDIT_POOL, opts } =
      await load();
    expect(opts(refreshEnhancedChecksFn).id).toBe("refresh-enhanced-checks");
    expect(opts(refreshEnhancedChecksFn).concurrency).toBe(ENHANCED_CHECKS_CONCURRENCY);
    expect(ENHANCED_CHECKS_CONCURRENCY).toEqual([
      { key: "event.data.brandId", limit: 1 },
      { scope: "account", key: '"enhanced-checks"', limit: 1 },
    ]);
    expect(ENHANCED_CHECKS_CONCURRENCY.map((c) => c.key)).not.toContain(POST_AUDIT_POOL.key);
  });

  it("two Enhanced reports for one brand: one refresh at a time (the second waits, then finds the checks fresh)", async () => {
    const { refresh } = await load();
    expect(runningTogether([refresh("brand-a"), refresh("brand-a")])).toEqual([0]);
  });

  it("brand A's refresh waits for brand B's (one account-wide); A's generator doesn't (the integration test)", async () => {
    const { refresh } = await load();
    expect(runningTogether([refresh("brand-b"), refresh("brand-a")])).toEqual([0]);
  });

  it("at most one refresh runs account-wide", async () => {
    const { refresh } = await load();
    expect(runningTogether([refresh("a"), refresh("b"), refresh("c")])).toEqual([0]);
  });

  it("while refreshes run, a post-audit job in POST_AUDIT_POOL starts without waiting (and the other way round)", async () => {
    const { refresh, postAudit } = await load();
    expect(runningTogether([refresh("a"), refresh("b"), postAudit("c")])).toEqual([0, 2]);
    // The pool full (its limit is 1): a refresh still starts.
    expect(runningTogether([postAudit("c"), refresh("a")])).toEqual([0, 1]);
    // Before S01B the refresh was a step of the generator, so a second post-audit job waited for it.
    expect(runningTogether([postAudit("a"), postAudit("c")])).toEqual([0]);
  });
});
