/**
 * Team follow-ups (31 Oct), item 7 -- a deleted brand (brands.deleted_at set; deleting one is a soft
 * delete) is skipped by every cron and fan-out that walks brands, or rows that belong to a brand, through
 * one shared filter (db/open-workspace.ts liveBrandsOnly / ofLiveBrand) -- and deleting a brand pauses its
 * schedules in the same transaction. Each cron's real selection runs against the test database, with one
 * live and one deleted brand in the same open workspace: the live one is still picked up, the deleted one
 * isn't. Only email sending and storage links are stubbed.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { sentReports, digestBrands, currentUserMock } = vi.hoisted(() => ({
  sentReports: [] as string[],
  digestBrands: [] as string[][],
  currentUserMock: vi.fn(),
}));
// Two of the brand crons are switched off until their checks are real; on here, so their selection runs.
vi.mock("@/lib/trust/stub-implementation-status", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/trust/stub-implementation-status")>();
  return {
    ...real,
    TRUST_CHECK_IMPLEMENTED: {
      ...real.TRUST_CHECK_IMPLEMENTED,
      linkedinPresence: true,
      consensusScore: true,
    },
  };
});
vi.mock("@/lib/email/templates/scheduled-report", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/email/templates/scheduled-report")>();
  return {
    ...real,
    scheduledReportEmail: (input: Parameters<typeof real.scheduledReportEmail>[0]) => {
      sentReports.push(input.brandName);
      return real.scheduledReportEmail(input);
    },
  };
});
vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendEmailOrThrow: vi.fn(async () => ({ ok: true, id: "em_1" })),
}));
vi.mock("@/lib/storage", () => ({
  getStorage: () => ({ getDownloadUrl: async () => "https://files.example.com/report.pdf" }),
}));
vi.mock("@/lib/email/templates/weekly-digest", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/email/templates/weekly-digest")>();
  return {
    ...real,
    weeklyDigestEmail: (input: Parameters<typeof real.weeklyDigestEmail>[0]) => {
      digestBrands.push(input.brands.map((b) => b.brandName));
      return real.weeklyDigestEmail(input);
    },
  };
});
vi.mock("@/lib/digest/send", () => ({ sendDigestEmail: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: currentUserMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const RUN = randomUUID().slice(0, 8);
const ORG_ID = randomUUID();
const OWNER_ID = randomUUID();
type BrandRows = {
  brandId: string;
  scheduleId: string;
  reportScheduleId: string;
  workflowRunId: string;
  reportId: string;
  auditId: string;
};
const ids = (): BrandRows => ({
  brandId: randomUUID(),
  scheduleId: randomUUID(),
  reportScheduleId: randomUUID(),
  workflowRunId: randomUUID(),
  reportId: randomUUID(),
  auditId: randomUUID(),
});
const LIVE = ids();
const DELETED = ids();
/** Deleted through the route in the last test. */
const DOOMED = ids();
const ORG_WIDE_SCHEDULE_ID = randomUUID();
let nextAuditNumber = 1;

let sql: ReturnType<typeof postgres>;

