/**
 * Google AI surfaces, Phase 1, part 3 -- what an audit that ran with Google shows, everywhere it's shown:
 * the audit page's "Google Search AI" block, the running poll's rows, the CSV and JSON exports, the PDF's
 * data, the narrative report's data, the completion email and the client portal. The counting is honest:
 * "not shown" is its own outcome, mentions are verified ones in everyday questions, a question that
 * couldn't be checked is counted apart with why. With "count in headline" on, the headline includes Google
 * and says so, and an audit counted differently is never compared like for like.
 *
 * The provider is answered by its REAL 11 Nov responses (tests/helpers/dataforseo-recorded.ts); the four
 * engines by MockLLM. (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import { recordedDataForSeoFetch, recordedQuestions } from "@/tests/helpers/dataforseo-recorded";
import { deleteOrgRows } from "@/tests/helpers/delete-org-rows";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { session, captured } = vi.hoisted(() => ({
  session: { organizationId: "" },
  captured: { pdfData: [] as unknown[], emails: [] as unknown[] },
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({ id: null, organizationId: session.organizationId })),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/audits",
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));
vi.mock("@/lib/pdf/render", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pdf/render")>();
  return {
    ...actual,
    renderAuditPdf: vi.fn(async (data: unknown) => {
      captured.pdfData.push(data);
      return Buffer.from("%PDF-test");
    }),
  };
});
vi.mock("@/lib/email/recipients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email/recipients")>();
  return {
    ...actual,
    resolveNotificationRecipients: vi.fn(async () => ({
      enabled: true,
      recipients: ["o@example.test"],
    })),
  };
});
vi.mock("@/lib/email/send", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email/send")>();
  return {
    ...actual,
    sendEmailOrThrow: vi.fn(async (email: unknown) => {
      captured.emails.push(email);
      return { id: "test" };
    }),
  };
});

const ORG = randomUUID();
const QUESTIONS = recordedQuestions();
let client: ReturnType<typeof postgres>;
let auditNumber = 0;
type Handler = (ctx: {
  event: { data: Record<string, unknown> };
  step: unknown;
}) => Promise<unknown>;

function step() {
  const log: { id: string; data?: Record<string, unknown> }[] = [];
  return {
    log,
    step: {
      run: async (id: string, fn: () => unknown) => {
        log.push({ id });
        return fn();
      },
      sleep: async (id: string) => {
        log.push({ id });
      },
      sendEvent: async (id: string, payload: { data: Record<string, unknown> }) => {
        log.push({ id, data: payload.data });
        return { ids: [] };
      },
    },
  };
}

async function googleAudit(): Promise<{ auditId: string; brandId: string }> {
  const brandId = randomUUID();
  const auditId = randomUUID();
  auditNumber++;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, prompt_pack,
      prompt_pack_generator_version, classification_status, classification, categories, audience,
      category_confirmed_at, suburb, state, country, location_mode, location_confirmed_at)
    VALUES (${brandId}, ${ORG}, 'Omega Services', 'omegaservices.com.au', 'tradies', 'au',
      ARRAY['NSW:Norwest']::text[], ${client.json(QUESTIONS)}, ${PROMPT_GENERATOR_VERSION}, 'complete',
      ${client.json({ category: "trades_plumbing", buyerType: "smb", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })},
      ARRAY['trades_plumbing']::text[], 'households', now(), 'Norwest', 'NSW', 'Australia', 'fixed', now())
  `;
  await client`INSERT INTO brand_google_locations (brand_id, organization_id, postcode) VALUES (${brandId}, ${ORG}, '2153')`;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, metadata)
    VALUES (${auditId}, ${brandId}, ${ORG}, ${auditNumber}, 'manual', 'pending', ${client.json({ mockScenario: "happy_path" })})
  `;
  const { runAudit } = await import("@/inngest/functions/run-audit");
  const { collectGoogleSurfacesFn } = await import("@/inngest/functions/collect-google-surfaces");
  const audit = step();
  await (runAudit as unknown as { fn: Handler }).fn({
    event: { data: { auditId, organizationId: ORG } },
    step: audit.step,
  });
  const dispatch = audit.log.find((e) => e.id === "google-surfaces-dispatch");
  if (dispatch?.data) {
    await (collectGoogleSurfacesFn as unknown as { fn: Handler }).fn({
      event: { data: dispatch.data },
      step: step().step,
    });
  }
  return { auditId, brandId };
}

async function page(auditId: string): Promise<string> {
  const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
  return renderToStaticMarkup(
    await AuditPage({ params: Promise.resolve({ auditId }), searchParams: Promise.resolve({}) }),
  ).replace(/<!-- -->/g, "");
}

function text(html: string, attr: string): string {
  const at = html.indexOf(attr);
  if (at < 0) return "";
  const start = html.lastIndexOf("<", at);
  const end = html.indexOf("</section>", at);
  return html
    .slice(start, end > 0 ? end : undefined)
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

function switchOn() {
  vi.stubEnv("GOOGLE_AI_SURFACES_ENABLED", "true");
  vi.stubEnv("DATAFORSEO_LOGIN", "test-login");
  vi.stubEnv("DATAFORSEO_PASSWORD", "test-password");
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  session.organizationId = ORG;
  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG}, ${`google-display-${ORG}`}, 'Google Display Test Org', ${`google-display-${ORG}`})
  `;
  await client`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG}, ${`cus_${ORG}`}, ${`sub_${ORG}`}, 'price_test_growth', 'growth', 'monthly', 'active')
  `;
  for (const key of ["google_ai_overviews_enabled", "google_ai_mode_enabled"]) {
    await client`
      INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled, reason, set_by)
      VALUES (${ORG}, ${key}, true, 'test', 'test')
    `;
  }
  const settings = await client`SELECT count(*)::int AS n FROM feature_settings`;
  if (settings[0].n > 0) throw new Error("feature_settings isn't empty on the test database");
}, 60_000);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await client`DELETE FROM feature_settings`;
  await client`DELETE FROM client_portal_invites WHERE organization_id = ${ORG}`;
  await deleteOrgRows(client, ORG);
  await client.end();
});

describe("an audit that ran with Google: every surface shows its Google Search AI block", () => {
  it("the audit page, poll, exports, PDF data, report data, email and client portal", async () => {
    switchOn();
    vi.stubGlobal("fetch", recordedDataForSeoFetch().fetchImpl);
    const { auditId, brandId } = await googleAudit();

    const html = await page(auditId);
    const block = text(html, "data-google-search-ai");
    expect(block).toContain("Google Search AI");
    expect(block).toContain("2153 NSW · desktop ·");
    expect(block).toContain(
      "AI Overviews: shown for 3 of 4 questions · you were mentioned in 0 of the 1 everyday one",
    );
    expect(block).toContain(
      "AI Mode: answered 4 of 4 · you were mentioned in 0 of the 2 everyday ones",
    );
    expect(block).toContain("questions naming you: mentioned in 2 of 2");
    expect(block).toContain("5 cited links were Google's own pages, not counted as directories");
    expect(block).toContain("google.com.au");
    expect(block).toContain("google.com, Australia");
    expect(block).toContain("Not counted in the Visibility % above: Google is shown on its own.");
    expect(block).toContain("Checked through DataForSEO, logged out");
    expect(block).toMatch(/Cost A\$0\.\d\d\./);
    expect(block).toContain("Not shown");
    expect(html).not.toContain("data-headline-includes-google");

    const { GET: poll } = await import("@/app/api/audits/[auditId]/route");
    const polled = await (
      await poll(new Request("http://x"), { params: Promise.resolve({ auditId }) })
    ).json();
    expect(polled.google.status).toBe("complete");
    expect(polled.google.rows.map((r: { surface: string }) => r.surface)).toEqual([
      "google_ai_overviews",
      "google_ai_mode",
    ]);

    const { GET: exportGet } = await import("@/app/api/audits/[auditId]/export/route");
    const csv = await (
      await exportGet(new Request(`http://x/api/audits/${auditId}/export?format=csv`), {
        params: Promise.resolve({ auditId }),
      })
    ).text();
    const googleCsv = csv.split("\n").filter((l) => /,google_ai_(overviews|mode),/.test(l));
    expect(googleCsv).toHaveLength(8);
    expect(googleCsv.some((l) => l.includes(",not_shown,"))).toBe(true);
    expect(googleCsv.every((l) => l.includes(",dataforseo,0.001200,"))).toBe(true);
    expect(googleCsv.join("\n")).not.toMatch(/\|google\.com"/);

    const json = await (
      await exportGet(new Request(`http://x/api/audits/${auditId}/export?format=json`), {
        params: Promise.resolve({ auditId }),
      })
    ).json();
    expect(json.googleSurfaces).toHaveLength(8);

    captured.pdfData.length = 0;
    await exportGet(new Request(`http://x/api/audits/${auditId}/export?format=pdf`), {
      params: Promise.resolve({ auditId }),
    });
    const pdf = captured.pdfData[0] as { google: { lines: string[]; labelLine: string } };
    expect(pdf.google.lines[0]).toMatch(/^AI Overviews: shown for 3 of 4 questions/);
    expect(pdf.google.labelLine).toMatch(/^2153 NSW · desktop · /);

    const { withRlsContext } = await import("@/db/client");
    const { buildReportData } = await import("@/lib/reports/report-data");
    const report = await withRlsContext(ORG, (tx) =>
      buildReportData(tx, {
        organizationId: ORG,
        brandId,
        periodType: "monthly",
        periodLabel: "November 2026",
        auditId,
      }),
    );
    expect(report?.google?.lines).toEqual(pdf.google.lines);

    const { sendAuditCompleteEmail } = await import(
      "@/inngest/functions/send-audit-complete-email"
    );
    captured.emails.length = 0;
    await (sendAuditCompleteEmail as unknown as { fn: Handler }).fn({
      event: { data: { auditId, brandId, organizationId: ORG } },
      step: step().step,
    });
    const email = captured.emails[0] as { text: string };
    expect(email.text).toContain("Google Search AI (2153 NSW · desktop ·");
    expect(email.text).toContain("AI Mode: answered 4 of 4");

    const token = `google-display-${randomUUID()}`;
    await client`
      INSERT INTO client_portal_invites (organization_id, brand_id, invite_token, status)
      VALUES (${ORG}, ${brandId}, ${token}, 'active')
    `;
    const Portal = (await import("@/app/client-portal/[inviteToken]/page")).default;
    const portal = renderToStaticMarkup(
      await Portal({ params: Promise.resolve({ inviteToken: token }) }),
    );
    expect(text(portal.replace(/<!-- -->/g, ""), "data-google-search-ai")).toContain(
      "AI Overviews: shown for 3 of 4 questions",
    );
  }, 180_000);

  it("a run the provider couldn't answer: counted apart, with why -- not 'not mentioned', not 'not shown'", async () => {
    switchOn();
    vi.stubGlobal("fetch", recordedDataForSeoFetch({ unreachable: true }).fetchImpl);
    const { auditId } = await googleAudit();
    const html = await page(auditId);
    const block = text(html, "data-google-search-ai");
    // 12 Nov, part 1: nothing was checked, so no counts -- never "shown for 0 of 4".
    expect(block).toContain("AI Overviews: couldn't be checked this time");
    expect(block).toContain("AI Mode: couldn't be checked this time");
    expect(block).not.toMatch(/\b0 of \d+/);
    expect(block).not.toContain("no everyday question had an answer to be mentioned in");
    expect(html).not.toContain("data-google-question");
    // 12 Nov, part 2: the reason in the customer's words, once -- never the provider's message or code.
    expect(block).toContain(
      "Google didn't answer in time. It will be checked again on the next audit.",
    );
    expect(block.split("Google didn't answer in time")).toHaveLength(2);
    expect(block).not.toMatch(/refused|couldn't be reached|TypeError|50000|dataforseo\.com/);
  }, 180_000);

  it("count in headline on: the headline includes Google and says so; never compared with one that didn't", async () => {
    switchOn();
    vi.stubGlobal("fetch", recordedDataForSeoFetch().fetchImpl);
    const off = await googleAudit();
    await client`INSERT INTO feature_settings (key, value) VALUES ('google_surfaces_count_in_headline', 'true')`;
    const on = await googleAudit();
    await client`DELETE FROM feature_settings WHERE key = 'google_surfaces_count_in_headline'`;

    const { withRlsContext } = await import("@/db/client");
    const { resolveAuditDimensionsAndHeadline } = await import(
      "@/lib/scoring/resolve-audit-dimensions"
    );
    const [h0, h1] = await withRlsContext(ORG, async (tx) => [
      await resolveAuditDimensionsAndHeadline(tx, off.auditId),
      await resolveAuditDimensionsAndHeadline(tx, on.auditId),
    ]);
    // The everyday questions where Google showed an answer: 1 AI Overview, 2 AI Mode answers.
    expect(h1.sampleCount).toBe(h0.sampleCount + 3);
    expect(h1.mentionedCount).toBe(h0.mentionedCount);
    expect(h1.googleIncluded).toBe(true);
    expect("googleIncluded" in h0).toBe(false);
    expect(h1.perEngine.map((e) => e.engine)).toEqual(
      expect.arrayContaining(["google_ai_overviews", "google_ai_mode"]),
    );

    const html = await page(on.auditId);
    expect(html).toContain("Includes Google AI Overviews and AI Mode");
    expect(text(html, "data-google-search-ai")).toContain(
      "Counted in the Visibility % above, for the questions where Google showed an AI answer.",
    );

    const { auditsCountingGoogle } = await import("@/lib/audit/google-surfaces/summary");
    const counted = await withRlsContext(ORG, (tx) =>
      auditsCountingGoogle(tx, [off.auditId, on.auditId]),
    );
    expect([...counted]).toEqual([on.auditId]);

    const ComparePage = (await import("@/app/(auth)/audits/compare/page")).default;
    const compare = renderToStaticMarkup(
      await ComparePage({ searchParams: Promise.resolve({ ids: `${off.auditId},${on.auditId}` }) }),
    ).replace(/<!-- -->/g, "");
    expect(compare).toContain(
      "Not like for like: one of these audits counts Google AI Overviews and AI Mode",
    );
  }, 240_000);
});
