/**
 * S04 part 7 (LLD 8.4.6; contract P07.score, P07.reachRow, P09.reachRow): an audit's reaches on the audit page and in
 * the report, from audit_reach_results.
 * - visibility_reach off: the audit page is as before (no reach label, no reach row), and so is the report.
 * - On, with Local, NSW and Australia: the headline line ends " · across Local, NSW and Australia"; "Where AI recommends
 *   you" with one tile per reach in reach order ("Local · Castle Hill 20%", "6 of 30 answers · 95% CI ..."); the report's
 *   data and snapshot carry the reaches (headline.reaches, its label, reaches[]) and the Summary page prints the row.
 * - On, with Local alone: the label "Local · Castle Hill" and no row.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { IRONSTONE, type SeededReportBrand, seedReportBrand } from "@/tests/helpers/report-seeds";
import { renderSeededReport } from "@/tests/helpers/seeded-report-render";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { session } = vi.hoisted(() => ({ session: { organizationId: "" } }));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({ organizationId: session.organizationId })),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

let sql: ReturnType<typeof postgres>;
let seed: SeededReportBrand;

const clean = (html: string) => html.replace(/<!-- -->/g, "").replace(/&#x27;/g, "'");

async function auditPage(): Promise<string> {
  session.organizationId = seed.orgId;
  const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
  return clean(
    renderToStaticMarkup(
      await AuditPage({
        params: Promise.resolve({ auditId: seed.basisAuditId }),
        searchParams: Promise.resolve({}),
      }),
    ),
  );
}

async function flag(on: boolean) {
  await sql`DELETE FROM org_feature_flags WHERE organization_id = ${seed.orgId} AND flag_key = 'visibility_reach'`;
  if (on)
    await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled)
      VALUES (${seed.orgId}, 'visibility_reach', true)`;
}

async function results(rows: Array<[string, number, number, string, string]>) {
  await sql`DELETE FROM audit_reach_results WHERE audit_id = ${seed.basisAuditId}`;
  for (const [reach, n, m, lo, hi] of rows)
    await sql`INSERT INTO audit_reach_results (audit_id, organization_id, reach, everyday_answers, mentioned, ci_low,
                                               ci_high, reach_hash)
      VALUES (${seed.basisAuditId}, ${seed.orgId}, ${reach}, ${n}, ${m}, ${lo}, ${hi}, ${`hash-${reach}`})`;
}

const THREE: Array<[string, number, number, string, string]> = [
  ["local", 30, 6, "0.0951", "0.3681"],
  ["state", 6, 1, "0.0301", "0.5635"],
  ["country", 6, 0, "0.0000", "0.3903"],
];

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  seed = await seedReportBrand(sql, IRONSTONE);
  await results(THREE);
}, 300_000);

afterAll(async () => {
  if (seed) {
    await sql`DELETE FROM audit_reach_results WHERE organization_id = ${seed.orgId}`;
    await sql`DELETE FROM org_feature_flags WHERE organization_id = ${seed.orgId} AND flag_key = 'visibility_reach'`;
    await seed.cleanup();
  }
  await sql.end();
});

describe("the audit page's reaches (P07)", () => {
  it("off: no reach label, no reach row", async () => {
    await flag(false);
    const html = await auditPage();
    expect(html).not.toContain('data-testid="p07-score-reach"');
    expect(html).not.toContain('data-testid="p07-reach-row"');
  }, 120_000);

  it("on, three reaches: the label, and one tile per reach in reach order", async () => {
    await flag(true);
    const html = await auditPage();
    expect(html).toMatch(/data-testid="p07-score-reach"[^>]*> · across Local, NSW and Australia</);
    expect(html).toContain("Where AI recommends you");
    expect(html).toContain("Each area has its own questions");
    const tiles = [...html.matchAll(/data-testid="p07-reach-tile-(\w+)"/g)].map((m) => m[1]);
    expect(tiles).toEqual(["local", "state", "country"]);
    expect(html).toContain("Local · Castle Hill: 20%, 6 of 30 answers · 95% CI 10–37%");
    expect(html).toContain("NSW: 17%, 1 of 6 answers · 95% CI 3–56%");
    expect(html).toContain("Australia: 0%, 0 of 6 answers · 95% CI 0–39%");
    expect(html).toContain('title="6 of 30 everyday answers in Local · Castle Hill named you."');
  }, 120_000);

  it("on, Local alone: the label names the place, no row", async () => {
    await results(THREE.slice(0, 1));
    const html = await auditPage();
    expect(html).toMatch(/data-testid="p07-score-reach"[^>]*> · Local · Castle Hill</);
    expect(html).not.toContain('data-testid="p07-reach-row"');
    await results(THREE);
  }, 120_000);
});

describe("the report's reaches (P09.reachRow, snapshot)", () => {
  it("on: the data, the snapshot and the Summary page carry them; off: as before", async () => {
    const { buildReportSnapshot } = await import("@/lib/reports/report-snapshot");
    await flag(true);
    const on = await renderSeededReport(sql, seed, "basic", { pdf: false });
    expect(on.data.v2?.reaches).toEqual([
      { reach: "local", label: "Local · Castle Hill", mentioned: 6, answers: 30 },
      { reach: "state", label: "NSW", mentioned: 1, answers: 6 },
      { reach: "country", label: "Australia", mentioned: 0, answers: 6 },
    ]);
    const snapshot = buildReportSnapshot(on.data);
    expect(snapshot.headline.reaches).toEqual(["local", "state", "country"]);
    expect(snapshot.headline.label).toBe("across Local, NSW and Australia");
    expect(snapshot.reaches).toHaveLength(3);
    const summary = on.pages.find((p) => p.includes("Local · Castle Hill")) ?? [];
    expect(summary).toEqual(expect.arrayContaining(["NSW", "17%", "Australia", "0%"]));

    await flag(false);
    const off = await renderSeededReport(sql, seed, "basic", { pdf: false });
    expect(off.data.v2?.reaches).toBeUndefined();
    const plain = buildReportSnapshot(off.data);
    expect(plain.headline.reaches).toEqual(["local"]);
    expect(plain).not.toHaveProperty("reaches");
    expect(off.pages.flat()).not.toContain("Local · Castle Hill");
  }, 300_000);
});
