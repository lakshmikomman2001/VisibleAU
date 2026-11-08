/**
 * Mock-gate and retention follow-ups (Sri, 2 Nov), part 3 -- the weekly retention job
 * (inngest/functions/audit-data-retention.ts, step "delete-old-audit-data") deleted citations, then audits,
 * outside a transaction. From about June 2027, when the first audits turn 12 months old, the audit delete would
 * have hit the foreign keys from action_items, drift_alerts, engine_call_failures and audit_exports (NOT NULL, no
 * ON DELETE rule) after the citations were already gone, and failed every week.
 *
 * Here the real step runs with the clock set to 2002 (Date only), so its 12-month cutoff catches only the audits
 * seeded in 2001 and nothing else in the shared test database. It completes, deletes and keeps exactly what
 * lib/retention/audit-retention.ts says, and leaves a current audit untouched. A forced database error fails the
 * run and rolls its batch back. RED on the parent: the foreign-key violation.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const client = postgres(getTestDatabaseUrl(), { max: 1 });

const ORG = randomUUID();
const BRAND = randomUUID();
const OLD_A = randomUUID();
const OLD_B = randomUUID();
const OLD_FORCED = randomUUID();
const NEW_A = randomUUID();
const NEW_B = randomUUID();
const ITEM = {
  open: randomUUID(),
  dismissed: randomUUID(),
  inProgress: randomUUID(),
  done: randomUUID(),
  newOpen: randomUUID(),
  forcedOpen: randomUUID(),
};
const TASK = randomUUID();
const EVIDENCE_OLD = randomUUID();
const EVIDENCE_NEW = randomUUID();
const DRIFT_OLD = randomUUID();
const DRIFT_ACROSS = randomUUID();
const DRIFT_NEW = randomUUID();
const TRIGGER = `retention_test_refuse_${ORG.slice(0, 8)}`;

async function seedAudit(id: string, auditNumber: number, createdAt: string | null): Promise<void> {
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, created_at)
    VALUES (${id}, ${BRAND}, ${ORG}, ${auditNumber}, 'complete', COALESCE(${createdAt}::timestamptz, now()))
  `;
  await client`
    INSERT INTO citations (audit_id, engine, prompt, prompt_index, run_number, brand_mentioned, sentiment_label, context_label, created_at)
    VALUES (${id}, 'chatgpt', 'Best plumber in Bondi?', 0, 1, false, 'neutral', 'absent', COALESCE(${createdAt}::timestamptz, now()))
  `;
  await client`
    INSERT INTO engine_call_failures (audit_id, organization_id, engine, prompt, prompt_index, is_branded_prompt, error_class, error_message, attempts, latency_ms)
    VALUES (${id}, ${ORG}, 'gemini', 'Best plumber in Bondi?', 0, false, 'timeout', 'timed out', 1, 30000)
  `;
  await client`INSERT INTO audit_exports (audit_id, organization_id, format) VALUES (${id}, ${ORG}, 'csv')`;
}

async function seedItem(id: string, auditId: string, key: string, status: string): Promise<void> {
  await client`
    INSERT INTO action_items (id, organization_id, brand_id, audit_id, recommendation_key, dimension, title, action, confidence_label, expected_impact_score, status)
    VALUES (${id}, ${ORG}, ${BRAND}, ${auditId}, ${key}, 'frequency', ${`Item ${key} (${status})`}, 'Do it.', 'likely', 'medium', ${status})
  `;
}

async function count(table: string, column: string, ids: string[]): Promise<number> {
  const [row] = await client<{ c: number }[]>`
    SELECT count(*)::int AS c FROM ${client(table)} WHERE ${client(column)} = ANY(${ids})
  `;
  return row.c;
}

/** Runs only the retention job's audit step, with the clock at `now`; returns the step's result. */
async function runAuditStep(now: string): Promise<unknown> {
  const { auditDataRetention } = await import("@/inngest/functions/audit-data-retention");
  let result: unknown;
  const step = {
    run: async (name: string, work: () => Promise<unknown>) => {
      if (name !== "delete-old-audit-data") return {};
      result = await work();
      return result;
    },
  };
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(now));
  try {
    await (
      auditDataRetention as unknown as { fn: (ctx: { step: typeof step }) => Promise<unknown> }
    ).fn({ step });
  } finally {
    vi.useRealTimers();
  }
  return result;
}

