/**
 * "Mention detection" (6 Nov), Sri's decision 3 -- one function, lib/llm/methodology.ts's methodologyLabel,
 * names a methodology version everywhere: version 3 is "web-grounded (v2.1)" on the audit page, in the PDF
 * report's data, from the audit APIs, and on the Methodology page (tests/unit/llm/methodology.test.ts). No
 * other code spells a label out.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { methodologyLabel } from "@/lib/llm/methodology";
import { type ReportFixture, seedReportFixture } from "@/tests/helpers/report-fixture";
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

const V21 = methodologyLabel(3);
let client: ReturnType<typeof postgres>;
let fx: ReportFixture;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  fx = await seedReportFixture(client, {
    audits: [
      {
        number: 40,
        completedAt: "2026-11-06T23:00:00.000Z",
        mentions: { chatgpt: [1], claude: [1], gemini: [], perplexity: [1] },
        methodologyVersion: 3,
      },
    ],
  });
  session.organizationId = fx.orgId;
}, 120_000);

afterAll(async () => {
  await fx.cleanup();
  await client.end();
});

describe("version 3 is web-grounded (v2.1) everywhere", () => {
  it("the label itself", () => {
    expect(V21).toBe("web-grounded (v2.1)");
  });

  it("GET /api/audits/[auditId] and /full return the version and its label", async () => {
    const params = { params: Promise.resolve({ auditId: fx.audits[40] }) };
    const { GET } = await import("@/app/api/audits/[auditId]/route");
    const { GET: getFull } = await import("@/app/api/audits/[auditId]/full/route");

    const progress = await (await GET(new Request("http://test/api/audits/x"), params)).json();
    const full = await (await getFull(new Request("http://test/api/audits/x/full"), params)).json();

    for (const body of [progress, full]) {
      expect(body.audit).toMatchObject({ methodologyVersion: 3, methodology: V21 });
    }
  }, 60_000);

  it("the audit page's header says Method: web-grounded (v2.1)", async () => {
    const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
    const html = renderToStaticMarkup(
      await AuditPage({
        params: Promise.resolve({ auditId: fx.audits[40] }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(html).toContain(`Method: ${V21}`);
  }, 60_000);

  it("the PDF report's data carries the same label for its Method line", async () => {
    const { serviceDb } = await import("@/db/client");
    const { buildReportData } = await import("@/lib/reports/report-data");
    const data = await buildReportData(serviceDb, {
      organizationId: fx.orgId,
      brandId: fx.brandId,
      periodType: "weekly",
      periodLabel: "2026-W45",
      auditId: fx.audits[40],
      now: new Date("2026-11-09T09:00:00.000Z"),
    });
    expect(data?.basis.methodology).toBe(V21);
  }, 60_000);
});

describe("no other code spells a methodology label out", () => {
  it("only lib/llm/methodology.ts writes one (comments aside)", () => {
    const LABEL = /web-grounded \(v|memory-only \(v|\bv2\.1\b/;
    const stripComments = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    const files = execFileSync("git", ["ls-files", "lib", "app", "components", "inngest"], {
      encoding: "utf8",
    })
      .split("\n")
      .filter((f) => /\.(ts|tsx)$/.test(f) && f !== "lib/llm/methodology.ts");
    const offenders = files.filter((f) => LABEL.test(stripComments(readFileSync(f, "utf8"))));
    expect(offenders).toEqual([]);
  });
});
