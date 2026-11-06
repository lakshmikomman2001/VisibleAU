/**
 * Health Check (7 Nov, Sri's decision 2) -- the audit page names the Visibility band under its headline,
 * from the same map the Health Check's AI presence card reads (lib/scoring/headline-color.ts): 13% is
 * "Developing" on both, never a "Critical" from some other scale.
 *
 * The audit: Claude failed every question; ChatGPT and Perplexity each named the brand in 2 of 10
 * everyday answers, Gemini in none -- 4 of 30 = 13%.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
        number: 50,
        completedAt: "2026-11-02T00:00:00.000Z",
        failedEngines: ["claude"],
        mentions: { chatgpt: [1, 2], perplexity: [1, 2] },
      },
    ],
  });
  session.organizationId = fx.orgId;
}, 120_000);

afterAll(async () => {
  await fx.cleanup();
  await client.end();
});

describe("the audit page names the Visibility band", () => {
  it("13% is Developing", async () => {
    const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
    const html = renderToStaticMarkup(
      await AuditPage({
        params: Promise.resolve({ auditId: fx.audits[50] }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(html).toContain(">13%<");
    expect(html).toMatch(/data-visibility-band="developing"[^>]*>Developing</);
    expect(html).not.toContain("Critical");
  }, 120_000);
});