beforeAll(async () => {
  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG}, ${`retention-${ORG}`}, 'Retention Test Org', ${`retention-${ORG}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region)
    VALUES (${BRAND}, ${ORG}, 'Retention Plumbing', 'retention.example.com.au', 'tradies', 'au')
  `;
  await seedAudit(OLD_A, 1, "2001-01-10T00:00:00Z");
  await seedAudit(OLD_B, 2, "2001-02-10T00:00:00Z");
  await seedAudit(NEW_A, 3, null);
  await seedAudit(NEW_B, 4, null);

  await seedItem(ITEM.open, OLD_B, "directory-visibility", "open");
  await seedItem(ITEM.dismissed, OLD_A, "wikipedia-article", "dismissed");
  await seedItem(ITEM.inProgress, OLD_A, "reddit-absence", "in_progress");
  await seedItem(ITEM.done, OLD_A, "stale-content", "done");
  await seedItem(ITEM.newOpen, NEW_B, "directory-visibility", "open");

  await client`
    INSERT INTO remediation_tasks (id, organization_id, brand_id, audit_id, recommendation_id, title, priority)
    VALUES (${TASK}, ${ORG}, ${BRAND}, ${OLD_A}, ${ITEM.inProgress}, 'Post in r/sydney', 2)
  `;
  await client`
    INSERT INTO evidence_snapshots (id, brand_id, organization_id, audit_id, engine, prompt, raw_response)
    VALUES
      (${EVIDENCE_OLD}, ${BRAND}, ${ORG}, ${OLD_A}, 'chatgpt', 'Best plumber in Bondi?', 'Try Retention Plumbing.'),
      (${EVIDENCE_NEW}, ${BRAND}, ${ORG}, ${NEW_A}, 'chatgpt', 'Best plumber in Bondi?', 'Try Retention Plumbing.')
  `;
  await client`
    INSERT INTO drift_alerts (id, organization_id, brand_id, current_audit_id, previous_audit_id, severity)
    VALUES
      (${DRIFT_OLD}, ${ORG}, ${BRAND}, ${OLD_B}, ${OLD_A}, 'warning'),
      (${DRIFT_ACROSS}, ${ORG}, ${BRAND}, ${NEW_A}, ${OLD_B}, 'warning'),
      (${DRIFT_NEW}, ${ORG}, ${BRAND}, ${NEW_B}, ${NEW_A}, 'warning')
  `;
}, 30000);

afterAll(async () => {
  await client.unsafe(`DROP TRIGGER IF EXISTS ${TRIGGER} ON audits`);
  await client.unsafe(`DROP FUNCTION IF EXISTS ${TRIGGER}()`);
  await client`DELETE FROM remediation_tasks WHERE organization_id = ${ORG}`;
  await client`DELETE FROM evidence_snapshots WHERE organization_id = ${ORG}`;
  await client`DELETE FROM drift_alerts WHERE organization_id = ${ORG}`;
  await client`DELETE FROM action_items WHERE organization_id = ${ORG}`;
  await client`DELETE FROM engine_call_failures WHERE organization_id = ${ORG}`;
  await client`DELETE FROM audit_exports WHERE organization_id = ${ORG}`;
  await client`DELETE FROM audits WHERE organization_id = ${ORG}`;
  await client`DELETE FROM brands WHERE id = ${BRAND}`;
  await client`DELETE FROM organizations WHERE id = ${ORG}`;
  await client.end();
});

