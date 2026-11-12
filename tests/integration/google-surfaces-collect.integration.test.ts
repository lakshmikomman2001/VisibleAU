/**
 * Google AI surfaces, Phase 1, parts 0 and 2 -- the real pipeline on a real database, with DataForSEO answered
 * by its REAL 11 Nov responses (tests/helpers/dataforseo-recorded.ts; no call leaves the machine) and the four
 * engines by MockLLM. The questions are the sample's own four (two everyday, two naming Omega Services), for
 * a brand set up as Omega was: Norwest NSW, an operator-set postcode of 2153.
 *
 * Proves:
 * - on: run-audit hands over after its four engines (google-surfaces-queue, google-surfaces-dispatch; no
 *   audit-complete-email of its own), collect-google-surfaces records each answer (shown / not shown, links,
 *   Google's own links counted, the verified-mention rule, location, cost) and then sends audit.complete;
 * - "on" doesn't change the core: the four engines' rows and the headline equal an identical audit's with
 *   Google off;
 * - failures don't leak: a provider that can't be reached, a kill switch turned off mid-audit, the cost
 *   ceiling and the daily cap stay in the Google rows, and the audit is complete with the same core numbers;
 * - a billed retry: the provider's real 40401 for a task, posted again and charged again;
 * - env off: no provider call and no Google row, even with every database switch on;
 * - the inline runner hands over too, and says so when the event can't be sent.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import {
  recordedDataForSeoFetch,
  recordedFixture,
  recordedQuestions,
} from "@/tests/helpers/dataforseo-recorded";
import { deleteOrgRows } from "@/tests/helpers/delete-org-rows";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG = randomUUID();
const QUESTIONS = recordedQuestions();
let client: ReturnType<typeof postgres>;
let auditNumber = 0;

type StepLog = { kind: string; id: string; event?: string; data?: Record<string, unknown> }[];
type Handler = (ctx: {
  event: { data: Record<string, unknown> };
  step: unknown;
}) => Promise<unknown>;

function recordingStep(hooks: { beforeSleep?: (id: string) => void } = {}) {
  const log: StepLog = [];
  return {
    log,
    step: {
      run: async (id: string, fn: () => unknown) => {
        log.push({ kind: "run", id });
        return fn();
      },
      sleep: async (id: string) => {
        log.push({ kind: "sleep", id });
        hooks.beforeSleep?.(id);
      },
      sendEvent: async (id: string, payload: { name: string; data: Record<string, unknown> }) => {
        log.push({ kind: "sendEvent", id, event: payload.name, data: payload.data });
        return { ids: [] };
      },
    },
  };
}

async function newAudit(opts: { name?: string } = {}) {
  const brandId = randomUUID();
  const auditId = randomUUID();
  auditNumber++;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, prompt_pack,
      prompt_pack_generator_version, classification_status, classification, categories, audience,
      category_confirmed_at, suburb, state, country, location_mode, location_confirmed_at)
    VALUES (${brandId}, ${ORG}, ${opts.name ?? "Omega Services"}, 'omegaservices.com.au', 'tradies', 'au',
      ARRAY['NSW:Norwest']::text[], ${client.json(QUESTIONS)}, ${PROMPT_GENERATOR_VERSION}, 'complete',
      ${client.json({ category: "trades_plumbing", buyerType: "smb", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })},
      ARRAY['trades_plumbing']::text[], 'households', now(), 'Norwest', 'NSW', 'Australia', 'fixed', now())
  `;
  await client`INSERT INTO brand_google_locations (brand_id, organization_id, postcode) VALUES (${brandId}, ${ORG}, '2153')`;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, metadata)
    VALUES (${auditId}, ${brandId}, ${ORG}, ${auditNumber}, 'manual', 'pending', ${client.json({ mockScenario: "happy_path" })})
  `;
  return { brandId, auditId };
}

async function runInngestAudit(auditId: string) {
  const { runAudit } = await import("@/inngest/functions/run-audit");
  const { step, log } = recordingStep();
  await (runAudit as unknown as { fn: Handler }).fn({
    event: { data: { auditId, organizationId: ORG } },
    step,
  });
  return log;
}

async function collect(
  data: Record<string, unknown>,
  hooks?: { beforeSleep?: (id: string) => void },
) {
  const { collectGoogleSurfacesFn } = await import("@/inngest/functions/collect-google-surfaces");
  const { step, log } = recordingStep(hooks);
  await (collectGoogleSurfacesFn as unknown as { fn: Handler }).fn({ event: { data }, step });
  return log;
}

function dispatched(log: StepLog) {
  const send = log.find((e) => e.id === "google-surfaces-dispatch");
  if (!send?.data) throw new Error("run-audit didn't hand over to Google");
  return send.data;
}

async function googleRows(auditId: string) {
  return client`
    SELECT surface, prompt_index, is_branded_prompt, outcome, outcome_reason, attempts, provider,
      provider_status_code, brand_mentioned, mention_verification, google_link_count,
      jsonb_array_length(coalesce(cited_links, '[]'::jsonb)) AS links, cost_usd, cost_source, location_code,
      location_label, device, se_domain, language_code, queue_mode, answer_text IS NOT NULL AS has_answer,
      raw_response IS NOT NULL AS has_raw
    FROM google_surface_results WHERE audit_id = ${auditId} ORDER BY surface, prompt_index
  `;
}

/** The four engines' rows and the headline, ids and times aside. */
async function coreOf(auditId: string) {
  const { withRlsContext } = await import("@/db/client");
  const { resolveAuditDimensionsAndHeadline } = await import(
    "@/lib/scoring/resolve-audit-dimensions"
  );
  const [audit] = await client`
    SELECT status, score_composite, score_frequency, score_sentiment, score_context, engines, prompts_count,
      total_calls, engine_count, total_cost_usd, metadata, confidence_intervals
    FROM audits WHERE id = ${auditId}
  `;
  const answers = await client`
    SELECT engine, prompt, prompt_index, brand_mentioned, mention_verification, position, response_text,
      cited_sources, llm_cost_usd, llm_model
    FROM citations WHERE audit_id = ${auditId} ORDER BY engine, prompt_index
  `;
  const failures = await client`
    SELECT engine, prompt_index, error_class FROM engine_call_failures WHERE audit_id = ${auditId}
  `;
  const coreCost = await client`
    SELECT source, actual_cost_cents FROM audit_cost_snapshots WHERE audit_id = ${auditId} AND source = 'audit'
  `;
  const headline = await withRlsContext(ORG, (tx) =>
    resolveAuditDimensionsAndHeadline(tx, auditId),
  );
  return JSON.parse(JSON.stringify({ audit, answers, failures, coreCost, headline }));
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG}, ${`google-collect-${ORG}`}, 'Google Collect Test Org', ${`google-collect-${ORG}`})
  `;
  await client`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG}, ${`cus_${ORG}`}, ${`sub_${ORG}`}, 'price_test_growth', 'growth', 'monthly', 'active')
  `;
  // Global settings off (no rows); this workspace switched on by its override, as the demo will be.
  for (const key of ["google_ai_overviews_enabled", "google_ai_mode_enabled"]) {
    await client`
      INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled, reason, set_by)
      VALUES (${ORG}, ${key}, true, 'test', 'test')
    `;
  }
  const settings = await client`SELECT count(*)::int AS n FROM feature_settings`;
  if (settings[0].n > 0) throw new Error("feature_settings isn't empty on the test database");
}, 60_000);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await client`DELETE FROM feature_settings`;
  await deleteOrgRows(client, ORG);
  await client.end();
});

function switchOn() {
  vi.stubEnv("GOOGLE_AI_SURFACES_ENABLED", "true");
  vi.stubEnv("DATAFORSEO_LOGIN", "test-login");
  vi.stubEnv("DATAFORSEO_PASSWORD", "test-password");
}

describe("Google AI surfaces on: the real pipeline, the provider's recorded answers", () => {
  it("run-audit hands over after its engines; each answer is recorded; then audit.complete", async () => {
    switchOn();
    const { fetchImpl, calls } = recordedDataForSeoFetch();
    vi.stubGlobal("fetch", fetchImpl);
    const { auditId, brandId } = await newAudit();

    const log = await runInngestAudit(auditId);
    const ids = log.map((e) => e.id);
    expect(ids).toContain("google-surfaces-queue");
    expect(ids).not.toContain("audit-complete-email");
    expect(log[log.length - 1]).toMatchObject({
      kind: "sendEvent",
      id: "google-surfaces-dispatch",
      event: "google-surfaces/collect",
      data: { auditId, brandId, organizationId: ORG, sendAuditComplete: true },
    });
    // Nothing reached the provider before the four engines were done.
    expect(calls).toEqual([]);
    const [snap] =
      await client`SELECT status, surfaces, location, settings FROM audit_google_surfaces WHERE audit_id = ${auditId}`;
    expect(snap.status).toBe("collecting");
    expect(snap.surfaces).toEqual(["google_ai_overviews", "google_ai_mode"]);
    expect(snap.location).toEqual({
      code: 9071744,
      label: "2153 NSW",
      kind: "postcode",
      precise: true,
      note: null,
    });
    expect(snap.settings).toMatchObject({
      queueMode: "standard",
      device: "desktop",
      maxCostUsdPerAudit: 0.1,
      provider: "dataforseo",
    });

    const steps = await collect(dispatched(log));
    expect(steps.map((s) => s.id)).toEqual([
      "google:post",
      "google:wait:0",
      "google:poll:0",
      "google:finish",
      "google:audit-complete",
    ]);
    expect(steps[steps.length - 1]).toMatchObject({
      event: "audit.complete",
      data: { auditId, brandId, organizationId: ORG },
    });
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(2);
    expect(calls.every((c) => c.authorized)).toBe(true);

    const rows = await googleRows(auditId);
    const view = rows.map((r) => [
      r.surface,
      r.prompt_index,
      r.outcome,
      r.brand_mentioned,
      r.mention_verification,
      r.google_link_count,
      r.links,
    ]);
    expect(view).toEqual([
      ["google_ai_mode", 0, "shown", false, null, 4, 4],
      ["google_ai_mode", 1, "shown", false, null, 0, 3],
      ["google_ai_mode", 2, "shown", true, "verified_domain", 1, 3],
      ["google_ai_mode", 3, "shown", true, "verified_domain", 1, 2],
      ["google_ai_overviews", 0, "shown", false, null, 4, 6],
      ["google_ai_overviews", 1, "not_shown", null, null, 0, 0],
      ["google_ai_overviews", 2, "shown", true, "verified_domain", 0, 7],
      ["google_ai_overviews", 3, "shown", true, "verified_domain", 1, 3],
    ]);
    for (const r of rows) {
      expect(r).toMatchObject({
        attempts: 1,
        provider: "dataforseo",
        provider_status_code: 20000,
        cost_usd: "0.001200",
        cost_source: "provider_reported",
        location_code: 9071744,
        location_label: "2153 NSW",
        device: "desktop",
        language_code: "en",
        queue_mode: "standard",
        has_raw: true,
      });
      expect(r.se_domain).toBe(r.surface === "google_ai_mode" ? "google.com" : "google.com.au");
    }
    expect(rows.find((r) => r.outcome === "not_shown")?.outcome_reason).toBe(
      "Google showed no AI Overview for this question.",
    );
    expect(rows.filter((r) => r.is_branded_prompt).map((r) => r.prompt_index)).toEqual([
      2, 3, 2, 3,
    ]);

    const [after] =
      await client`SELECT status, cost_usd FROM audit_google_surfaces WHERE audit_id = ${auditId}`;
    expect(after).toEqual({ status: "complete", cost_usd: "0.009600" });
    const snapshots = await client`
      SELECT source, actual_cost_cents FROM audit_cost_snapshots WHERE audit_id = ${auditId} ORDER BY source
    `;
    expect(snapshots.map((s) => s.source)).toEqual(["audit", "google_surfaces"]);
    const { usdToAudCents } = await import("@/lib/constants/currency");
    expect(snapshots[1].actual_cost_cents).toBe(usdToAudCents(0.0096));
  }, 120_000);

  it("'on' doesn't change the core: the four engines' rows and the headline equal an audit with Google off", async () => {
    const off = await newAudit();
    vi.stubEnv("GOOGLE_AI_SURFACES_ENABLED", "false");
    await runInngestAudit(off.auditId);
    vi.unstubAllEnvs();

    switchOn();
    vi.stubGlobal("fetch", recordedDataForSeoFetch().fetchImpl);
    const on = await newAudit();
    await collect(dispatched(await runInngestAudit(on.auditId)));

    expect(await coreOf(on.auditId)).toEqual(await coreOf(off.auditId));
    expect((await googleRows(on.auditId)).length).toBe(8);
    expect(await googleRows(off.auditId)).toEqual([]);

    // The four engines' duration (the audit's start to its finalize), Google on and off: Google runs after
    // finalize, in its own function, so it can't lengthen it. Logged for the report.
    const durations = await client`
      SELECT id, EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000 AS ms
      FROM audits WHERE id IN (${off.auditId}, ${on.auditId})
    `;
    const ms = (id: string) => Math.round(Number(durations.find((d) => d.id === id)?.ms));
    // GOOGLE_DURATION_LOG=<path>: written there for the report (the reporter doesn't show passing tests' logs).
    if (process.env.GOOGLE_DURATION_LOG) {
      writeFileSync(
        process.env.GOOGLE_DURATION_LOG,
        JSON.stringify({ coreEngineDurationMs: { off: ms(off.auditId), on: ms(on.auditId) } }),
      );
    }
    const [google] = await client`
      SELECT EXTRACT(EPOCH FROM (g.completed_at - a.completed_at)) * 1000 AS ms
      FROM audit_google_surfaces g JOIN audits a ON a.id = g.audit_id WHERE g.audit_id = ${on.auditId}
    `;
    expect(Number(google.ms)).toBeGreaterThanOrEqual(0);
  }, 120_000);

  it("failures don't leak: the provider unreachable -- Google rows failed, the audit complete, the core the same", async () => {
    const off = await newAudit();
    vi.stubEnv("GOOGLE_AI_SURFACES_ENABLED", "false");
    await runInngestAudit(off.auditId);
    vi.unstubAllEnvs();

    switchOn();
    vi.stubGlobal("fetch", recordedDataForSeoFetch({ unreachable: true }).fetchImpl);
    const { auditId } = await newAudit();
    const steps = await collect(dispatched(await runInngestAudit(auditId)));
    expect(steps.map((s) => s.id)).toContain("google:audit-complete");
    const rows = await googleRows(auditId);
    expect(new Set(rows.map((r) => r.outcome))).toEqual(new Set(["failed"]));
    // 12 Nov, part 2: no answer is no status code (null), for the operator in plain words.
    expect(rows[0].outcome_reason).toBe("The provider couldn't be reached (TypeError).");
    expect(rows[0].provider_status_code).toBeNull();
    expect(await coreOf(auditId)).toEqual(await coreOf(off.auditId));
  }, 120_000);

  it("the kill switch turned off mid-audit: what's left is skipped, and the audit still completes", async () => {
    switchOn();
    vi.stubGlobal("fetch", recordedDataForSeoFetch().fetchImpl);
    const { auditId } = await newAudit();
    const steps = await collect(dispatched(await runInngestAudit(auditId)), {
      beforeSleep: () => vi.stubEnv("GOOGLE_AI_SURFACES_ENABLED", "false"),
    });
    expect(steps.map((s) => s.id)).toEqual([
      "google:post",
      "google:wait:0",
      "google:poll:0",
      "google:finish",
      "google:audit-complete",
    ]);
    const rows = await googleRows(auditId);
    expect(new Set(rows.map((r) => r.outcome))).toEqual(new Set(["skipped"]));
    expect(rows[0].outcome_reason).toBe(
      "Skipped: Google was switched off (GOOGLE_AI_SURFACES_ENABLED) during the audit.",
    );
    const [audit] = await client`SELECT status FROM audits WHERE id = ${auditId}`;
    expect(audit.status).toBe("complete");
    const [snap] =
      await client`SELECT status FROM audit_google_surfaces WHERE audit_id = ${auditId}`;
    expect(snap.status).toBe("complete");
  }, 120_000);

  it("the cost ceiling: only what fits is posted, the rest skipped with the limit named", async () => {
    switchOn();
    await client`INSERT INTO feature_settings (key, value) VALUES ('google_surfaces_max_cost_usd_per_audit', '0.003')`;
    const { fetchImpl, calls } = recordedDataForSeoFetch();
    vi.stubGlobal("fetch", fetchImpl);
    const { auditId } = await newAudit();
    await collect(dispatched(await runInngestAudit(auditId)));
    await client`DELETE FROM feature_settings WHERE key = 'google_surfaces_max_cost_usd_per_audit'`;

    const rows = await googleRows(auditId);
    expect(
      rows.filter((r) => r.outcome === "shown").map((r) => [r.surface, r.prompt_index]),
    ).toEqual([
      ["google_ai_mode", 0],
      ["google_ai_overviews", 0],
    ]);
    const skipped = rows.filter((r) => r.outcome === "skipped");
    expect(skipped).toHaveLength(6);
    expect(skipped[0].outcome_reason).toBe(
      "Skipped: the cost limit for Google (US$0.0030 per audit) was reached.",
    );
    const posted = calls.filter((c) => c.method === "POST").flatMap((c) => c.body as unknown[]);
    expect(posted).toHaveLength(2);
  }, 120_000);

  it("a billed retry: the provider's real 40401 for a task, posted again and charged again", async () => {
    switchOn();
    const lostTask = (recordedFixture("aio-task-get-q01.json").tasks as { id: string }[])[0].id;
    const { fetchImpl, calls } = recordedDataForSeoFetch({ lostOnce: [lostTask] });
    vi.stubGlobal("fetch", fetchImpl);
    const { auditId } = await newAudit();
    const steps = await collect(dispatched(await runInngestAudit(auditId)));
    expect(steps.map((s) => s.id)).toEqual([
      "google:post",
      "google:wait:0",
      "google:poll:0",
      "google:wait:1",
      "google:poll:1",
      "google:finish",
      "google:audit-complete",
    ]);
    const [row] = (await googleRows(auditId)).filter(
      (r) => r.surface === "google_ai_overviews" && r.prompt_index === 0,
    );
    expect(row).toMatchObject({
      outcome: "shown",
      attempts: 2,
      cost_usd: "0.002400",
      provider_status_code: 20000,
    });
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(3);
    const [snap] =
      await client`SELECT cost_usd FROM audit_google_surfaces WHERE audit_id = ${auditId}`;
    expect(snap.cost_usd).toBe("0.010800");
  }, 120_000);

  it("the daily cap: Google is skipped first, the core audit untouched", async () => {
    switchOn();
    const { fetchImpl, calls } = recordedDataForSeoFetch();
    vi.stubGlobal("fetch", fetchImpl);
    const { auditId } = await newAudit();
    const log = await runInngestAudit(auditId);
    vi.stubEnv("DAILY_SPEND_CAP_CENTS", "1");
    await collect(dispatched(log));
    const rows = await googleRows(auditId);
    expect(new Set(rows.map((r) => r.outcome))).toEqual(new Set(["skipped"]));
    expect(rows[0].outcome_reason).toBe(
      "Skipped: today's spend limit -- Google is skipped first so the four engines can still run.",
    );
    expect(calls).toEqual([]);
    const [audit] = await client`SELECT status FROM audits WHERE id = ${auditId}`;
    expect(audit.status).toBe("complete");
  }, 120_000);

  it("env off: no provider call and no Google row, even with every database switch on", async () => {
    vi.stubEnv("GOOGLE_AI_SURFACES_ENABLED", "false");
    vi.stubEnv("DATAFORSEO_LOGIN", "test-login");
    vi.stubEnv("DATAFORSEO_PASSWORD", "test-password");
    await client`INSERT INTO feature_settings (key, value) VALUES ('google_ai_mode_enabled', 'true'), ('google_ai_overviews_enabled', 'true')`;
    const { fetchImpl, calls } = recordedDataForSeoFetch();
    vi.stubGlobal("fetch", fetchImpl);
    const { auditId } = await newAudit();
    const log = await runInngestAudit(auditId);
    await client`DELETE FROM feature_settings WHERE key IN ('google_ai_mode_enabled', 'google_ai_overviews_enabled')`;
    expect(log.map((e) => e.id)).not.toContain("google-surfaces-queue");
    expect(log[log.length - 1]).toMatchObject({
      id: "audit-complete-email",
      event: "audit.complete",
    });
    expect(calls).toEqual([]);
    expect(await googleRows(auditId)).toEqual([]);
    expect(await client`SELECT 1 FROM audit_google_surfaces WHERE audit_id = ${auditId}`).toEqual(
      [],
    );
  }, 120_000);
});

describe("the inline runner hands over too", () => {
  it("queues the questions and sends google-surfaces/collect without audit.complete; if it can't, says so", async () => {
    switchOn();
    const { inngest } = await import("@/lib/inngest/client");
    const { runAuditInline } = await import("@/lib/audit/run-audit-inline");
    const sent: unknown[] = [];
    const send = vi.spyOn(inngest, "send").mockImplementation(async (payload: unknown) => {
      sent.push(payload);
      return { ids: [] };
    });
    const ok = await newAudit();
    await runAuditInline(ok.auditId);
    expect(sent).toEqual([
      {
        name: "google-surfaces/collect",
        data: {
          auditId: ok.auditId,
          brandId: ok.brandId,
          organizationId: ORG,
          sendAuditComplete: false,
        },
      },
    ]);
    expect(new Set((await googleRows(ok.auditId)).map((r) => r.outcome))).toEqual(
      new Set(["pending"]),
    );

    send.mockImplementation(async () => {
      throw new Error("Inngest unreachable");
    });
    const unreachable = await newAudit();
    await runAuditInline(unreachable.auditId);
    const rows = await googleRows(unreachable.auditId);
    expect(new Set(rows.map((r) => r.outcome))).toEqual(new Set(["skipped"]));
    expect(rows[0].outcome_reason).toBe(
      "Google couldn't be checked: the background runner wasn't reachable.",
    );
    const [audit] = await client`SELECT status FROM audits WHERE id = ${unreachable.auditId}`;
    expect(audit.status).toBe("complete");
    send.mockRestore();
  }, 120_000);
});
