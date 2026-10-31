/**
 * A closed workspace (organizations.deleted_at set) counts as absent
 * everywhere -- db/prod-fixes/0104 closes some on production. Every cron
 * that walks all organisations' brands, schedules or preferences, the
 * admin brand-classification sweep, alert emails and the public client
 * portal must skip it, while an open workspace seeded the same way is
 * still picked up (so a skip can't pass by accident).
 *
 * Runs each function's real selection against the e2e database. The step
 * runner runs the selection step for real and stops at the first
 * per-row step, so nothing is crawled, scored or emailed. The data
 * retention cron's residency refresh is observed, not run: it would
 * rewrite every org's residency rows in the database.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { refreshedResidency } = vi.hoisted(() => ({ refreshedResidency: [] as string[] }));
vi.mock("@/lib/governance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/governance")>()),
  recordDataResidency: async (organizationId: string) => {
    refreshedResidency.push(organizationId);
  },
}));
// Two of the brand crons are switched off until their checks are real;
// on here, so their selection runs at all.
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

const RUN = randomUUID().slice(0, 8);
type Seeded = {
  orgId: string;
  brandId: string;
  scheduleId: string;
  reportScheduleId: string;
  workflowRunId: string;
  portalToken: string;
};
const OPEN: Seeded = seedIds();
const CLOSED: Seeded = seedIds();

function seedIds(): Seeded {
  return {
    orgId: randomUUID(),
    brandId: randomUUID(),
    scheduleId: randomUUID(),
    reportScheduleId: randomUUID(),
    workflowRunId: randomUUID(),
    portalToken: `closed-ws-portal-${randomUUID()}`,
  };
}

let client: ReturnType<typeof postgres>;

async function seedWorkspace(ws: Seeded, label: string, closed: boolean) {
  const now = new Date();
  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug, tier, deleted_at)
    VALUES (${ws.orgId}, ${`closed-ws-${label}-${RUN}`}, ${`Closed-ws ${label}`}, ${`closed-ws-${label}-${RUN}`},
      'agency_pro', ${closed ? now : null})
  `;
  await client`
    INSERT INTO users (clerk_user_id, organization_id, email, name, role)
    VALUES (${`closed-ws-${label}-${RUN}`}, ${ws.orgId}, ${`owner-${label}-${RUN}@closed-ws.example.com.au`}, 'Owner', 'owner')
  `;
  await client`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ws.orgId}, ${`cus_closed_ws_${label}_${RUN}`}, ${`sub_closed_ws_${label}_${RUN}`}, 'price_closed_ws', 'agency_pro', 'monthly', 'active')
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, classification)
    VALUES (${ws.brandId}, ${ws.orgId}, ${`Closed-ws ${label} Co`}, ${`${label}-${RUN}.closed-ws.example.com.au`},
      'tradies', 'au', ARRAY[]::text[], NULL)
  `;
  await client`
    INSERT INTO audit_schedules (id, organization_id, brand_id, frequency, status, next_run_at)
    VALUES (${ws.scheduleId}, ${ws.orgId}, ${ws.brandId}, 'daily', 'active', now() - interval '1 hour')
  `;
  await client`
    INSERT INTO notification_preferences (organization_id, weekly_digest, digest_email, email_on_drift)
    VALUES (${ws.orgId}, true, ${`digest-${label}-${RUN}@closed-ws.example.com.au`}, true)
  `;
  // Due this hour, today (the cron's own UTC clock).
  await client`
    INSERT INTO report_delivery_schedules (id, organization_id, brand_id, frequency, day_of_week, time_of_day, recipient_emails, is_active)
    VALUES (${ws.reportScheduleId}, ${ws.orgId}, ${ws.brandId}, 'weekly', ${now.getUTCDay()},
      ${`${now.getUTCHours().toString().padStart(2, "0")}:00`}, ${client.json([`reports-${label}@closed-ws.example.com.au`])}, true)
  `;
  await client`
    INSERT INTO workflow_runs (id, organization_id, brand_id, workflow_type, status, scheduled_for)
    VALUES (${ws.workflowRunId}, ${ws.orgId}, ${ws.brandId}, 'full_audit', 'scheduled', now() - interval '1 hour')
  `;
  await client`
    INSERT INTO client_portal_invites (organization_id, brand_id, invite_token, expires_at)
    VALUES (${ws.orgId}, ${ws.brandId}, ${ws.portalToken}, now() + interval '7 days')
  `;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  await seedWorkspace(OPEN, "open", false);
  await seedWorkspace(CLOSED, "closed", true);
});

afterAll(async () => {
  const orgIds = [OPEN.orgId, CLOSED.orgId];
  for (const table of [
    "client_portal_invites",
    "workflow_runs",
    "report_delivery_schedules",
    "notification_preferences",
    "audit_schedules",
    "brands",
    "subscriptions",
    "users",
  ]) {
    await client`DELETE FROM ${client(table)} WHERE organization_id = ANY(${orgIds})`;
  }
  await client`DELETE FROM organizations WHERE id = ANY(${orgIds})`;
  await client.end();
});

class StopAfterSelection extends Error {}

/**
 * Runs `fn` with a step runner that runs only `selection` for real and
 * stops at the next step; returns what the selection returned.
 */