describe("the weekly retention job deletes 12-month-old audits with their children", () => {
  it("completes: the old audits and what goes with them are deleted, people's own work is kept, the current audit is untouched", async () => {
    const result = await runAuditStep("2002-06-01T00:00:00Z");

    expect(result).toMatchObject({
      deletedAudits: 2,
      deletedCitations: 2,
      deletedEngineCallFailures: 2,
      deletedAuditExports: 2,
      deletedDriftAlerts: 2,
      deletedActionItems: 2,
      keptActionItems: 2,
      more: false,
    });

    // Deleted: the audits, their questions and answers, failed calls, exports, the alerts that compared them,
    // and the suggestions nobody acted on.
    expect(await count("audits", "id", [OLD_A, OLD_B])).toBe(0);
    expect(await count("citations", "audit_id", [OLD_A, OLD_B])).toBe(0);
    expect(await count("engine_call_failures", "audit_id", [OLD_A, OLD_B])).toBe(0);
    expect(await count("audit_exports", "audit_id", [OLD_A, OLD_B])).toBe(0);
    expect(await count("drift_alerts", "id", [DRIFT_OLD, DRIFT_ACROSS])).toBe(0);
    expect(await count("action_items", "id", [ITEM.open, ITEM.dismissed])).toBe(0);

    // Kept with no audit: work in progress and done, the task on the workflow board, the evidence archive.
    const kept = await client<{ id: string; audit_id: string | null; status: string }[]>`
      SELECT id, audit_id, status FROM action_items WHERE id IN (${ITEM.inProgress}, ${ITEM.done}) ORDER BY status
    `;
    expect(kept).toEqual([
      { id: ITEM.done, audit_id: null, status: "done" },
      { id: ITEM.inProgress, audit_id: null, status: "in_progress" },
    ]);
    const [task] = await client<{ audit_id: string | null; recommendation_id: string | null }[]>`
      SELECT audit_id, recommendation_id FROM remediation_tasks WHERE id = ${TASK}
    `;
    expect(task).toEqual({ audit_id: null, recommendation_id: ITEM.inProgress });
    const [evidence] = await client<{ audit_id: string | null }[]>`
      SELECT audit_id FROM evidence_snapshots WHERE id = ${EVIDENCE_OLD}
    `;
    expect(evidence).toEqual({ audit_id: null });

    // The current audits and everything of theirs are untouched.
    expect(await count("audits", "id", [NEW_A, NEW_B])).toBe(2);
    expect(await count("citations", "audit_id", [NEW_A, NEW_B])).toBe(2);
    expect(await count("engine_call_failures", "audit_id", [NEW_A, NEW_B])).toBe(2);
    expect(await count("audit_exports", "audit_id", [NEW_A, NEW_B])).toBe(2);
    expect(await count("drift_alerts", "id", [DRIFT_NEW])).toBe(1);
    expect(await count("action_items", "id", [ITEM.newOpen])).toBe(1);
    expect(await count("evidence_snapshots", "audit_id", [NEW_A])).toBe(1);
  });

  it("a database error fails the run and rolls its batch back; the next run carries on", async () => {
    await seedAudit(OLD_FORCED, 5, "2001-03-10T00:00:00Z");
    await seedItem(ITEM.forcedOpen, OLD_FORCED, "directory-visibility", "open");
    await client.unsafe(`
      CREATE FUNCTION ${TRIGGER}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'forced by the audit-retention test'; END $$;
      CREATE TRIGGER ${TRIGGER} BEFORE DELETE ON audits
        FOR EACH ROW WHEN (OLD.id = '${OLD_FORCED}') EXECUTE FUNCTION ${TRIGGER}();
    `);

    try {
      // Drizzle wraps the database's error ("Failed query: delete from audits ..."), with it as the cause.
      const failure = await runAuditStep("2002-06-01T00:00:00Z").then(
        () => null,
        (e: unknown) => e,
      );
      expect(failure).toBeInstanceOf(Error);
      expect(String((failure as Error).cause ?? failure)).toMatch(
        /forced by the audit-retention test/,
      );
      // Nothing of the failed batch was committed: not even the children deleted before the audit.
      expect(await count("audits", "id", [OLD_FORCED])).toBe(1);
      expect(await count("citations", "audit_id", [OLD_FORCED])).toBe(1);
      expect(await count("engine_call_failures", "audit_id", [OLD_FORCED])).toBe(1);
      expect(await count("action_items", "id", [ITEM.forcedOpen])).toBe(1);
    } finally {
      await client.unsafe(`DROP TRIGGER IF EXISTS ${TRIGGER} ON audits`);
      await client.unsafe(`DROP FUNCTION IF EXISTS ${TRIGGER}()`);
    }

    const rerun = await runAuditStep("2002-06-01T00:00:00Z");
    expect(rerun).toMatchObject({ deletedAudits: 1, deletedActionItems: 1, more: false });
    expect(await count("audits", "id", [OLD_FORCED])).toBe(0);
    expect(await count("audits", "id", [NEW_A, NEW_B])).toBe(2);
  });
});

describe("no table can block the job again", () => {
  it("every foreign key to audits without an ON DELETE rule is one the job deletes itself", async () => {
    // lib/retention/audit-retention.ts deletes these children before the audit. A new table referencing audits
    // with no ON DELETE rule would fail the job from its 12-month mark: give it a rule, or delete it there too.
    const DELETED_BY_THE_JOB = [
      "audit_exports.audit_id",
      "drift_alerts.current_audit_id",
      "drift_alerts.previous_audit_id",
      "engine_call_failures.audit_id",
    ];
    const blocking = await client<{ ref: string }[]>`
      SELECT con.conrelid::regclass::text || '.' || att.attname AS ref
      FROM pg_constraint con
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
      WHERE con.contype = 'f' AND con.confrelid = 'audits'::regclass AND con.confdeltype IN ('a', 'r')
      ORDER BY 1
    `;
    expect(blocking.map((r) => r.ref)).toEqual(DELETED_BY_THE_JOB);
  });
});
