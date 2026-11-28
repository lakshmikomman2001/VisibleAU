/**
 * S04B part 3 (LLD amendment 105): the Inngest runner's finalize step, run again after its first run committed (the
 * step's response was lost, so Inngest runs it again), no longer ends the function with "already_terminal" and no
 * audit.complete: the audit is complete, so audit.complete is sent, with the audit id as its event id. Every send of
 * audit.complete carries that id, so Inngest drops a repeat and the email, report and follow-ups happen once. An audit
 * the stale-run guard failed still sends nothing. The inline runner still sends one audit.complete, now with the id.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import { deleteOrgRows } from "@/tests/helpers/delete-org-rows";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

vi.mock("@/lib/brand-entity/wikipedia-au", async (importOriginal) =>
  (await import("@/tests/helpers/recorded-network")).recordedWikipedia(importOriginal),
);

const ORG = randomUUID();
let sql: ReturnType<typeof postgres>;
let auditNumber = 0;

type Sent = { stepId: string; event: { id?: string; name: string; data: Record<string, unknown> } };
type Handler = (ctx: {
  event: { data: { auditId: string } };
  step: {
    run: (name: string, fn: () => unknown) => Promise<unknown>;
    sleep: () => Promise<void>;
    sendEvent: (id: string, event: Sent["event"]) => Promise<unknown>;
  };
}) => Promise<{ skipped?: boolean; reason?: string }>;

async function newBrandAndAudit(status = "pending") {
  const brandId = randomUUID();
  const auditId = randomUUID();
  auditNumber++;
  await sql`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, prompt_pack,
      prompt_pack_generator_version, classification_status, classification, category_confirmed_at, location_mode)
    VALUES (${brandId}, ${ORG}, 'Ironbark Finalize Plumbing', ${`${brandId.slice(0, 8)}.example.com.au`}, 'tradies', 'au',
      ARRAY[]::text[], ${sql.json(["Organic finalize prompt 1 about plumbing", "Organic finalize prompt 2 about plumbing"])},
      ${PROMPT_GENERATOR_VERSION}, 'complete',
      ${sql.json({ category: "trades_plumbing", buyerType: "smb", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })},
      now(), 'fixed')`;
  await sql`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, metadata)
    VALUES (${auditId}, ${brandId}, ${ORG}, ${auditNumber}, 'manual', ${status}, ${sql.json({ mockScenario: "happy_path" })})`;
  return { brandId, auditId };
}

/** Inngest's step tools, with "finalize" run twice when asked: its first run commits, then its response is lost. */
function steps(opts: { finalizeTwice?: boolean; beforeFinalize?: () => Promise<void> } = {}) {
  const sent: Sent[] = [];
  return {
    sent,
    step: {
      run: async (name: string, fn: () => unknown) => {
        if (name === "finalize") {
          await opts.beforeFinalize?.();
          if (opts.finalizeTwice) await fn();
        }
        return fn();
      },
      sleep: async () => undefined,
      sendEvent: async (stepId: string, event: Sent["event"]) => {
        sent.push({ stepId, event });
        return { ids: [event.id ?? randomUUID()] };
      },
    },
  };
}

/** What Inngest delivers: one event per id ("Inngest will ignore any event with the same ID" within 24 hours). */
function delivered(sends: Sent[]) {
  const seen = new Set<string>();
  return sends.filter((s) => {
    if (s.event.name !== "audit.complete") return false;
    const key = s.event.id ?? randomUUID();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

let fn: Handler;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  vi.stubEnv("GOOGLE_AI_SURFACES_ENABLED", "false");
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  await sql`INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG}, ${`finalize-${ORG}`}, 'Finalize Org', ${`finalize-${ORG}`})`;
  const { runAudit } = await import("@/inngest/functions/run-audit");
  fn = (runAudit as unknown as { fn: Handler }).fn;
}, 60_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await sql`DELETE FROM audit_reach_results WHERE organization_id = ${ORG}`;
  await deleteOrgRows(sql, ORG);
  await sql.end();
});

describe("finalize run twice: audit.complete is sent, once", () => {
  it("a finalize step run again after its first run committed still sends audit.complete, with the audit id as its id", async () => {
    const { brandId, auditId } = await newBrandAndAudit();
    const { sent, step } = steps({ finalizeTwice: true });
    const result = await fn({ event: { data: { auditId } }, step });

    expect(result.reason).not.toBe("already_terminal");
    const [audit] = await sql<
      { status: string }[]
    >`SELECT status FROM audits WHERE id = ${auditId}`;
    expect(audit.status).toBe("complete");
    const completes = sent.filter((s) => s.event.name === "audit.complete");
    expect(completes).toEqual([
      {
        stepId: "audit-complete-email",
        event: {
          id: auditId,
          name: "audit.complete",
          data: { auditId, brandId, organizationId: ORG },
        },
      },
    ]);
    // The reach results were written once, as for a single run.
    const [{ rows }] = await sql<{ rows: number }[]>`
      SELECT count(*)::int AS rows FROM audit_reach_results WHERE audit_id = ${auditId}`;
    expect(rows).toBe(1);
  });

  it("the whole function run twice for one audit sends audit.complete twice with one id: Inngest delivers it once", async () => {
    const { auditId } = await newBrandAndAudit();
    const first = steps();
    await fn({ event: { data: { auditId } }, step: first.step });
    const second = steps();
    await fn({ event: { data: { auditId } }, step: second.step });
    const all = [...first.sent, ...second.sent];
    expect(all.filter((s) => s.event.name === "audit.complete").map((s) => s.event.id)).toEqual([
      auditId,
      auditId,
    ]);
    expect(delivered(all)).toHaveLength(1);
  });

  it("an audit the stale-run guard failed meanwhile still ends with already_terminal and sends nothing", async () => {
    const { auditId } = await newBrandAndAudit();
    const { sent, step } = steps({
      beforeFinalize: async () => {
        await sql`UPDATE audits SET status = 'failed', failed_at = now() WHERE id = ${auditId}`;
      },
    });
    const result = await fn({ event: { data: { auditId } }, step });
    expect(result).toMatchObject({ skipped: true, reason: "already_terminal" });
    expect(sent.filter((s) => s.event.name === "audit.complete")).toEqual([]);
  });
});

describe("the inline runner", () => {
  it("sends one audit.complete, with the audit id as its id", async () => {
    const { brandId, auditId } = await newBrandAndAudit();
    const { inngest } = await import("@/lib/inngest/client");
    const send = vi.spyOn(inngest, "send").mockResolvedValue({ ids: [auditId] });
    const { runAuditInline } = await import("@/lib/audit/run-audit-inline");
    await runAuditInline(auditId);
    const completes = send.mock.calls.filter(
      (c) => (c[0] as { name?: string }).name === "audit.complete",
    );
    expect(completes).toEqual([
      [{ id: auditId, name: "audit.complete", data: { auditId, brandId, organizationId: ORG } }],
    ]);
    send.mockRestore();
  });
});
