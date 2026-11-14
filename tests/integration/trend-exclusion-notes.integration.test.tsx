/**
 * 15 Nov, part 3 (Sri's review of audit #50):
 * - An audit excluded from trends inside the PDF trend's window is named, with why, in the chart's caption and in
 *   section 08's "What's excluded". The 14 Nov report said the caption names it; it didn't: the PDF built its own
 *   caption and only trendLines (no PDF) had the line. One outside the window (the chart full of later audits)
 *   isn't named, as no counted audit there would be shown.
 * - Sri's decision: every exclusion and re-inclusion is also in that workspace's own Audit Trail ("Vunnara excluded
 *   audit #46 from trends: measured with an earlier version of the mention check"), written through the normal
 *   audit-trail path (recordAction) on the change's own transaction under the workspace's RLS context, as the
 *   app's role (visibleau_app, NOBYPASSRLS) -- the connection here is that role, as in production.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { EARLIER_MENTION_CHECK_REASON } from "@/lib/audit/trend-exclusion";
import { assertLocalSafeDatabaseUrl } from "@/scripts/db/local-db-guard";
import { collectPdfText } from "@/tests/helpers/pdf-text";
import { type ReportFixture, seedReportFixture } from "@/tests/helpers/report-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { session, trailWrites } = vi.hoisted(() => ({
  session: { organizationId: "", userId: "" },
  trailWrites: [] as Array<{ db: unknown }>,
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: session.userId,
    organizationId: session.organizationId,
    role: "owner",
    organization: { id: session.organizationId, name: "Hero Org", metadata: {} },
  })),
}));
vi.mock("@/lib/auth/platform-admin", () => ({
  checkPlatformAdmin: vi.fn(async () => ({ allowed: true, userId: "op-1" })),
  isPlatformAdmin: vi.fn(async () => true),
}));
// The trail's write path, as is -- and which connection each write went on.
vi.mock("@/lib/governance/audit-trail", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/governance/audit-trail")>();
  return {
    ...actual,
    recordAction: vi.fn(async (...args: Parameters<typeof actual.recordAction>) => {
      trailWrites.push({ db: args[1] });
      return actual.recordAction(...args);
    }),
  };
});

const EXCLUDED = `Vunnara excluded audit #46 from trends: ${EARLIER_MENTION_CHECK_REASON}`;
const INCLUDED = `Vunnara included audit #46 in trends again (it was excluded: ${EARLIER_MENTION_CHECK_REASON})`;
const CAPTION_46 = `Audit #46 is left out of this chart and every comparison: ${EARLIER_MENTION_CHECK_REASON}.`;

let su: ReturnType<typeof postgres>;
let hero: ReportFixture;
let long: ReportFixture;

function appRoleUrl(): string {
  const base = new URL(getTestDatabaseUrl());
  base.username = "visibleau_app";
  base.password = "visibleau_app_dev";
  const url = base.toString();
  assertLocalSafeDatabaseUrl(url);
  return url;
}

const day = (n: number) => new Date(Date.UTC(2026, 10, n, 1)).toISOString();

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  su = postgres(url, { max: 1 });
  // The app's connection is the RLS-enforced role; the service connection (cross-workspace reads) the owner's.
  process.env.DATABASE_URL = appRoleUrl();
  process.env.SERVICE_DATABASE_URL = url;

  hero = await seedReportFixture(su, {
    brandName: "Hero Home Services",
    audits: [
      { number: 46, completedAt: day(3), mentions: {} },
      { number: 47, completedAt: day(10), mentions: { chatgpt: [1, 2, 3], perplexity: [1, 2] } },
      { number: 48, completedAt: day(13), mentions: { chatgpt: [1, 2], claude: [1, 2] } },
    ],
  });
  // Eleven audits, a day apart: #1 and #6 excluded. Nine count, the chart shows the latest eight (#3-#11).
  long = await seedReportFixture(su, {
    brandName: "Long History Plumbing",
    audits: Array.from({ length: 11 }, (_, i) => ({
      number: i + 1,
      completedAt: day(i + 1),
      mentions: { chatgpt: [1, 2], perplexity: [1] },
    })),
  });
  for (const n of [1, 6]) {
    await su`UPDATE audits SET excluded_from_trends_reason = 'the brand''s name was misspelt' WHERE id = ${long.audits[n]}`;
  }

  // The workspace's owner, who reads its Audit Trail.
  session.organizationId = hero.orgId;
  session.userId = randomUUID();
  await su`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${session.userId}, ${`trail-${session.userId}`}, ${hero.orgId},
            ${`owner-${session.userId.slice(0, 8)}@hero.example.com.au`}, 'Olive Owner', 'owner')
  `;
  await su`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${hero.orgId}, ${session.userId}, 'owner', now(), now(), true)
  `;
}, 180_000);

afterAll(async () => {
  await su`DELETE FROM feature_setting_changes WHERE target_brand_id IN (${hero.brandId}, ${long.brandId})`;
  await su`DELETE FROM org_members WHERE organization_id = ${hero.orgId}`;
  await su`DELETE FROM audit_trail WHERE organization_id = ${hero.orgId}`;
  await su`DELETE FROM users WHERE id = ${session.userId}`;
  await hero?.cleanup();
  await long?.cleanup();
  await su.end();
});

async function report(fx: ReportFixture, basis: number, periodLabel: string) {
  const { serviceDb } = await import("@/db/client");
  const { buildReportData } = await import("@/lib/reports/report-data");
  const data = await buildReportData(serviceDb, {
    organizationId: fx.orgId,
    brandId: fx.brandId,
    periodType: "weekly",
    periodLabel,
    auditId: fx.audits[basis],
    now: new Date("2026-11-15T00:00:00.000Z"),
  });
  if (!data) throw new Error("no report data");
  return data;
}

async function pdfText(data: Awaited<ReturnType<typeof report>>): Promise<string> {
  const { ReportDocument } = await import("@/lib/reports/pdf/report-document");
  return collectPdfText(createElement(ReportDocument, { data })).join("\n");
}

describe("the report PDF names an excluded audit in its trend's window", () => {
  it("Hero: #46 excluded, in the window -- the caption and section 08 say so", async () => {
    await su`UPDATE audits SET excluded_from_trends_reason = ${EARLIER_MENTION_CHECK_REASON} WHERE id = ${hero.audits[46]}`;
    try {
      const data = await report(hero, 48, "2026-W46");
      expect(data.trend.points.map((p) => p.auditNumber)).toEqual([47, 48]);
      expect(data.trend.excluded).toEqual([
        { auditNumber: 46, reason: EARLIER_MENTION_CHECK_REASON },
      ]);
      const pdf = await pdfText(data);
      expect(pdf).toContain(CAPTION_46);
      expect(pdf).toContain(
        `Audits Vunnara excluded from trends, from the chart and every comparison (#46: ${EARLIER_MENTION_CHECK_REASON})`,
      );
    } finally {
      await su`UPDATE audits SET excluded_from_trends_reason = NULL WHERE id = ${hero.audits[46]}`;
    }
  }, 60_000);

  it("none excluded: section 08 still says what would be", async () => {
    const pdf = await pdfText(await report(hero, 48, "2026-W46"));
    expect(pdf).toContain(
      "Audits Vunnara excluded from trends, with the reason (none in this report)",
    );
    expect(pdf).not.toContain("is left out of this chart");
  }, 60_000);

  it("outside the window it isn't named: #1 is older than the chart's eight; #6, inside, is", async () => {
    const data = await report(long, 11, "2026-W46");
    expect(data.trend.points.map((p) => p.auditNumber)).toEqual([3, 4, 5, 7, 8, 9, 10, 11]);
    expect(data.trend.leftOut).toBe(1);
    expect(data.trend.excluded).toEqual([
      { auditNumber: 6, reason: "the brand's name was misspelt" },
    ]);
    const pdf = await pdfText(data);
    expect(pdf).toContain(
      "Audit #6 is left out of this chart and every comparison: the brand's name was misspelt.",
    );
    expect(pdf).not.toContain("Audit #1 is left out");
  }, 60_000);
});

describe("the workspace's Audit Trail: every exclusion and re-inclusion", () => {
  async function adminPost(body: unknown): Promise<Response> {
    const { POST } = await import("@/app/api/admin/audits/route");
    return POST(
      new Request("http://localhost/api/admin/audits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }

  interface Entry {
    id: string;
    action: string;
    resourceType: string;
    resourceId: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
    actor: { id: string; name: string | null; email: string | null } | null;
  }

  async function trail(): Promise<Entry[]> {
    const { GET } = await import("@/app/api/organizations/[orgId]/audit-trail/route");
    const res = await GET(
      new Request(`http://localhost/api/organizations/${hero.orgId}/audit-trail`),
      {
        params: Promise.resolve({ orgId: hero.orgId }),
      },
    );
    expect(res.status).toBe(200);
    return ((await res.json()) as { entries: Entry[] }).entries;
  }

  async function shown(entry: Entry): Promise<string> {
    const { AuditLogRow } = await import("@/components/domain/governance/audit-log-row");
    return renderToStaticMarkup(createElement(AuditLogRow, { entry })).replace(/&#x27;/g, "'");
  }

  it("exclude, then include again: two entries, each saying what Vunnara did, written under the workspace's RLS", async () => {
    const { serviceDb } = await import("@/db/client");
    trailWrites.length = 0;

    const saved = await adminPost({
      auditId: hero.audits[46],
      reason: EARLIER_MENTION_CHECK_REASON,
    });
    expect(await saved.json()).toMatchObject({ status: "saved" });
    // Repeating it changes nothing, so it isn't in the trail again.
    const again = await adminPost({
      auditId: hero.audits[46],
      reason: EARLIER_MENTION_CHECK_REASON,
    });
    expect(await again.json()).toMatchObject({ status: "unchanged" });
    const included = await adminPost({ auditId: hero.audits[46], reason: null });
    expect(await included.json()).toMatchObject({ status: "saved" });

    const entries = (await trail()).filter((e) => e.action === "trend_exclusion_changed");
    expect(entries.map((e) => e.metadata?.summary)).toEqual([INCLUDED, EXCLUDED]);
    for (const e of entries) {
      expect(e).toMatchObject({ resourceType: "audit", resourceId: hero.audits[46], actor: null });
      expect(e.metadata).toMatchObject({ auditNumber: 46, changedBy: "Vunnara" });
    }
    const row = await shown(entries[1]);
    expect(row).toContain(EXCLUDED);
    expect(row).toContain("by Vunnara");
    expect(row).not.toContain("System");

    // Both on the change's own transaction (withRlsContext, the app's role), never the service connection.
    expect(trailWrites).toHaveLength(2);
    for (const w of trailWrites) {
      expect(w.db).toBeDefined();
      expect(w.db).not.toBe(serviceDb);
    }
  }, 120_000);

  it("the app's connection really is the RLS-enforced role", async () => {
    const app = postgres(appRoleUrl(), { max: 1 });
    try {
      const [role] = await app<{ rolbypassrls: boolean; rolsuper: boolean }[]>`
        SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user
      `;
      expect(role).toEqual({ rolbypassrls: false, rolsuper: false });
      // Without the workspace's context, its trail isn't visible.
      const rows = await app`SELECT id FROM audit_trail WHERE organization_id = ${hero.orgId}`;
      expect(rows).toHaveLength(0);
    } finally {
      await app.end();
    }
  });
});
