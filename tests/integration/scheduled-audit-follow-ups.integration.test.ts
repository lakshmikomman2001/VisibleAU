/**
 * Leftovers task, part 2 (17 Nov): a scheduled audit finishes the way an audit started by hand finishes.
 *
 * An audit started in the app runs in inngest/functions/run-audit.ts and ends by sending audit.complete, which every
 * follow-up listens for (recommendations, drift, the completion email, the two alerts, the weekly trend -- and from it
 * the narrative report, its PDF and the scheduled report emails -- topical gaps, citation sources, evidence snapshots,
 * hallucination checks, GA4, head-to-head comparisons, webhooks). A scheduled, bulk, workflow or validation audit ran
 * in lib/audit/run-audit-inline.ts, which never sent it: only inline copies of drift, recommendations and the two
 * alerts ran, and the route's technical audit never ran at all.
 *
 * Real DB, mock-mode answers. The schedule's own cron step (inngest/functions/audit-schedules-cron.ts) runs a due
 * schedule; Inngest itself is a spy.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import { recordedQuestions } from "@/tests/helpers/dataforseo-recorded";
import { deleteOrgRows } from "@/tests/helpers/delete-org-rows";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

// S01B part 3 (LLD amendment 50): the inline runner's recommendation step searches Wikipedia for the business; the
// search is answered from a recording (no article for an invented name), never the network.
vi.mock("@/lib/brand-entity/wikipedia-au", async (importOriginal) =>
  (await import("@/tests/helpers/recorded-network")).recordedWikipedia(importOriginal),
);

const { technicalAudits } = vi.hoisted(() => ({ technicalAudits: [] as [string, string][] }));
// The site crawl is a network job; what matters here is that it's started for the audit, as the route starts it.
vi.mock("@/lib/audit/run-technical-audit-inline", () => ({
  runTechnicalAuditInline: vi.fn(async (auditId: string, brandId: string) => {
    technicalAudits.push([auditId, brandId]);
  }),
}));

const ORG = randomUUID();
const QUESTIONS = recordedQuestions();
let client: ReturnType<typeof postgres>;

type StepLog = { kind: string; id: string; event?: string; data?: Record<string, unknown> }[];
type Handler = (ctx: {
  event?: { data: Record<string, unknown> };
  step: unknown;
}) => Promise<unknown>;

/** Inngest's step tools, recorded; `only` narrows the cron's "load-due" to this test's schedule. */
function recordingStep(only?: string) {
  const log: StepLog = [];
  return {
    log,
    step: {
      run: async (id: string, fn: () => unknown) => {
        log.push({ kind: "run", id });
        const out = await fn();
        if (id === "load-due" && only && Array.isArray(out)) {
          return out.filter((s: { id: string }) => s.id === only);
        }
        return out;
      },
      sendEvent: async (id: string, payload: { name: string; data: Record<string, unknown> }) => {
        log.push({ kind: "sendEvent", id, event: payload.name, data: payload.data });
        return { ids: [] };
      },
    },
  };
}

async function newBrand() {
  const brandId = randomUUID();
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, prompt_pack,
      prompt_pack_generator_version, classification_status, classification, categories, audience,
      category_confirmed_at, suburb, state, country, location_mode, location_confirmed_at)
    VALUES (${brandId}, ${ORG}, 'Yabby Services', 'yabbyservices.com.au', 'tradies', 'au',
      ARRAY['NSW:Norwest']::text[], ${client.json(QUESTIONS)}, ${PROMPT_GENERATOR_VERSION}, 'complete',
      ${client.json({ category: "trades_plumbing", buyerType: "smb", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })},
      ARRAY['trades_plumbing']::text[], 'households', now(), 'Norwest', 'NSW', 'Australia', 'fixed', now())
  `;
  return brandId;
}

async function newAudit(brandId: string, triggeredBy = "manual") {
  const auditId = randomUUID();
  // The org's next number (the schedule's cron numbers its own audits in the same sequence).
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, metadata)
    VALUES (${auditId}, ${brandId}, ${ORG},
      (SELECT coalesce(max(audit_number), 0) + 1 FROM audits WHERE organization_id = ${ORG}),
      ${triggeredBy}, 'pending', ${client.json({ mockScenario: "happy_path" })})
  `;
  return auditId;
}

/** The manual path: run-audit's handler, its steps recorded. */
async function runByHand(auditId: string) {
  const { runAudit } = await import("@/inngest/functions/run-audit");
  const { step, log } = recordingStep();
  await (runAudit as unknown as { fn: Handler }).fn({
    event: { data: { auditId, organizationId: ORG } },
    step,
  });
  return log;
}

/** The scheduled path: a due schedule, and the cron's own steps. Returns the audit it ran. */
async function runSchedule(brandId: string) {
  const scheduleId = randomUUID();
  await client`
    INSERT INTO audit_schedules (id, brand_id, organization_id, frequency, status, next_run_at)
    VALUES (${scheduleId}, ${brandId}, ${ORG}, 'weekly', 'active', now() - interval '1 minute')
  `;
  const { auditSchedulesCron } = await import("@/inngest/functions/audit-schedules-cron");
  const { step, log } = recordingStep(scheduleId);
  await (auditSchedulesCron as unknown as { fn: Handler }).fn({ step });
  const [audit] = await client<{ id: string; status: string; triggered_by: string }[]>`
    SELECT id, status, triggered_by FROM audits WHERE brand_id = ${brandId} AND triggered_by = 'schedule'
    ORDER BY created_at DESC LIMIT 1
  `;
  return { audit, log, scheduleId };
}

