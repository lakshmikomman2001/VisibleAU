/**
 * Task #46 Phase 2 -- real-DB proof that four more customer/public-facing
 * surfaces extend the Phase 1 "insufficient data" contract (lib/scoring/
 * dimension-result.ts) the same way the audit detail page does: a
 * zero-brand-mention audit's real, non-fabricated "0.00" score columns
 * must never render/report as if they were a measured low score.
 *
 * Covers (each with a zero-mention case and a real-mention case):
 *  - app/(auth)/brands/[brandId]/page.tsx (Brand Overview)
 *  - app/client-portal/[inviteToken]/page.tsx (external client portal)
 *  - app/api/badge/route.ts (public embeddable score badge)
 *  - app/(marketing)/sample-audit/result/[id]/page.tsx + sample-result-view.tsx
 *  - lib/workflow/validation-scheduler.ts's recordReauditInsufficientData
 *    (autopilot lift tracking's DB write, companion to recordReauditResults)
 *
 * Pattern follows tests/integration/audit-page-insufficient-data.integration.test.ts
 * (Phase 1's own reference test): getTestDatabaseUrl(), a raw postgres()
 * client for seeding/teardown, client.json() for jsonb columns, afterAll
 * cleanup. ⚠️ DEV/TEST DB ONLY -- never run against visibleau_prod.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ensureSampleOrg } from "@/lib/sample-audit/synthetic-org";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

// The sample-audit result page reads the caller's IP via next/headers'
// headers(), which throws outside a real request scope -- mocked the same
// way other integration tests in this repo mock it (e.g.
// tests/integration/sample-audit-read-endpoints.integration.test.ts).
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const ORG_ID = randomUUID();
// Vunnara (sample-audit follow-up, 20 Oct): resolved inside beforeAll
// via the SAME shared ensureSampleOrg() helper lib/sample-audit/run.ts
// itself uses, not a fresh randomUUID() blindly INSERTed under the
// hardcoded "__sample__" slug -- that collided with the org other
// ensureSampleOrg()-based tests (e.g. sample-audit-needs-confirmation.
// integration.test.ts, this file's own new sample-audit-daily-cap.
// integration.test.ts sibling) correctly leave behind permanently
// (ensureSampleOrg is select-or-insert, by design, matching production
// having exactly one, permanent sample org) once ANY of them has
// already run against the same test DB.
let SAMPLE_ORG_ID: string;

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ organizationId: ORG_ID }),
}));

// Deterministic, no real Redis dependency: the badge route reads
// getRedisConfig() at module-load time, and the sample-audit result page
// calls checkSampleAuditReadRateLimit() per-request -- both fail open here
// so neither test depends on .env.test.local's Redis config.
vi.mock("@/lib/sample-audit/rate-limit", () => ({
  getRedisConfig: vi.fn().mockReturnValue(null),
  checkSampleAuditReadRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 60 }),
}));

const ZERO_BRAND_ID = randomUUID();
const ZERO_AUDIT_ID = randomUUID();
const REAL_BRAND_ID = randomUUID();
const REAL_AUDIT_ID = randomUUID();

const SAMPLE_ZERO_BRAND_ID = randomUUID();
const SAMPLE_ZERO_AUDIT_ID = randomUUID();
const SAMPLE_REAL_BRAND_ID = randomUUID();
const SAMPLE_REAL_AUDIT_ID = randomUUID();
const SAMPLE_INSUFFICIENT_BRAND_ID = randomUUID();
const SAMPLE_INSUFFICIENT_AUDIT_ID = randomUUID();

const ZERO_INVITE_TOKEN = `zero-${randomUUID()}`;
const REAL_INVITE_TOKEN = `real-${randomUUID()}`;

const TASK_ID = randomUUID();

let client: ReturnType<typeof postgres>;

async function insertCitation(opts: {
  auditId: string;
  engine: string;
  prompt: string;
  brandMentioned: boolean;
  runNumber?: number;
  // Task #46 (fix: stored value contradicting its own CI) -- Position/
  // Source-citation are now recomputed from real citations.position/
  // cited_sources, not trusted from the stored score_* columns, so a
  // "real-mention" fixture needs real values here to produce a
  // meaningful (non-zero) recomputed Position/Accuracy.
  // Vunnara (21 Oct, hotfix: "Usually #16") -- `position` above is now
  // display/scoring-inert (lib/scoring/resolve-audit-dimensions.ts
  // recomputes the real rank from response text instead); a "real-
  // mention" fixture needs `responseSnippet` with an actual numbered/
  // bulleted line to produce a non-null recomputed Position any more.
  position?: number | null;
  citedSources?: Array<{ url: string }>;
  responseSnippet?: string;
}) {
  // client.json(...), not JSON.stringify(...) -- see Phase 1's reference
  // test for why: JSON.stringify([]) lands as the jsonb SCALAR "[]", not a
  // real jsonb array, breaking jsonb_array_length() downstream.
  await client`
    INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources, position, response_snippet)
    VALUES (${opts.auditId}, ${opts.engine}, ${opts.prompt}, ${opts.runNumber ?? 1}, ${opts.brandMentioned}, false, ${client.json(opts.citedSources ?? [])}, ${opts.position ?? null}, ${opts.responseSnippet ?? null})
  `;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug, tier, region)
    VALUES (${ORG_ID}, ${`p2-org-${ORG_ID}`}, 'Phase2 Test Org', ${`p2-org-${ORG_ID}`}, 'free', 'au')
  `;
  SAMPLE_ORG_ID = (await ensureSampleOrg()).id;

  // --- Regular org: one zero-mention brand/audit, one real-mention one ---
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${ZERO_BRAND_ID}, ${ORG_ID}, 'Phase2 Zero Co', ${`p2zero-${randomUUID()}.example.com.au`}, 'tradies', 'au', ARRAY['NSW:Sydney'], ARRAY[]::text[])
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${ZERO_AUDIT_ID}, ${ZERO_BRAND_ID}, ${ORG_ID}, 1, 'complete', ARRAY['chatgpt','claude'], 5, 1, now(),
      0, 0, 0, 0, 0, 0)
  `;
  // Vunnara (20 Oct, post-a093ceb), item 2: 5 prompts (10 total answers),
  // not 2 (4 total) -- below MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE (10) the
  // headline is insufficient_data regardless of mention count, which
  // isn't what this fixture is testing.
  for (const engine of ["chatgpt", "claude"]) {
    for (let p = 0; p < 5; p++) {
      await insertCitation({ auditId: ZERO_AUDIT_ID, engine, prompt: `p2 prompt ${p}`, brandMentioned: false });
    }
  }

  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${REAL_BRAND_ID}, ${ORG_ID}, 'Phase2 Real Co', ${`p2real-${randomUUID()}.example.com.au`}, 'tradies', 'au', ARRAY['NSW:Sydney'], ARRAY[]::text[])
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy)
    VALUES (${REAL_AUDIT_ID}, ${REAL_BRAND_ID}, ${ORG_ID}, 2, 'complete', ARRAY['chatgpt','claude'], 5, 1, now(),
      62.3, 50, 70, 75, 60, 50)
  `;
  let realIdx = 0;
  for (const engine of ["chatgpt", "claude"]) {
    for (let p = 0; p < 5; p++) {
      realIdx++;
      await insertCitation({
        auditId: REAL_AUDIT_ID,
        engine,
        prompt: `p2 prompt ${p}`,
        brandMentioned: realIdx === 1,
        position: realIdx === 1 ? 1 : null,
        citedSources: realIdx === 1 ? [{ url: "https://example.com/src" }] : [],
        responseSnippet: realIdx === 1 ? "1. Phase2 Real Co is a trusted local choice." : undefined,
      });
    }
  }

  await client`
    INSERT INTO client_portal_invites (id, organization_id, brand_id, invite_token)
    VALUES (${randomUUID()}, ${ORG_ID}, ${ZERO_BRAND_ID}, ${ZERO_INVITE_TOKEN})
  `;
  await client`
    INSERT INTO client_portal_invites (id, organization_id, brand_id, invite_token)
    VALUES (${randomUUID()}, ${ORG_ID}, ${REAL_BRAND_ID}, ${REAL_INVITE_TOKEN})
  `;

  // --- Sample org: zero/real/insufficient split, under the '__sample__'
  // slug the sample-audit result page joins on. Vunnara (sample-audit
  // follow-up, 20 Oct): SAMPLE_AUDIT_CONFIG now really is 2 engines x 6
  // prompts = 12 planned calls (lib/sample-audit/run.ts actually wires
  // this into execution now) -- SAMPLE_ZERO/SAMPLE_REAL below model a
  // full, successful 12-of-12 run; SAMPLE_INSUFFICIENT models the
  // boundary this follow-up's own tests must cover: 9 successes (one
  // short of MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE) vs 10+. ---
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${SAMPLE_ZERO_BRAND_ID}, ${SAMPLE_ORG_ID}, 'Sample Zero Co', ${`p2samplezero-${randomUUID()}.example.com.au`}, 'tradies', 'au', ARRAY['NSW:Sydney'], ARRAY[]::text[])
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy, metadata)
    VALUES (${SAMPLE_ZERO_AUDIT_ID}, ${SAMPLE_ZERO_BRAND_ID}, ${SAMPLE_ORG_ID}, 1, 'complete', ARRAY['chatgpt','perplexity'], 6, 1, now(),
      0, 0, 0, 0, 0, 0, ${client.json({ isSample: true })})
  `;
  for (const engine of ["chatgpt", "perplexity"]) {
    for (let p = 0; p < 6; p++) {
      await insertCitation({ auditId: SAMPLE_ZERO_AUDIT_ID, engine, prompt: `sample prompt ${p}`, brandMentioned: false });
    }
  }

  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${SAMPLE_REAL_BRAND_ID}, ${SAMPLE_ORG_ID}, 'Sample Real Co', ${`p2samplereal-${randomUUID()}.example.com.au`}, 'tradies', 'au', ARRAY['NSW:Sydney'], ARRAY[]::text[])
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy, metadata)
    VALUES (${SAMPLE_REAL_AUDIT_ID}, ${SAMPLE_REAL_BRAND_ID}, ${SAMPLE_ORG_ID}, 2, 'complete', ARRAY['chatgpt','perplexity'], 6, 1, now(),
      58.2, 40, 65, 70, 55, 45, ${client.json({ isSample: true })})
  `;
  let sampleRealIdx = 0;
  for (const engine of ["chatgpt", "perplexity"]) {
    for (let p = 0; p < 6; p++) {
      sampleRealIdx++;
      const mentioned = sampleRealIdx === 1;
      await insertCitation({
        auditId: SAMPLE_REAL_AUDIT_ID,
        engine,
        prompt: `sample prompt ${p}`,
        brandMentioned: mentioned,
        position: mentioned ? 1 : null,
        citedSources: mentioned ? [{ url: "https://example.com/src" }] : [],
        responseSnippet: mentioned ? "1. Sample Real Co is a trusted local choice." : undefined,
      });
    }
  }

  // --- A sample audit with only 9 of the 12 planned calls succeeding
  // (e.g. 3 engine failures) -- one short of
  // MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE (10), genuinely
  // insufficient_data/"no_answers" regardless of mention count. ---
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${SAMPLE_INSUFFICIENT_BRAND_ID}, ${SAMPLE_ORG_ID}, 'Sample Insufficient Co', ${`p2sampleinsufficient-${randomUUID()}.example.com.au`}, 'tradies', 'au', ARRAY['NSW:Sydney'], ARRAY[]::text[])
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy, metadata)
    VALUES (${SAMPLE_INSUFFICIENT_AUDIT_ID}, ${SAMPLE_INSUFFICIENT_BRAND_ID}, ${SAMPLE_ORG_ID}, 3, 'complete', ARRAY['chatgpt','perplexity'], 6, 1, now(),
      0, 0, 0, 0, 0, 0, ${client.json({ isSample: true })})
  `;
  for (let p = 0; p < 9; p++) {
    await insertCitation({
      auditId: SAMPLE_INSUFFICIENT_AUDIT_ID,
      engine: p % 2 === 0 ? "chatgpt" : "perplexity",
      prompt: `sample prompt ${p}`,
      brandMentioned: false,
    });
  }

  // --- A remediation task whose re-audit found zero mentions (autopilot
  // lift tracking's recordReauditInsufficientData). ---
  await client`
    INSERT INTO remediation_tasks (id, organization_id, brand_id, title, status, priority, score_before)
    VALUES (${TASK_ID}, ${ORG_ID}, ${ZERO_BRAND_ID}, 'Test remediation task', 'ready_for_review', 1, 80)
  `;
});

afterAll(async () => {
  await client`DELETE FROM remediation_tasks WHERE id = ${TASK_ID}`;
  await client`DELETE FROM client_portal_invites WHERE invite_token IN (${ZERO_INVITE_TOKEN}, ${REAL_INVITE_TOKEN})`;
  const auditIds = [
    ZERO_AUDIT_ID,
    REAL_AUDIT_ID,
    SAMPLE_ZERO_AUDIT_ID,
    SAMPLE_REAL_AUDIT_ID,
    SAMPLE_INSUFFICIENT_AUDIT_ID,
  ];
  const brandIds = [
    ZERO_BRAND_ID,
    REAL_BRAND_ID,
    SAMPLE_ZERO_BRAND_ID,
    SAMPLE_REAL_BRAND_ID,
    SAMPLE_INSUFFICIENT_BRAND_ID,
  ];
  await client`DELETE FROM citations WHERE audit_id = ANY(${auditIds})`;
  await client`DELETE FROM audits WHERE id = ANY(${auditIds})`;
  await client`DELETE FROM brands WHERE id = ANY(${brandIds})`;
  // Vunnara (sample-audit follow-up, 20 Oct): never delete SAMPLE_ORG_ID
  // itself -- it's the shared, permanent "__sample__" org every
  // ensureSampleOrg()-based test (and production) expects to keep
  // existing, same convention tests/integration/sample-audit-needs-
  // confirmation.integration.test.ts's own afterAll already documents.
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

describe("app/(auth)/brands/[brandId]/page.tsx -- Brand Overview", () => {
  // BrandDetailClient is a "use client" component that calls useRouter() --
  // rendering it via renderToStaticMarkup would throw outside a real
  // Next.js router context, so (like the existing sample-audit-read-
  // endpoints integration test does for SampleResultView) this inspects
  // the React element's own .props directly: creating a JSX element
  // descriptor runs no hooks at all, only the Server Component's own body.
  async function clientProps(brandId: string) {
    const BrandDetailPage = (await import("@/app/(auth)/brands/[brandId]/page")).default;
    const element = await BrandDetailPage({ params: Promise.resolve({ brandId }) });
    const children = (element as unknown as { props: { children: unknown[] } }).props.children;
    const brandDetailClientElement = children[1] as { props: Record<string, unknown> };
    return brandDetailClientElement.props;
  }

  it("zero-mention brand: latestAudit.insufficientData is true, recentAudits' point is flagged too", async () => {
    const props = await clientProps(ZERO_BRAND_ID);
    expect(props.latestAudit).toMatchObject({ scoreComposite: "0.00", insufficientData: true });
    const recentAudits = props.recentAudits as Array<{ insufficientData: boolean }>;
    expect(recentAudits.length).toBeGreaterThan(0);
    expect(recentAudits.every((a) => a.insufficientData === true)).toBe(true);
  });

  // Vunnara (19 Oct, post-aa83b3a), "the headline is the mention rate":
  // the stored score_composite column (62.30) is STALE -- scoreComposite
  // now recomputes live as the Frequency/headline value alone (1 of 10
  // organic answers mentioned = 10.00), never a blend with Position/
  // Source-citation. A DIFFERENT, honest number from both the stale
  // 62.30 and the old blended-composite fix's 71.15.
  //
  // Vunnara (20 Oct, post-a093ceb), item 2: the fixture's sample size was
  // bumped from 4 to 10 total organic answers to clear
  // MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE -- 1 of 10 is 10.00, not 25.00.
  it("real-mention brand: latestAudit.insufficientData is false and every value is recomputed live from real citations, not the stale stored columns", async () => {
    const props = await clientProps(REAL_BRAND_ID);
    expect(props.latestAudit).toMatchObject({ scoreComposite: "10.00", insufficientData: false });
  });
});

describe("app/client-portal/[inviteToken]/page.tsx -- external client portal", () => {
  // Vunnara (19 Oct, post-aa83b3a), "the headline is the mention rate":
  // the headline (Frequency) is a REAL measurement even at 0 mentions
  // (it's the mention rate, 0%, over 10 real answers) -- it renders
  // "0.0", never "N/A". Only Position/Source-citation (which measure
  // the mentions that didn't happen) go N/A -- 2, not 3. Sentiment/
  // Context render "Not yet measured" (unconditional, unrelated to
  // mention count).
  it("zero-mention brand: headline renders 0.0 (a real measurement); Position/Source-citation render N/A; Sentiment/Context render 'Not yet measured'", async () => {
    const ClientPortalViewPage = (await import("@/app/client-portal/[inviteToken]/page")).default;
    const element = await ClientPortalViewPage({
      params: Promise.resolve({ inviteToken: ZERO_INVITE_TOKEN }),
    });
    const html = renderToStaticMarkup(element);
    expect(html).toContain("N/A");
    expect(html).toContain("Not mentioned in any of 10 AI answers checked this audit.");
    expect(html.match(/>N\/A</g)?.length).toBe(2);
    expect(html.match(/Not yet measured/g)?.length).toBe(2);
  });

  // Vunnara (19 Oct, post-aa83b3a): the stored score_composite column
  // (62.30, the old blend) is stale -- the headline now recomputes live
  // as Frequency alone (1 of 10 organic answers mentioned = 10.0), never
  // blended with Position/Source-citation (which still render their own
  // real 100.0 scores independently, visible in the dimension grid).
  it("real-mention brand: headline is the live mention rate (10.0, not the stale blended 62.3); Position/Source-citation render real scores; Sentiment/Context still say 'Not yet measured'", async () => {
    const ClientPortalViewPage = (await import("@/app/client-portal/[inviteToken]/page")).default;
    const element = await ClientPortalViewPage({
      params: Promise.resolve({ inviteToken: REAL_INVITE_TOKEN }),
    });
    const html = renderToStaticMarkup(element);
    expect(html).toContain("10.0");
    expect(html).not.toContain("62.3");
    expect(html).not.toContain("71.2");
    expect(html).not.toContain(">N/A<");
    expect(html).not.toContain("Not mentioned in any of");
    expect(html.match(/Not yet measured/g)?.length).toBe(2);
  });
});

describe("app/api/badge/route.ts -- public embeddable score badge", () => {
  function req(domain: string) {
    return new Request(`http://localhost/api/badge?domain=${encodeURIComponent(domain)}`);
  }

  it("zero-mention brand: a neutral 'Not yet mentioned' badge, never a red 0%", async () => {
    const { GET } = await import("@/app/api/badge/route");
    const [{ domain }] = await client`SELECT domain FROM brands WHERE id = ${ZERO_BRAND_ID}`;
    const res = await GET(req(domain));
    const svg = await res.text();
    expect(svg).toContain("Not yet mentioned");
    expect(svg).not.toContain("0%");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
  });

  // Vunnara (19 Oct, post-aa83b3a): the badge recomputes the headline
  // (Frequency) live from real citations -- 1 of 10 organic answers
  // mentioned = 10%, never blended with Position/Source-citation. Not
  // the stale stored 62.30 (old blend), nor the old blended-composite
  // fix's 71%.
  it("real-mention brand: the live-recomputed mention rate renders (10%, not the stale stored 62%)", async () => {
    const { GET } = await import("@/app/api/badge/route");
    const [{ domain }] = await client`SELECT domain FROM brands WHERE id = ${REAL_BRAND_ID}`;
    const res = await GET(req(domain));
    const svg = await res.text();
    expect(svg).toContain("10%");
    expect(svg).not.toContain("62%");
    expect(svg).not.toContain("71%");
    expect(svg).not.toContain("Not yet mentioned");
  });

  it("a domain with no completed audit at all: the pre-existing 'No data' badge, untouched by this fix", async () => {
    const { GET } = await import("@/app/api/badge/route");
    const res = await GET(req(`no-such-domain-${randomUUID()}.example.com`));
    const svg = await res.text();
    expect(svg).toContain("No data");
  });
});

describe("app/(marketing)/sample-audit/result/[id]/page.tsx + sample-result-view.tsx -- public pre-signup sample audit", () => {
  // Vunnara (sample-audit follow-up, 20 Oct, post-21bcd79) -- REWRITTEN.
  // The previous round of this hotfix flagged a confirmed conflict here:
  // SAMPLE_AUDIT_CONFIG declared 1 engine x 5 prompts = 5 total organic
  // answers, always below MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE (10), so
  // every sample audit was unconditionally insufficient_data/"no_answers"
  // regardless of mention count. Sri's decision (option A): raise the
  // sample instead of lowering the threshold. lib/sample-audit/run.ts now
  // actually wires SAMPLE_AUDIT_CONFIG's 2 engines x 6 prompts = 12
  // planned calls into execution (it never did before -- see that file's
  // own doc comment), so a normal, fully-successful sample audit clears
  // 10 comfortably and scores for real again.
  it("zero-mention sample audit (12 of 12 real answers): the honest 'don't mention yet' framing renders, not a red 0/100", async () => {
    const SampleResultPage = (await import("@/app/(marketing)/sample-audit/result/[id]/page"))
      .default;
    const element = await SampleResultPage({
      params: Promise.resolve({ id: SAMPLE_ZERO_AUDIT_ID }),
    });
    const audit = (element as unknown as { props: { audit: Record<string, unknown> } }).props
      .audit;
    expect(audit.insufficientData).toBe(true);
    expect(audit.noAnswers).toBe(false);
    expect(audit.sampleSize).toBe(12);
    expect(audit.mentionedCount).toBe(0);

    const SampleResultView = (
      await import("@/app/(marketing)/sample-audit/result/[id]/sample-result-view")
    ).default;
    // Call the component function directly (not via React.createElement) --
    // it has no hooks, so this is a plain function call returning its JSX,
    // same as tests/integration/sample-audit-read-endpoints.integration.test.ts
    // reads SampleResultPage's own returned element without a full render.
    const html = renderToStaticMarkup(SampleResultView({ audit: audit as never }));
    expect(html).toMatch(/AI engines don.{1,8}t mention Sample Zero Co yet/);
    expect(html).toContain("We checked 12 AI answers");
    // No more big alarming "text-5xl" composite number -- the
    // insufficient-data branch renders the honest headline instead.
    expect(html).not.toContain("text-5xl");
    // Frequency is a real measurement even at 0 mentions -- its genuine
    // "0/100" still renders (that's the real mention rate, not
    // fabrication). Position/Source-citation go N/A (2); Sentiment/
    // Context are the third, unconditional "Not yet measured" state (2).
    expect(html.match(/0\/100/g)?.length).toBe(1);
    expect(html.match(/>N\/A</g)?.length).toBe(2);
    expect(html.match(/Not yet measured/g)?.length).toBe(2);
    // Build 1 follow-up (final reconcile): this sample brand has no
    // confirmed category or location -- its questions come from the
    // generic vertical+region pack (get-audit-prompts.ts's own
    // classification-is-null branch), not a tailored one. Said
    // plainly, always, regardless of insufficient-data framing.
    expect(html).toContain(
      "These are general questions. Sign up to tailor them to your business and location.",
    );
  });

  it("real-mention sample audit (1 of 12): the live mention rate (8%, 1 of 12) renders, same 'Mentioned in k of n answers' format real audits use", async () => {
    const SampleResultPage = (await import("@/app/(marketing)/sample-audit/result/[id]/page"))
      .default;
    const element = await SampleResultPage({
      params: Promise.resolve({ id: SAMPLE_REAL_AUDIT_ID }),
    });
    const audit = (element as unknown as { props: { audit: Record<string, unknown> } }).props
      .audit;
    expect(audit.insufficientData).toBe(false);
    expect(audit.noAnswers).toBe(false);
    expect(audit.mentionedCount).toBe(1);
    expect(audit.sampleSize).toBe(12);

    const SampleResultView = (
      await import("@/app/(marketing)/sample-audit/result/[id]/sample-result-view")
    ).default;
    const html = renderToStaticMarkup(SampleResultView({ audit: audit as never }));
    expect(html).toContain("Mentioned in 1 of 12 answer");
    expect(html).not.toMatch(/don.{1,8}t mention/);
    expect(html).not.toContain("Not enough data");
    expect(html.match(/Not yet measured/g)?.length).toBe(2);
    expect(html).toContain(
      "These are general questions. Sign up to tailor them to your business and location.",
    );
  });

  // Vunnara (sample-audit follow-up, 20 Oct), the explicit boundary this
  // follow-up's own spec names: 9 of the 12 planned calls succeeded (3
  // engine failures) -- one short of MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE
  // (10), so this is genuinely insufficient_data/"no_answers", not the
  // mention-count-based framing above.
  it("insufficient sample audit (9 of 12 planned calls succeeded): 'Not enough data' renders, with a 'Try again' action -- never a fake score", async () => {
    const SampleResultPage = (await import("@/app/(marketing)/sample-audit/result/[id]/page"))
      .default;
    const element = await SampleResultPage({
      params: Promise.resolve({ id: SAMPLE_INSUFFICIENT_AUDIT_ID }),
    });
    const audit = (element as unknown as { props: { audit: Record<string, unknown> } }).props
      .audit;
    expect(audit.noAnswers).toBe(true);
    expect(audit.sampleSize).toBe(9);

    const SampleResultView = (
      await import("@/app/(marketing)/sample-audit/result/[id]/sample-result-view")
    ).default;
    const html = renderToStaticMarkup(SampleResultView({ audit: audit as never }));
    expect(html).toContain("Not enough data");
    expect(html).toContain("We only got 9 AI answers back this time (need at least 10)");
    expect(html).toContain("Try again");
    expect(html).toContain('href="/sample-audit"');
  });
});

describe("lib/workflow/validation-scheduler.ts -- recordReauditInsufficientData (autopilot lift tracking)", () => {
  it("records the reaudit link + honest reason, and never writes a fabricated score_after/lift_achieved", async () => {
    const { recordReauditInsufficientData } = await import("@/lib/workflow/validation-scheduler");
    await recordReauditInsufficientData(TASK_ID, ZERO_AUDIT_ID);

    const [row] = await client`
      SELECT reaudit_id, reaudit_deferred_reason, score_after, lift_achieved
      FROM remediation_tasks WHERE id = ${TASK_ID}
    `;
    expect(row.reaudit_id).toBe(ZERO_AUDIT_ID);
    expect(row.reaudit_deferred_reason).toBe("insufficient_data");
    expect(row.score_after).toBeNull();
    expect(row.lift_achieved).toBeNull();
  });
});
