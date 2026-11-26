/**
 * S01 part 5 (LLD 8.1.3): the "What to do next" data, from a real audit, with the audit page's own functions.
 * - Measured actions are the basis audit's findings (the audit page's "from this audit") with their evidence and the
 *   audit number, joined to an Action Center item when there is one (its status; the agency's choice is saved on it).
 * - Agency and up: saved order, hidden items, notes, agency actions, toggles. Growth: priority order, no curation.
 * - Done since the last report: items done after the brand's previous generated report.
 * - Generate saves the panel's contents as the brand's choices (Agency, report_v2 on); off, it changes nothing.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type ReportFixture, seedReportFixture } from "@/tests/helpers/report-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const who = vi.hoisted(() => ({ orgId: "", userId: "" }));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: who.userId,
    organizationId: who.orgId,
    role: "owner",
    organization: { id: who.orgId, name: "Possum Marketing", region: "au", metadata: {} },
  })),
}));
vi.mock("@/lib/inngest/client", () => ({ inngest: { send: vi.fn(async () => ({ ids: [] })) } }));

const sql = postgres(getTestDatabaseUrl(), { max: 1 });
let fx: ReportFixture;
let identityItem = "";

beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
  fx = await seedReportFixture(sql, {
    brandName: "NumbaTek IT",
    tier: "agency",
    agencyName: "Possum Marketing",
    audits: [
      {
        number: 52,
        completedAt: "2026-11-20T03:00:00.000Z",
        mentions: {},
        directories: { "lorikeet-it.com.au": 27, "localbusinessguide.com.au": 9, "cylex-australia.com": 2 },
      },
    ],
  });
  const [user] = await sql<{ id: string }[]>`
    INSERT INTO users (clerk_user_id, organization_id, email, name, role)
    VALUES (${`wtdn-${fx.orgId}`}, ${fx.orgId}, ${`owner-${fx.orgId.slice(0, 8)}@wtdn.example.com.au`}, 'Owner', 'owner')
    RETURNING id`;
  await sql`INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${fx.orgId}, ${user.id}, 'owner', now(), now(), true)`;
  who.orgId = fx.orgId;
  who.userId = user.id;
  await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled) VALUES (${fx.orgId}, 'report_v2', true)`;
  const [item] = await sql<{ id: string }[]>`
    INSERT INTO action_items (organization_id, brand_id, audit_id, recommendation_key, dimension, title, action,
      confidence_label, confidence_basis, expected_impact_score, status)
    VALUES (${fx.orgId}, ${fx.brandId}, ${fx.audits[52]}, 'finding-identity-not-verified', 'accuracy',
      'Verify your ABN', 'Add it.', 'confirmed', 'verified', 'medium', 'in_progress')
    RETURNING id`;
  identityItem = item.id;
  // A report generated on 15 Nov; one item done after it, one before.
  await sql`INSERT INTO generated_reports (brand_id, organization_id, report_type, narrative_text, headline, created_at)
    VALUES (${fx.brandId}, ${fx.orgId}, 'weekly', 'n', 'h', '2026-11-15T00:00:00Z')`;
  for (const [title, doneAt] of [
    ["Claim your Google Business Profile", "2026-11-18T00:00:00Z"],
    ["Fix the old footer link", "2026-11-10T00:00:00Z"],
  ] as const) {
    await sql`INSERT INTO action_items (organization_id, brand_id, recommendation_key, dimension, title, action,
      confidence_label, expected_impact_score, status, done_at)
      VALUES (${fx.orgId}, ${fx.brandId}, ${`done-${title.length}`}, 'frequency', ${title}, 'Done.', 'likely', 'low', 'done', ${doneAt})`;
  }
  await sql`INSERT INTO agency_actions (organization_id, brand_id, title, priority, position)
    VALUES (${fx.orgId}, ${fx.brandId}, 'Ask five clients for reviews', 'high', 0)`;
}, 60_000);

afterAll(async () => {
  for (const table of ["report_action_choices", "report_brand_preferences", "agency_actions", "action_items", "org_feature_flags", "generated_reports", "org_members"]) {
    await sql`DELETE FROM ${sql(table)} WHERE organization_id = ${fx.orgId}`;
  }
  await sql`DELETE FROM users WHERE organization_id = ${fx.orgId}`;
  await fx.cleanup();
  await sql.end();
});

async function view() {
  const { withRlsContext } = await import("@/db/client");
  const { buildReportContentsView } = await import("@/lib/reports/report-contents-view");
  return withRlsContext(fx.orgId, (tx) =>
    buildReportContentsView(tx, {
      organizationId: fx.orgId,
      brandId: fx.brandId,
      now: new Date("2026-11-21T00:00:00Z"),
    }),
  );
}

describe("the What to do next data", () => {
  it("measured actions are the audit's findings, with evidence and the audit number, joined to their items", async () => {
    const v = await view();
    if (!v.enabled || !v.whatToDoNext) throw new Error("expected the panel's view");
    expect(v).toMatchObject({ curated: true, basis: { auditNumber: 52 } });
    const titles = v.whatToDoNext.measured.map((m) => m.title);
    expect(titles).toEqual([
      "See why AI recommends other providers",
      // S01C parts 2a and 2c, LLD amendments 59 and 61: rule i's "Link or create your {A} and {B} profiles", and rule
      // j's title by cause ("Add your ABN" plus " and link your Google Business Profile" when that's missing too).
      "Link or create your Local Business Guide and Cylex profiles",
      "Add your ABN and link your Google Business Profile",
    ]);
    const identity = v.whatToDoNext.measured[2];
    expect(identity).toMatchObject({ actionItemId: identityItem, status: "in_progress" });
    expect(v.whatToDoNext.measured[0]).toMatchObject({ actionItemId: null, status: "open", included: true });
    for (const m of v.whatToDoNext.measured) expect(m.evidence.endsWith(" · audit #52")).toBe(true);
    expect(v.whatToDoNext.doneSinceLast).toEqual([
      { title: "Claim your Google Business Profile", doneAt: "2026-11-18" },
    ]);
    expect(v.whatToDoNext.agencyActions.map((a) => a.title)).toEqual(["Ask five clients for reviews"]);
  });

  it("Generate saves the panel's contents as the brand's choices; the next view uses them", async () => {
    const { POST } = await import("@/app/api/brands/[brandId]/reports/generate/route");
    const res = await POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({
          periodType: "weekly",
          contents: {
            includeGeneralAdvice: false,
            choices: [{ actionItemId: identityItem, included: false, position: 0, note: "Waiting on the ABR" }],
          },
        }),
      }),
      { params: Promise.resolve({ brandId: fx.brandId }) },
    );
    expect(res.status).toBe(202);
    const v = await view();
    if (!v.enabled || !v.whatToDoNext) throw new Error("expected the panel's view");
    expect(v.whatToDoNext.measured[0]).toMatchObject({
      actionItemId: identityItem,
      included: false,
      note: "Waiting on the ABR",
    });
    expect(v.whatToDoNext.includeGeneralAdvice).toBe(false);
  });

  it("Growth: the same actions, in priority order, uncurated", async () => {
    await sql`UPDATE subscriptions SET tier = 'growth' WHERE organization_id = ${fx.orgId}`;
    try {
      const v = await view();
      if (!v.enabled || !v.whatToDoNext) throw new Error("expected the panel's view");
      expect(v.curated).toBe(false);
      expect(v.whatToDoNext.measured.every((m) => m.included && m.note === null)).toBe(true);
      // S01C part 2c, LLD amendment 61: rule j's title follows its cause (no ABN, no profile).
      expect(v.whatToDoNext.measured.map((m) => m.title)[2]).toBe(
        "Add your ABN and link your Google Business Profile",
      );
      expect(v.whatToDoNext.agencyActions).toEqual([]);
    } finally {
      await sql`UPDATE subscriptions SET tier = 'agency' WHERE organization_id = ${fx.orgId}`;
    }
  });
});