async function selectionOf(fn: unknown, selection: string): Promise<unknown> {
  let picked: unknown;
  const step = {
    run: async (name: string, work: () => Promise<unknown>) => {
      if (name !== selection) throw new StopAfterSelection();
      picked = await work();
      return picked;
    },
    sleep: async () => {},
  };
  const handler = (fn as { fn: (ctx: { step: typeof step; event: object }) => Promise<unknown> })
    .fn;
  await handler({ step, event: { data: {} } }).catch((e: unknown) => {
    if (!(e instanceof StopAfterSelection)) throw e;
  });
  return picked;
}

/** The seeded rows' ids among a selection's rows. */
function seededIn(rows: unknown, key: string): string[] {
  const ids = (rows as Record<string, string>[]).map((r) => r[key]);
  return [OPEN, CLOSED].flatMap((ws) => Object.values(ws).filter((id) => ids.includes(id)));
}

describe("crons skip a closed workspace", () => {
  it("scheduled audits (audit-schedules-cron)", async () => {
    const { auditSchedulesCron } = await import("@/inngest/functions/audit-schedules-cron");
    const due = await selectionOf(auditSchedulesCron, "load-due");
    expect(seededIn(due, "id")).toEqual([OPEN.scheduleId]);
  });

  it("weekly digests (weekly-digest-cron)", async () => {
    const { weeklyDigestCron } = await import("@/inngest/functions/weekly-digest-cron");
    const optedIn = await selectionOf(weeklyDigestCron, "load-opted-in");
    expect(seededIn(optedIn, "organizationId")).toEqual([OPEN.orgId]);
  });

  it("scheduled report emails (send-scheduled-reports)", async () => {
    const { sendScheduledReports } = await import("@/inngest/functions/send-scheduled-reports");
    const due = await selectionOf(sendScheduledReports, "find-due-schedules");
    expect(seededIn(due, "id")).toEqual([OPEN.reportScheduleId]);
  });

  it("scheduled workflow runs (schedule-workflow-runs)", async () => {
    const { scheduleWorkflowRuns } = await import("@/inngest/functions/schedule-workflow-runs");
    const runs = await selectionOf(scheduleWorkflowRuns, "get-scheduled");
    expect(seededIn(runs, "id")).toEqual([OPEN.workflowRunId]);
  });

  it("data retention's residency refresh (audit-data-retention)", async () => {
    const { auditDataRetention } = await import("@/inngest/functions/audit-data-retention");
    const step = {
      // The purges delete old rows database-wide: not run here.
      run: async (name: string, work: () => Promise<unknown>) =>
        name === "refresh-data-residency" ? work() : {},
    };
    await (
      auditDataRetention as unknown as { fn: (ctx: { step: typeof step }) => Promise<unknown> }
    ).fn({ step });
    expect(refreshedResidency).toContain(OPEN.orgId);
    expect(refreshedResidency).not.toContain(CLOSED.orgId);
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
    const brands = await selectionOf(await load(), selection);
    expect(seededIn(brands, "id")).toEqual([OPEN.brandId]);
  });
});

describe("a closed workspace gets no alert emails, and its client portal is gone", () => {
  it("resolveNotificationRecipients: switched off for a closed workspace", async () => {
    const { resolveNotificationRecipients } = await import("@/lib/email/recipients");
    const open = await resolveNotificationRecipients(OPEN.orgId, "drift");
    expect(open.enabled).toBe(true);
    expect(open.recipients).toEqual([`owner-open-${RUN}@closed-ws.example.com.au`]);
    const closed = await resolveNotificationRecipients(CLOSED.orgId, "drift");
    expect(closed).toEqual({ enabled: false, recipients: [] });
  });

  it("client portal link: answers as if it never existed", async () => {
    const { GET } = await import("@/app/api/client-portal/verify/[token]/route");
    const verify = (token: string) =>
      GET(new Request(`http://localhost/api/client-portal/verify/${token}`), {
        params: Promise.resolve({ token }),
      });
    expect((await verify(OPEN.portalToken)).status).toBe(200);
    expect((await verify(CLOSED.portalToken)).status).toBe(404);
  });
});