async function seedBrand(rows: BrandRows, label: string, deleted: boolean) {
  const now = new Date();
  await sql`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, classification, deleted_at)
    VALUES (${rows.brandId}, ${ORG_ID}, ${`Deleted-brand ${label} Co`}, ${`${label}-${RUN}.deleted-brand.example.com.au`},
      'tradies', 'au', ARRAY[]::text[], NULL, ${deleted ? now : null})
  `;
  await sql`
    INSERT INTO audit_schedules (id, organization_id, brand_id, frequency, status, next_run_at)
    VALUES (${rows.scheduleId}, ${ORG_ID}, ${rows.brandId}, 'daily', 'active', now() - interval '1 hour')
  `;
  // Due this hour, today (the cron's own UTC clock).
  await sql`
    INSERT INTO report_delivery_schedules (id, organization_id, brand_id, frequency, day_of_week, time_of_day, recipient_emails, is_active)
    VALUES (${rows.reportScheduleId}, ${ORG_ID}, ${rows.brandId}, 'weekly', ${now.getUTCDay()},
      ${`${now.getUTCHours().toString().padStart(2, "0")}:00`}, ${sql.json([`reports-${label}-${RUN}@deleted-brand.example.com.au`])}, true)
  `;
  await sql`
    INSERT INTO workflow_runs (id, organization_id, brand_id, workflow_type, status, scheduled_for)
    VALUES (${rows.workflowRunId}, ${ORG_ID}, ${rows.brandId}, 'full_audit', 'scheduled', now() - interval '1 hour')
  `;
  await sql`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, engines, engine_count, prompts_count, runs_per_prompt, total_calls, started_at, completed_at)
    VALUES (${rows.auditId}, ${rows.brandId}, ${ORG_ID}, ${nextAuditNumber++}, 'manual', 'complete', ${["chatgpt"]}, 1, 10, 1, 10, now() - interval '1 day', now() - interval '1 day')
  `;
  await sql`
    INSERT INTO generated_reports (id, brand_id, organization_id, report_type, narrative_text, headline, pdf_url)
    VALUES (${rows.reportId}, ${rows.brandId}, ${ORG_ID}, 'weekly', 'Narrative', ${`${label} headline`}, ${`reports/${rows.reportId}.pdf`})
  `;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug, tier)
    VALUES (${ORG_ID}, ${`deleted-brand-${RUN}`}, 'Deleted-brand Org', ${`deleted-brand-${RUN}`}, 'agency_pro')
  `;
  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${OWNER_ID}, ${`deleted-brand-${RUN}`}, ${ORG_ID}, ${`owner-${RUN}@deleted-brand.example.com.au`}, 'Owner', 'owner')
  `;
  await sql`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${ORG_ID}, ${OWNER_ID}, 'owner', now(), now(), true)
  `;
  await sql`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG_ID}, ${`cus_deleted_brand_${RUN}`}, ${`sub_deleted_brand_${RUN}`}, 'price_deleted_brand', 'agency_pro', 'monthly', 'active')
  `;
  await sql`
    INSERT INTO notification_preferences (organization_id, weekly_digest, digest_email)
    VALUES (${ORG_ID}, true, ${`digest-${RUN}@deleted-brand.example.com.au`})
  `;
  await seedBrand(LIVE, "live", false);
  await seedBrand(DELETED, "deleted", true);
  await seedBrand(DOOMED, "doomed", false);
}, 60000);

