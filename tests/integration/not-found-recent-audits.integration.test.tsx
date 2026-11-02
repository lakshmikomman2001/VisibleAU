/**
 * 3 Nov -- the 404 page's "Your recent audits". Three rows read "Omega Services 18%",
 * "Omega Services 23%" and "Omega Services 17%", with nothing to tell them apart, and
 * the 17% one was Audit #37, which only 3 of its 4 engines answered. Against the real
 * page and the local test database, on production's #37, #38 and #39.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NOT_FINISHED } from "@/lib/scoring/visibility-display";
import {
  AUDIT_37,
  AUDIT_38,
  AUDIT_39,
  FIXTURE_ENGINES,
  type ReportFixture,
  seedReportFixture,
} from "@/tests/helpers/report-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const currentUser = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => currentUser.value),
}));

let sql: ReturnType<typeof postgres>;
let fx: ReportFixture;
const UNFINISHED = randomUUID();

async function page(): Promise<string> {
  const { default: NotFound } = await import("@/app/not-found");
  return renderToStaticMarkup(await NotFound());
}

/** The markup of the one row linking to this audit. */
function rowOf(html: string, auditId: string): string {
  const start = html.indexOf(`href="/audits/${auditId}"`);
  expect(start, `no row links to ${auditId}`).toBeGreaterThanOrEqual(0);
  return html.slice(start, html.indexOf("</a>", start));
}

function textOf(markup: string): string {
  return markup
    .replace(/^[^>]*>/, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A fourth audit, newer than #39, still running -- with one engine already failing. */
async function seedUnfinishedAudit() {
  const startedAt = new Date("2026-11-02T00:00:00Z");
  await sql`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count,
                        runs_per_prompt, metadata, started_at, created_at, prompt_pack_version,
                        methodology_version)
    VALUES (${UNFINISHED}, ${fx.brandId}, ${fx.orgId}, 40, 'running', ${[...FIXTURE_ENGINES]}, 13, 1,
            ${sql.json({ engineFailures: { claude: 13 } })}, ${startedAt}, ${startedAt}, 1, 2)
  `;
}

beforeAll(async () => {
  sql = postgres(getTestDatabaseUrl(), { max: 1 });
  fx = await seedReportFixture(sql, { audits: [AUDIT_37, AUDIT_38, AUDIT_39] });
  await sql`UPDATE audits SET created_at = completed_at WHERE organization_id = ${fx.orgId}`;
  currentUser.value = { id: randomUUID(), organizationId: fx.orgId };
}, 180_000);

afterEach(async () => {
  await sql`DELETE FROM audits WHERE id = ${UNFINISHED}`;
});

afterAll(async () => {
  await fx.cleanup();
  await sql.end();
});

describe("your recent audits", () => {
  it("each row says which audit it is, under the brand: 'Audit #N · date', in Sydney's date", async () => {
    const html = await page();
    expect(textOf(rowOf(html, fx.audits[37]))).toContain(`${fx.brandName} Audit #37 · 31 Oct 2026`);
    expect(textOf(rowOf(html, fx.audits[38]))).toContain(`${fx.brandName} Audit #38 · 1 Nov 2026`);
    expect(textOf(rowOf(html, fx.audits[39]))).toContain(`${fx.brandName} Audit #39 · 1 Nov 2026`);
  });

  it("#37 shows the audit lists' own marker, and only #37 does", async () => {
    const html = await page();
    const marker = /<div data-engine-coverage[^>]*>3 of 4 engines<\/div>/;
    expect(rowOf(html, fx.audits[37])).toMatch(marker);
    expect(rowOf(html, fx.audits[38])).not.toMatch(/data-engine-coverage|engines/);
    expect(rowOf(html, fx.audits[39])).not.toMatch(/data-engine-coverage|engines/);
  });

  it("Visibility is the audit page's own value and format: '17%' over '5 of 30'", async () => {
    const html = await page();
    const { withRlsContext } = await import("@/db/client");
    const { resolveOrganicDimensions } = await import("@/lib/scoring/resolve-audit-dimensions");
    const { auditVisibilityDisplay } = await import("@/lib/scoring/visibility-display");
    const resolved = await withRlsContext(fx.orgId, (tx) =>
      resolveOrganicDimensions(tx, [fx.audits[37], fx.audits[38], fx.audits[39]]),
    );
    for (const [number, value, detail] of [
      [37, "17%", "5 of 30"],
      [38, "23%", "9 of 40"],
      [39, "18%", "7 of 40"],
    ] as const) {
      const shared = auditVisibilityDisplay("complete", resolved.get(fx.audits[number]));
      expect(shared.value).toBe(value);
      expect(shared.detail).toBe(detail);
      expect(textOf(rowOf(html, fx.audits[number]))).toContain(`${value} ${detail}`);
    }
  });

  it("an audit that hasn't finished says so, dated when it started, with no marker yet", async () => {
    await seedUnfinishedAudit();
    const row = textOf(rowOf(await page(), UNFINISHED));
    expect(row).toContain("Audit #40 · 2 Nov 2026");
    expect(row).toContain(`— ${NOT_FINISHED}`);
    expect(row).not.toContain("engines");
  });

  it("lists the newest three, newest first", async () => {
    const before = await page();
    const order = [39, 38, 37].map((number) =>
      before.indexOf(`href="/audits/${fx.audits[number]}"`),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));

    await seedUnfinishedAudit();
    const after = await page();
    expect(after.match(/href="\/audits\//g)).toHaveLength(3);
    expect(after).toContain(`href="/audits/${UNFINISHED}"`);
    expect(after).not.toContain(`href="/audits/${fx.audits[37]}"`);
  });

  it("signed out there's no list", async () => {
    const saved = currentUser.value;
    currentUser.value = null;
    try {
      const html = await page();
      expect(html).not.toContain("Your recent audits");
      expect(html).not.toContain("/audits/");
    } finally {
      currentUser.value = saved;
    }
  });
});