async function spyInngest(behaviour: "ok" | "unreachable") {
  const { inngest } = await import("@/lib/inngest/client");
  const sent: { name: string; data: Record<string, unknown> }[] = [];
  const spy = vi.spyOn(inngest, "send").mockImplementation((async (payload: unknown) => {
    if (behaviour === "unreachable") throw new Error("Inngest unreachable");
    sent.push(payload as { name: string; data: Record<string, unknown> });
    return { ids: [] };
  }) as never);
  return { sent, spy };
}

const followUpRows = async (auditId: string) => {
  const [r] = await client<{ recommendations: number; drift: number }[]>`
    SELECT (SELECT count(*)::int FROM action_items WHERE audit_id = ${auditId}) AS recommendations,
           (SELECT count(*)::int FROM drift_alerts WHERE current_audit_id = ${auditId}) AS drift
  `;
  return r;
};

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG}, ${`scheduled-follow-ups-${ORG}`}, 'Scheduled Follow-ups Test Org', ${`scheduled-follow-ups-${ORG}`})
  `;
  await client`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG}, ${`cus_${ORG}`}, ${`sub_${ORG}`}, 'price_test_growth', 'growth', 'monthly', 'active')
  `;
}, 60_000);

afterEach(() => {
  vi.restoreAllMocks();
  technicalAudits.length = 0;
});

afterAll(async () => {
  await deleteOrgRows(client, ORG);
  await client.end();
});

describe("a scheduled audit finishes like one started by hand", () => {
  it("the same audit.complete, from the schedule's own step, and the technical audit beside it", async () => {
    const { AUDIT_COMPLETE_EVENT } = await import("@/lib/audit/audit-complete");
    const brandId = await newBrand();

    // By hand: run-audit's last step.
    const manualAudit = await newAudit(brandId);
    const manualLog = await runByHand(manualAudit);
    const manualEvent = manualLog.at(-1);
    expect(manualEvent).toMatchObject({ kind: "sendEvent", id: "audit-complete-email" });
    expect(manualEvent?.event).toBe(AUDIT_COMPLETE_EVENT);

    // Scheduled: the cron runs it; it sends the same event, for its own audit.
    const { sent } = await spyInngest("ok");
    const { audit, log } = await runSchedule(brandId);
    expect(audit.status).toBe("complete");
    // It ran in the schedule's own step, as it always has.
    expect(log.some((e) => e.kind === "run" && e.id.startsWith("run-audit-"))).toBe(true);
    expect(sent).toEqual([
      {
        // S04B part 3 (LLD amendment 105): every audit.complete carries the audit id as its event id, so it is sent once.
        id: audit.id,
        name: AUDIT_COMPLETE_EVENT,
        data: { auditId: audit.id, brandId, organizationId: ORG },
      },
    ]);
    // The same shape as the manual one, field for field.
    expect(Object.keys(sent[0].data).sort()).toEqual(Object.keys(manualEvent?.data ?? {}).sort());
    expect(technicalAudits).toEqual([[audit.id, brandId]]);
  }, 180_000);

  it("the follow-ups run once, through the listeners: none of them inline when the event went out", async () => {
    const brandId = await newBrand();
    const { sent } = await spyInngest("ok");
    const { audit } = await runSchedule(brandId);
    expect(sent.map((e) => e.name)).toEqual(["audit.complete"]);
    // generate-recommendations and detect-drift write these when they run on the event; the runner wrote them itself
    // (and with the event too, detect-drift's alert would have been a second one: drift_alerts has no unique key).
    expect(await followUpRows(audit.id)).toEqual({ recommendations: 0, drift: 0 });
  }, 180_000);

  it("Inngest unreachable: what can run inline still does (the manual route's fallback)", async () => {
    const brandId = await newBrand();
    await spyInngest("unreachable");
    const auditId = await newAudit(brandId);
    const { runAuditInline } = await import("@/lib/audit/run-audit-inline");
    await runAuditInline(auditId);
    const [a] = await client`SELECT status FROM audits WHERE id = ${auditId}`;
    expect(a.status).toBe("complete");
    expect((await followUpRows(auditId)).recommendations).toBeGreaterThan(0);
  }, 180_000);

  it("the public sample audit sends nothing and runs no follow-up", async () => {
    const brandId = await newBrand();
    const { sent, spy } = await spyInngest("ok");
    const auditId = await newAudit(brandId, "sample");
    const { runAuditInline } = await import("@/lib/audit/run-audit-inline");
    await runAuditInline(auditId);
    expect(spy).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
    expect(await followUpRows(auditId)).toEqual({ recommendations: 0, drift: 0 });
  }, 180_000);
});

describe("every audit that isn't started by hand runs the same two jobs", () => {
  it("the schedule, bulk, workflow and validation runners call runBackgroundAudit, never runAuditInline alone", () => {
    for (const file of [
      "inngest/functions/audit-schedules-cron.ts",
      "inngest/functions/bulk-reaudit-orchestrate.ts",
      "inngest/functions/schedule-workflow-runs.ts",
      "inngest/functions/trigger-validation-reaudit.ts",
    ]) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source, file).toMatch(/await runBackgroundAudit\(auditId, /);
      expect(source, file).not.toMatch(/await runAuditInline\(/);
    }
  });
});
