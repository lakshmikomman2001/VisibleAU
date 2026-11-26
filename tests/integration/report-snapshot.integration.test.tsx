/**
 * S01 part 7 (LLD 8.1.3, 8.1.7, appendix D): the report snapshot.
 * - report_v2 on: generation stores contents_snapshot (tier, page set, the actions it printed, the checks with their
 *   dates) and report_tier; rendering reads it.
 * - Editing an action, a note or an agency action after generating changes nothing on re-render ("Try again").
 * - report_v2 off: no snapshot, and a report without one (every report before S01) keeps today's rebuild.
 *
 * Fixture: NumbaTek #52's shape (0 of 40, the directories it cited), seeded by tests/helpers/report-fixture.ts.
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ReportDocument } from "@/lib/communication/pdf-builder";
import { collectPdfPages } from "@/tests/helpers/pdf-text";
import { type ReportFixture, seedReportFixture } from "@/tests/helpers/report-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const sql = postgres(getTestDatabaseUrl(), { max: 1 });
let fx: ReportFixture;
let itemId = "";

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
        directories: { "lorikeet-it.com.au": 27, "localbusinessguide.com.au": 9 },
      },
    ],
  });
  const [item] = await sql<{ id: string }[]>`
    INSERT INTO action_items (organization_id, brand_id, audit_id, recommendation_key, dimension, title, action,
      confidence_label, confidence_basis, expected_impact_score, status)
    VALUES (${fx.orgId}, ${fx.brandId}, ${fx.audits[52]}, 'finding-identity-not-verified', 'accuracy',
      'Verify your ABN', 'Add it.', 'confirmed', 'verified', 'medium', 'open')
    RETURNING id`;
  itemId = item.id;
  await sql`INSERT INTO report_action_choices (organization_id, brand_id, action_item_id, included, position, note)
    VALUES (${fx.orgId}, ${fx.brandId}, ${itemId}, true, 0, 'We will add it this week.')`;
  await sql`INSERT INTO agency_actions (organization_id, brand_id, title, priority, position)
    VALUES (${fx.orgId}, ${fx.brandId}, 'Ask five clients for reviews', 'high', 0)`;
}, 60_000);

afterAll(async () => {
  for (const table of [
    "report_action_choices",
    "agency_actions",
    "action_items",
    "org_feature_flags",
  ]) {
    await sql`DELETE FROM ${sql(table)} WHERE organization_id = ${fx.orgId}`;
  }
  await fx.cleanup();
  await sql.end();
});

async function setFlag(on: boolean) {
  await sql`DELETE FROM org_feature_flags WHERE organization_id = ${fx.orgId}`;
  if (on)
    await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled) VALUES (${fx.orgId}, 'report_v2', true)`;
}

/** What generate-narrative-report does: the report data, then (report_v2 on) its v2 contents and snapshot. */
async function generate(tier: "basic" | "standard" | "enhanced"): Promise<string> {
  const { withRlsContext } = await import("@/db/client");
  const { buildReportData } = await import("@/lib/reports/report-data");
  const { reportV2ForGeneration } = await import("@/lib/reports/report-v2");
  return withRlsContext(fx.orgId, async (tx) => {
    const data = await buildReportData(tx, {
      organizationId: fx.orgId,
      brandId: fx.brandId,
      periodType: "weekly",
      periodLabel: "2026-W47",
      auditId: fx.audits[52],
      sections: null,
    });
    if (!data) throw new Error("no report data");
    const v2 = await reportV2ForGeneration(tx, { data, tier, now: new Date() });
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO generated_reports (brand_id, organization_id, audit_id, report_type, period_label, narrative_text,
        headline, report_tier, contents_snapshot)
      VALUES (${fx.brandId}, ${fx.orgId}, ${fx.audits[52]}, 'weekly', '2026-W47', 'n', 'h', ${v2?.tier ?? "basic"},
        ${v2 ? sql.json(JSON.parse(JSON.stringify(v2.snapshot))) : null})
      RETURNING id`;
    return row.id;
  });
}

/** What render-report-pdf does (with serviceDb, as the job does). */
async function renderInput(reportId: string) {
  const { serviceDb } = await import("@/db/client");
  const { loadReportRenderData } = await import("@/lib/reports/report-render-input");
  const [r] = await sql<
    Array<{
      audit_id: string;
      period_label: string;
      contents_snapshot: unknown;
      report_tier: string;
    }>
  >`SELECT audit_id, period_label, contents_snapshot, report_tier FROM generated_reports WHERE id = ${reportId}`;
  const out = await loadReportRenderData(serviceDb, {
    organizationId: fx.orgId,
    brandId: fx.brandId,
    auditId: r.audit_id,
    periodType: "weekly",
    periodLabel: r.period_label,
    sections: null,
    contentsSnapshot: r.contents_snapshot,
  });
  return { ...out, row: r };
}

const pdfText = (data: Parameters<typeof ReportDocument>[0]["data"]) =>
  collectPdfPages(<ReportDocument data={data} />)
    .flat()
    .join("\n");

describe("the report snapshot", () => {
  it("report_v2 on: generation stores the snapshot and the tier; rendering reads it", async () => {
    await setFlag(true);
    const id = await generate("enhanced");
    const { data, fromSnapshot, row } = await renderInput(id);
    expect(fromSnapshot).toBe(true);
    expect(row.report_tier).toBe("enhanced");
    const snap = row.contents_snapshot as Record<string, unknown>;
    expect(snap).toMatchObject({
      schema: 1,
      basisAuditId: fx.audits[52],
      tier: "enhanced",
      tierName: "Enhanced",
    });
    // S01C part 3c, LLD amendment 62: "Standard and Enhanced run: ... Why, and what to do next; Over time; Beyond AI
    // answers (Enhanced); Method and notes."
    expect(snap.sections).toEqual([
      "cover",
      "summary",
      "engines",
      "google",
      "directories",
      "competitors",
      "next",
      "trend",
      "beyond_ai",
      "method",
    ]);
    expect((snap.agencyActions as Array<{ title: string }>).map((a) => a.title)).toEqual([
      "Ask five clients for reviews",
    ]);
    expect((snap.beyondAi as { identity: { status: string } }).identity.status).toBe("not_checked");
    expect(pdfText(data!)).toContain("Note from Possum Marketing: We will add it this week.");
  });

  it("editing an action, its note or an agency action afterwards never changes the re-render", async () => {
    await setFlag(true);
    const id = await generate("standard");
    const before = await renderInput(id);
    await sql`UPDATE action_items SET status = 'done', done_at = now() WHERE id = ${itemId}`;
    await sql`UPDATE report_action_choices SET note = 'Changed later.' WHERE action_item_id = ${itemId}`;
    await sql`UPDATE agency_actions SET title = 'A renamed agency action' WHERE organization_id = ${fx.orgId}`;
    const after = await renderInput(id);
    expect(after.data).toEqual(before.data);
    const text = pdfText(after.data!);
    expect(text).toContain("We will add it this week.");
    expect(text).not.toContain("Changed later.");
    expect(text).not.toContain("A renamed agency action");
    // Put the live rows back for the other cases.
    await sql`UPDATE action_items SET status = 'open', done_at = null WHERE id = ${itemId}`;
    await sql`UPDATE report_action_choices SET note = 'We will add it this week.' WHERE action_item_id = ${itemId}`;
    await sql`UPDATE agency_actions SET title = 'Ask five clients for reviews' WHERE organization_id = ${fx.orgId}`;
  });

  it("report_v2 off: no snapshot; a report without one rebuilds from live data, as today", async () => {
    await setFlag(false);
    const id = await generate("enhanced");
    const { data, fromSnapshot, row } = await renderInput(id);
    expect(row.contents_snapshot).toBeNull();
    expect(row.report_tier).toBe("basic");
    expect(fromSnapshot).toBe(false);
    expect(data?.v2).toBeUndefined();
    expect(pdfText(data!)).not.toContain("What we found, and what to do next");
  });
});
