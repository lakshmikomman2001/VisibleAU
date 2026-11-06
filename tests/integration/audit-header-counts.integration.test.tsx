/**
 * Overview (7 Nov), item 5 -- the audit page's header never calls planned calls "answers". Audit #37
 * (1 Nov) read "13 questions × 4 engines = 52 answers · 39 live · 0 cached", though Claude's 13 calls
 * all failed and only 39 answers exist. With failures it says what was planned and what came back;
 * a full audit keeps the short form.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  AUDIT_37,
  AUDIT_38,
  type ReportFixture,
  seedReportFixture,
} from "@/tests/helpers/report-fixture";
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

let client: ReturnType<typeof postgres>;
let fx: ReportFixture;

async function header(auditNumber: number): Promise<string> {
  const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
  const html = renderToStaticMarkup(
    await AuditPage({
      params: Promise.resolve({ auditId: fx.audits[auditNumber] }),
      searchParams: Promise.resolve({}),
    }),
  );
  return html.replace(/<!-- -->/g, "");
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  fx = await seedReportFixture(client, { audits: [AUDIT_37, AUDIT_38] });
  session.organizationId = fx.orgId;
}, 120_000);

afterAll(async () => {
  await fx.cleanup();
  await client.end();
});

describe("the audit page header's answer counts", () => {
  it("#37-shaped (Claude failed all 13): planned, answered, failed and cached", async () => {
    const html = await header(37);
    expect(html).toContain(
      "13 questions × 4 engines = 52 planned · 39 answered · 13 failed · 0 cached",
    );
    expect(html).not.toContain("= 52 answers");
  }, 120_000);

  it("no failures: unchanged", async () => {
    expect(await header(38)).toContain(
      "13 questions × 4 engines = 52 answers · 52 live · 0 cached",
    );
  }, 120_000);
});
