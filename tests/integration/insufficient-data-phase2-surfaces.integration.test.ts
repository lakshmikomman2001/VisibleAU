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
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

// The sample-audit result page reads the caller's IP via next/headers'
// headers(), which throws outside a real request scope -- mocked the same
// way other integration tests in this repo mock it (e.g.
// tests/integration/sample-audit-read-endpoints.integration.test.ts).
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const ORG_ID = randomUUID();
const SAMPLE_ORG_ID = randomUUID();

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
  position?: number | null;
  citedSources?: Array<{ url: string }>;
}) {
  // client.json(...), not JSON.stringify(...) -- see Phase 1's reference
  // test for why: JSON.stringify([]) lands as the jsonb SCALAR "[]", not a
  // real jsonb array, breaking jsonb_array_length() downstream.
  await client`
    INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources, position)
    VALUES (${opts.auditId}, ${opts.engine}, ${opts.prompt}, ${opts.runNumber ?? 1}, ${opts.brandMentioned}, false, ${client.json(opts.citedSources ?? [])}, ${opts.position ?? null})
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
  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug, tier, region)
    VALUES (${SAMPLE_ORG_ID}, ${`p2-sample-${SAMPLE_ORG_ID}`}, 'Sample Org', '__sample__', 'free', 'au')
  `;

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

  // --- Sample org: same zero/real split, under the '__sample__' slug the
  // sample-audit result page joins on. ---
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${SAMPLE_ZERO_BRAND_ID}, ${SAMPLE_ORG_ID}, 'Sample Zero Co', ${`p2samplezero-${randomUUID()}.example.com.au`}, 'tradies', 'au', ARRAY['NSW:Sydney'], ARRAY[]::text[])
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy, metadata)
    VALUES (${SAMPLE_ZERO_AUDIT_ID}, ${SAMPLE_ZERO_BRAND_ID}, ${SAMPLE_ORG_ID}, 1, 'complete', ARRAY['chatgpt'], 5, 1, now(),
      0, 0, 0, 0, 0, 0, ${client.json({ isSample: true })})
  `;
  for (let p = 0; p < 5; p++) {
    await insertCitation({ auditId: SAMPLE_ZERO_AUDIT_ID, engine: "chatgpt", prompt: `sample prompt ${p}`, brandMentioned: false });
  }

  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
    VALUES (${SAMPLE_REAL_BRAND_ID}, ${SAMPLE_ORG_ID}, 'Sample Real Co', ${`p2samplereal-${randomUUID()}.example.com.au`}, 'tradies', 'au', ARRAY['NSW:Sydney'], ARRAY[]::text[])
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at,
      score_composite, score_frequency, score_position, score_sentiment_numeric, score_context_numeric, score_accuracy, metadata)
    VALUES (${SAMPLE_REAL_AUDIT_ID}, ${SAMPLE_REAL_BRAND_ID}, ${SAMPLE_ORG_ID}, 2, 'complete', ARRAY['chatgpt'], 5, 1, now(),
      58.2, 40, 65, 70, 55, 45, ${client.json({ isSample: true })})
  `;
  for (let p = 0; p < 5; p++) {
    await insertCitation({
      auditId: SAMPLE_REAL_AUDIT_ID,
      engine: "chatgpt",
      prompt: `sample prompt ${p}`,
      brandMentioned: p === 0,
      position: p === 0 ? 1 : null,
      citedSources: p === 0 ? [{ url: "https://example.com/src" }] : [],
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
  const auditIds = [ZERO_AUDIT_ID, REAL_AUDIT_ID, SAMPLE_ZERO_AUDIT_ID, SAMPLE_REAL_AUDIT_ID];
  const brandIds = [ZERO_BRAND_ID, REAL_BRAND_ID, SAMPLE_ZERO_BRAND_ID, SAMPLE_REAL_BRAND_ID];
  await client`DELETE FROM citations WHERE audit_id = ANY(${auditIds})`;
  await client`DELETE FROM audits WHERE id = ANY(${auditIds})`;
  await client`DELETE FROM brands WHERE id = ANY(${brandIds})`;
  await client`DELETE FROM organizations WHERE id IN (${ORG_ID}, ${SAMPLE_ORG_ID})`;
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
  // Vunnara (20 Oct, post-a093ceb), item 2 -- CONFIRMED CONFLICT, flagged
  // for Sri rather than silently special-cased (per the hotfix spec's own
  // instruction): lib/sample-audit/config.ts's SAMPLE_AUDIT_CONFIG is
  // hardcoded to 1 engine x 5 prompts = 5 total organic answers, always
  // below MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE (10). Since resolveOrganicDimensions
  // aliases `frequency` to `headline` (resolve-audit-dimensions.ts:123),
  // EVERY sample audit's headline AND Frequency dimension are now
  // unconditionally "insufficient_data"/"no_answers" regardless of mention
  // count -- the honest "AI engines don't mention X yet" marketing copy
  // below is now dead code for sample audits specifically: `noAnswers`
  // always wins the ternary in sample-result-view.tsx before
  // `insufficientData` is ever checked. This test now documents that
  // actual (not necessarily desired) behavior; see this hotfix's
  // report-back for the decision this needs from Sri (raise the sample's
  // prompt count to >= 10, or give sample audits their own, lower bar).
  it("zero-mention sample audit: now renders the generic 'Not enough data' framing (noAnswers), not the honest 'don't mention yet' copy -- sampleCount (5) is always below MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE (10)", async () => {
    const SampleResultPage = (await import("@/app/(marketing)/sample-audit/result/[id]/page"))
      .default;
    const element = await SampleResultPage({
      params: Promise.resolve({ id: SAMPLE_ZERO_AUDIT_ID }),
    });
    const audit = (element as unknown as { props: { audit: Record<string, unknown> } }).props
      .audit;
    expect(audit.insufficientData).toBe(true);
    expect(audit.noAnswers).toBe(true);
    expect(audit.sampleSize).toBe(5);

    const SampleResultView = (
      await import("@/app/(marketing)/sample-audit/result/[id]/sample-result-view")
    ).default;
    // Call the component function directly (not via React.createElement) --
    // it has no hooks, so this is a plain function call returning its JSX,
    // same as tests/integration/sample-audit-read-endpoints.integration.test.ts
    // reads SampleResultPage's own returned element without a full render.
    const html = renderToStaticMarkup(SampleResultView({ audit: audit as never }));
    expect(html).toContain("Not enough data");
    expect(html).not.toMatch(/AI engines don.{1,8}t mention Sample Zero Co yet/);
    // No more big alarming "text-5xl" composite number.
    expect(html).not.toContain("text-5xl");
    // Frequency is now ALSO gated on noAnswers (aliased to headline) --
    // no real "0/100" renders at all any more for a sample audit, only
    // N/A: Frequency, Position, Source-citation all three.
    expect(html.match(/0\/100/g)?.length).toBeUndefined();
    expect(html.match(/>N\/A</g)?.length).toBe(3);
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

  // Same confirmed conflict as above: a REAL mention (1 of 5) no longer
  // matters -- sampleCount (5) alone is enough to force noAnswers, so
  // this case is now indistinguishable, on this page, from the
  // zero-mention case above. Before this hotfix (threshold = 1), this
  // rendered the live mention rate (20, 1 of 5); it no longer can.
  it("real-mention sample audit: ALSO renders 'Not enough data' now (noAnswers wins before insufficientData is checked) -- the live mention rate (20) no longer surfaces on this page at all", async () => {
    const SampleResultPage = (await import("@/app/(marketing)/sample-audit/result/[id]/page"))
      .default;
    const element = await SampleResultPage({
      params: Promise.resolve({ id: SAMPLE_REAL_AUDIT_ID }),
    });
    const audit = (element as unknown as { props: { audit: Record<string, unknown> } }).props
      .audit;
    expect(audit.insufficientData).toBe(false);
    expect(audit.noAnswers).toBe(true);

    const SampleResultView = (
      await import("@/app/(marketing)/sample-audit/result/[id]/sample-result-view")
    ).default;
    const html = renderToStaticMarkup(SampleResultView({ audit: audit as never }));
    expect(html).toContain("Not enough data");
    // Note: not asserting the live mention rate ("20") or the old
    // blended-composite fix's number ("69") are absent -- both are too
    // short a string, each coincidentally a substring of this fixture's
    // random UUID-based domain on some runs. "Not enough data" + the
    // unconditional dimension assertions below already prove neither
    // one is what's actually shown.
    expect(html).not.toMatch(/don.{1,8}t mention/);
    expect(html.match(/Not yet measured/g)?.length).toBe(2);
    // Same disclosure, unconditional on insufficient-data state -- a
    // real mention here doesn't mean the questions were tailored.
    expect(html).toContain(
      "These are general questions. Sign up to tailor them to your business and location.",
    );
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