afterAll(async () => {
  for (const table of [
    "generated_reports",
    "audits",
    "workflow_runs",
    "report_delivery_schedules",
    "notification_preferences",
    "audit_schedules",
    "audit_trail",
    "brands",
    "org_members",
    "subscriptions",
    "users",
  ]) {
    await sql`DELETE FROM ${sql(table)} WHERE organization_id = ${ORG_ID}`;
  }
  await sql`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await sql.end();
});

class Skipped extends Error {}

/**
 * Runs `fn` with a step runner that runs the named steps for real (the rest are skipped: undefined, or
 * stop at the first one not named when `stopAtOthers`); returns what each named step returned.
 */
async function runSteps(
  fn: unknown,
  steps: (name: string) => boolean,
  stopAtOthers = true,
): Promise<Map<string, unknown>> {
  const results = new Map<string, unknown>();
  const step = {
    run: async (name: string, work: () => Promise<unknown>) => {
      if (!steps(name)) {
        if (stopAtOthers) throw new Skipped();
        return undefined;
      }
      const result = await work();
      results.set(name, result);
      return result;
    },
    sleep: async () => {},
    sendEvent: async () => ({ ids: [] }),
  };
  const handler = (fn as { fn: (ctx: { step: typeof step; event: object }) => Promise<unknown> })
    .fn;
  await handler({ step, event: { data: {} } }).catch((e: unknown) => {
    if (!(e instanceof Skipped)) throw e;
  });
  return results;
}

/** Which of this test's rows a selection's rows include. */
function picked(rows: unknown, key: string, ...wanted: BrandRows[]): string[] {
  const found = new Set((rows as Record<string, string>[]).map((r) => r[key]));
  return [LIVE, DELETED, DOOMED].flatMap((b) =>
    Object.values(b).filter((id) => found.has(id) && wanted.includes(b)),
  );
}
const ofThisTest = (rows: unknown, key: string) => picked(rows, key, LIVE, DELETED);

describe("crons and fan-outs skip a deleted brand, and still pick up a live one", () => {
  it("scheduled audits (audit-schedules-cron)", async () => {
    const { auditSchedulesCron } = await import("@/inngest/functions/audit-schedules-cron");
    const due = (await runSteps(auditSchedulesCron, (n) => n === "load-due")).get("load-due");
    expect(ofThisTest(due, "id")).toEqual([LIVE.scheduleId]);
  });

  it("scheduled workflow runs (schedule-workflow-runs)", async () => {
    const { scheduleWorkflowRuns } = await import("@/inngest/functions/schedule-workflow-runs");
    const runs = (await runSteps(scheduleWorkflowRuns, (n) => n === "get-scheduled")).get(
      "get-scheduled",
    );
    expect(ofThisTest(runs, "id")).toEqual([LIVE.workflowRunId]);
  });

  it("scheduled report emails (send-scheduled-reports): a deleted brand's schedule isn't due", async () => {
    const { sendScheduledReports } = await import("@/inngest/functions/send-scheduled-reports");
    const due = (await runSteps(sendScheduledReports, (n) => n === "find-due-schedules")).get(
      "find-due-schedules",
    );
    expect(ofThisTest(due, "id")).toEqual([LIVE.reportScheduleId]);
  });

  it("a workspace-wide report schedule sends the live brand's report, not the deleted one's", async () => {
    const now = new Date();
    await sql`
      INSERT INTO report_delivery_schedules (id, organization_id, brand_id, frequency, day_of_week, time_of_day, recipient_emails, is_active)
      VALUES (${ORG_WIDE_SCHEDULE_ID}, ${ORG_ID}, NULL, 'weekly', ${now.getUTCDay()},
        ${`${now.getUTCHours().toString().padStart(2, "0")}:00`}, ${sql.json([`all-${RUN}@deleted-brand.example.com.au`])}, true)
    `;
    try {
      sentReports.length = 0;
      const { sendScheduledReports } = await import("@/inngest/functions/send-scheduled-reports");
      await runSteps(
        sendScheduledReports,
        (n) => n === "find-due-schedules" || n === `send-${ORG_WIDE_SCHEDULE_ID}`,
        false,
      );
      expect(sentReports).toContain("Deleted-brand live Co");
      expect(sentReports).not.toContain("Deleted-brand deleted Co");
    } finally {
      await sql`DELETE FROM report_delivery_schedules WHERE id = ${ORG_WIDE_SCHEDULE_ID}`;
    }
  });

  it("the weekly digest lists the live brand's audit, not the deleted one's (weekly-digest-cron)", async () => {
    // The brand-scoped weekly schedules above would take these brands out of the digest (EM-01).
    await sql`UPDATE report_delivery_schedules SET is_active = false WHERE organization_id = ${ORG_ID}`;
    try {
      digestBrands.length = 0;
      const { weeklyDigestCron } = await import("@/inngest/functions/weekly-digest-cron");
      await runSteps(
        weeklyDigestCron,
        (n) => n === "load-opted-in" || n === `digest-${ORG_ID}`,
        false,
      );
      expect(digestBrands).toHaveLength(1);
      expect(digestBrands[0]).toContain("Deleted-brand live Co");
      expect(digestBrands[0]).not.toContain("Deleted-brand deleted Co");
    } finally {
      await sql`UPDATE report_delivery_schedules SET is_active = true WHERE organization_id = ${ORG_ID}`;
    }
  });

  it.each([
    [
      "audit-youtube-presence",
      "load-brands",
      async () =>
        (await import("@/inngest/functions/audit-youtube-presence")).auditYoutubePresenceFn,
    ],
    [
      "audit-linkedin-presence",
      "load-brands",
      async () =>
        (await import("@/inngest/functions/audit-linkedin-presence")).auditLinkedinPresenceFn,
    ],
    [
      "check-cross-platform-consensus",
      "load-brands",
      async () =>
        (await import("@/inngest/functions/check-cross-platform-consensus"))
          .checkCrossPlatformConsensusFn,
    ],
    [
      "content-structure-audit",
      "load-brands",
      async () =>
        (await import("@/inngest/functions/content-structure-audit")).contentStructureAuditFn,
    ],
    [
      "llmstxt-refresh",
      "load-brands",
      async () => (await import("@/inngest/functions/llmstxt-refresh")).llmstxtRefreshFn,
    ],
    [
      "track-brand-web-mentions",
      "load-brands",
      async () =>
        (await import("@/inngest/functions/track-brand-web-mentions")).trackBrandWebMentionsFn,
    ],
    [
      "classify-existing-brands (the admin backfill's sweep)",
      "fetch-unclassified",
      async () =>
        (await import("@/inngest/functions/classify-existing-brands")).classifyExistingBrands,
    ],
  ] as const)("brand sweep: %s", async (_name, selection, load) => {
    const brands = (await runSteps(await load(), (n) => n === selection)).get(selection);
    expect(ofThisTest(brands, "id")).toEqual([LIVE.brandId]);
  });
});

describe("the agency's bulk re-audit, a fan-out over brands picked by hand", () => {
  function signInOwner() {
    currentUserMock.mockResolvedValue({
      id: OWNER_ID,
      organizationId: ORG_ID,
      email: `owner-${RUN}@deleted-brand.example.com.au`,
      name: "Owner",
      role: "owner",
      organization: { id: ORG_ID, name: "Deleted-brand Org" },
    });
  }

  async function bulkReaudit(brandIds: string[]) {
    const { POST } = await import("@/app/api/agency/bulk-reaudit/route");
    const res = await POST(
      new Request("http://localhost:3000/api/agency/bulk-reaudit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brandIds }),
      }),
    );
    return res.status;
  }

  it("refuses a deleted brand, as if it weren't there, and starts nothing", async () => {
    signInOwner();
    const { inngest } = await import("@/lib/inngest/client");
    const send = vi.spyOn(inngest, "send").mockResolvedValue({ ids: [] } as never);
    try {
      expect(await bulkReaudit([LIVE.brandId, DELETED.brandId])).toBe(404);
      expect(send).not.toHaveBeenCalled();
      expect(await bulkReaudit([LIVE.brandId])).toBe(202);
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      send.mockRestore();
      await sql`DELETE FROM bulk_operations WHERE organization_id = ${ORG_ID}`;
    }
  });
});

describe("deleting a brand pauses its schedules, in the same transaction", () => {
  it("its audit schedule is paused, saying why, and its report schedule is switched off", async () => {
    currentUserMock.mockResolvedValue({
      id: OWNER_ID,
      organizationId: ORG_ID,
      email: `owner-${RUN}@deleted-brand.example.com.au`,
      name: "Owner",
      role: "owner",
      organization: { id: ORG_ID, name: "Deleted-brand Org" },
    });
    const { DELETE } = await import("@/app/api/brands/[brandId]/route");
    const res = await DELETE(
      new Request(`http://localhost:3000/api/brands/${DOOMED.brandId}`, { method: "DELETE" }),
      { params: Promise.resolve({ brandId: DOOMED.brandId }) },
    );
    expect(res.status).toBe(204);

    const [brand] = await sql<{ deleted_at: Date | null }[]>`
      SELECT deleted_at FROM brands WHERE id = ${DOOMED.brandId}
    `;
    expect(brand.deleted_at).not.toBeNull();
    const [schedule] = await sql<{ status: string; paused_reason: string | null }[]>`
      SELECT status, paused_reason FROM audit_schedules WHERE id = ${DOOMED.scheduleId}
    `;
    expect(schedule).toEqual({ status: "paused", paused_reason: "Brand deleted" });
    const [report] = await sql<{ is_active: boolean }[]>`
      SELECT is_active FROM report_delivery_schedules WHERE id = ${DOOMED.reportScheduleId}
    `;
    expect(report.is_active).toBe(false);
    // The live brand's schedules are untouched.
    const [live] = await sql<{ status: string }[]>`
      SELECT status FROM audit_schedules WHERE id = ${LIVE.scheduleId}
    `;
    expect(live.status).toBe("active");
  });
});
