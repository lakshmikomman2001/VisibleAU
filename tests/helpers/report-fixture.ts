/**
 * DEMO-BLOCKER (1 Nov) -- a brand shaped like production's Omega Services
 * (Splice Marketing) with Audits #37, #38 and #39 in 2026-W44, for the
 * report PDF's tests and render check:
 * - #37 (31 Oct): Claude failed all 13 questions (spend limit), 5 of 30
 *   mentions (ChatGPT 2, Gemini 0, Perplexity 3), directories cited
 *   hipages 9, Word of Mouth 8, Localsearch 7, Airtasker 5, Yellow Pages
 *   5, ProductReview 1, True Local 1 -- none the owner's profile;
 * - #38 (1 Nov, morning): every engine, 9 of 40;
 * - #39 (1 Nov, evening): every engine, 7 of 40 (ChatGPT 4, Claude 0,
 *   Gemini 0, Perplexity 3).
 * Which question each mention fell on is this fixture's choice; the
 * per-engine totals are production's. Every mention is ranked #1 and links
 * the brand's own site (production: "typically #1", "5 of 5" sources).
 *
 * Seeds with a raw postgres client (the test DB only); `cleanup` removes
 * every row it made.
 */
import { randomUUID } from "node:crypto";
import type postgres from "postgres";

export const FIXTURE_ENGINES = ["chatgpt", "claude", "gemini", "perplexity"] as const;
type FixtureEngine = (typeof FIXTURE_ENGINES)[number];

const MODELS: Record<FixtureEngine, string> = {
  chatgpt: "gpt-4o-search-preview",
  claude: "claude-sonnet-4-5",
  gemini: "gemini-2.5-flash",
  perplexity: "sonar",
};

export const EVERYDAY_QUESTIONS = [
  "Who is the best handyman in Castle Hill for small repairs?",
  "Recommend a reliable local maintenance company near Castle Hill NSW",
  "Which property maintenance services in the Hills District have good reviews?",
  "I need someone to fix a leaking gutter in Castle Hill, who should I call?",
  "Best general trades business near Baulkham Hills for a quick job",
  "Who can do odd jobs and home repairs in Castle Hill this week?",
  "Affordable home maintenance services in north-west Sydney",
  "Trusted tradie for small renovations in the Hills Shire",
  "Where can I find a local handyman with insurance in Castle Hill?",
  "Which companies offer regular property maintenance in Castle Hill?",
];
export const BRANDED_QUESTIONS = [
  "Is Omega Services reputable?",
  "What do customers say about Omega Services?",
  "Does Omega Services service Castle Hill?",
];

export const SPEND_LIMIT_MESSAGE = "400 You have reached your specified API usage limits.";

export interface FixtureAuditSpec {
  number: number;
  completedAt: string;
  /** Engines every one of whose calls failed (spend limit). */
  failedEngines?: FixtureEngine[];
  /** engine -> everyday question numbers (1-based) whose answer named the brand. */
  mentions: Partial<Record<FixtureEngine, number[]>>;
  /** directory domain -> how many everyday answers cite it (the first N). */
  directories?: Record<string, number>;
}

export interface ReportFixtureOptions {
  brandName?: string;
  suburb?: string | null;
  state?: string | null;
  competitors?: string[];
  agencyName?: string | null;
  audits: FixtureAuditSpec[];
}

export interface ReportFixture {
  orgId: string;
  brandId: string;
  brandName: string;
  domain: string;
  audits: Record<number, string>;
  cleanup: () => Promise<void>;
}

/** Production's directory counts for #37. */
export const W44_DIRECTORIES: Record<string, number> = {
  "hipages.com.au": 9,
  "wordofmouth.com.au": 8,
  "localsearch.com.au": 7,
  "airtasker.com": 5,
  "yellowpages.com.au": 5,
  "productreview.com.au": 1,
  "truelocal.com.au": 1,
};

export const AUDIT_37: FixtureAuditSpec = {
  number: 37,
  completedAt: "2026-10-30T23:00:00.000Z", // 31 Oct, 10:00 am AEDT
  failedEngines: ["claude"],
  mentions: { chatgpt: [1, 4], gemini: [], perplexity: [1, 3, 6] },
  directories: W44_DIRECTORIES,
};
export const AUDIT_38: FixtureAuditSpec = {
  number: 38,
  completedAt: "2026-10-31T22:00:00.000Z", // 1 Nov, 9:00 am AEDT
  mentions: { chatgpt: [1, 2, 3, 6], claude: [1, 2], gemini: [], perplexity: [1, 2, 5] },
  directories: { "hipages.com.au": 6, "localsearch.com.au": 4 },
};
export const AUDIT_39: FixtureAuditSpec = {
  number: 39,
  completedAt: "2026-11-01T07:30:00.000Z", // 1 Nov, 6:30 pm AEDT
  mentions: { chatgpt: [1, 2, 3, 4], claude: [], gemini: [], perplexity: [1, 2, 5] },
  directories: { "hipages.com.au": 8, "wordofmouth.com.au": 6, "localsearch.com.au": 5 },
};

const MENTION_TEXT = (brand: string) =>
  `Here are some well-reviewed local options:\n1. ${brand} – general repairs and maintenance\n2. Hills Handy Co – small jobs\n3. Northwest Property Care`;
const NO_MENTION_TEXT =
  "Here are some well-reviewed local options:\n1. Hills Handy Co – small jobs\n2. Northwest Property Care\n3. Castle Trades Group";

export async function seedReportFixture(
  sql: postgres.Sql,
  options: ReportFixtureOptions,
): Promise<ReportFixture> {
  const orgId = randomUUID();
  const brandId = randomUUID();
  const tag = orgId.slice(0, 8);
  const brandName = options.brandName ?? "Omega Services";
  const domain = `omega-${tag}.example.com.au`;

  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${orgId}, ${`report-fixture-${tag}`}, ${`Splice Marketing ${tag}`}, ${`report-fixture-${tag}`})
  `;
  await sql`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions,
                        suburb, state, categories, competitors)
    VALUES (${brandId}, ${orgId}, ${brandName}, ${domain}, 'tradies', 'au',
            ARRAY['NSW:Castle Hill'], ${options.suburb === undefined ? "Castle Hill" : options.suburb},
            ${options.state === undefined ? "NSW" : options.state}, ARRAY['trades_general'],
            ${options.competitors ?? []})
  `;
  if (options.agencyName) {
    await sql`
      INSERT INTO agency_brand_assets (organization_id, brand_id, agency_name)
      VALUES (${orgId}, NULL, ${options.agencyName})
    `;
  }

  const auditIds: Record<number, string> = {};
  const citationRows: Record<string, unknown>[] = [];
  const failureRows: Record<string, string | number | boolean>[] = [];
  for (const spec of options.audits) {
    const auditId = randomUUID();
    auditIds[spec.number] = auditId;
    const failed = new Set(spec.failedEngines ?? []);
    const promptsCount = EVERYDAY_QUESTIONS.length + BRANDED_QUESTIONS.length;
    const engineFailures = Object.fromEntries([...failed].map((e) => [e, promptsCount]));
    const completedAt = new Date(spec.completedAt);
    const startedAt = new Date(completedAt.getTime() - 175_000);
    await sql`
      INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count,
                          runs_per_prompt, metadata, started_at, completed_at, prompt_pack_version,
                          methodology_version)
      VALUES (${auditId}, ${brandId}, ${orgId}, ${spec.number}, 'complete', ${[...FIXTURE_ENGINES]},
              ${promptsCount}, 1, ${sql.json({ engineFailures })}, ${startedAt}, ${completedAt}, 1, 2)
    `;

    // The everyday answers, in a fixed order: the first N cite each directory.
    let answerIndex = 0;
    for (const engine of FIXTURE_ENGINES) {
      if (failed.has(engine)) {
        const all = [...EVERYDAY_QUESTIONS, ...BRANDED_QUESTIONS];
        failureRows.push(
          ...all.map((prompt, i) => ({
            audit_id: auditId,
            organization_id: orgId,
            engine,
            prompt,
            prompt_index: i,
            is_branded_prompt: i >= EVERYDAY_QUESTIONS.length,
            error_class: "other",
            error_message: SPEND_LIMIT_MESSAGE,
            attempts: 1,
            latency_ms: 120,
          })),
        );
        continue;
      }
      const mentioned = new Set(spec.mentions[engine] ?? []);
      for (const [i, prompt] of EVERYDAY_QUESTIONS.entries()) {
        const isMention = mentioned.has(i + 1);
        const sources: Array<{ domain: string; url: string }> = [];
        if (isMention) sources.push({ domain, url: `https://${domain}/` });
        for (const [dirDomain, count] of Object.entries(spec.directories ?? {})) {
          if (answerIndex < count) {
            sources.push({
              domain: dirDomain,
              url: `https://${dirDomain}/listing/another-business-${answerIndex}`,
            });
          }
        }
        const text = isMention ? MENTION_TEXT(brandName) : NO_MENTION_TEXT;
        citationRows.push({
          audit_id: auditId,
          engine,
          prompt,
          prompt_index: i,
          run_number: 1,
          brand_mentioned: isMention,
          is_branded_prompt: false,
          mention_verification: isMention ? "verified_domain" : null,
          response_text: text,
          response_snippet: text.slice(0, 500),
          cited_sources: sql.json(sources),
          llm_model: MODELS[engine],
        });
        answerIndex++;
      }
      for (const [j, prompt] of BRANDED_QUESTIONS.entries()) {
        const text = `${brandName} is a local business in Castle Hill.`;
        citationRows.push({
          audit_id: auditId,
          engine,
          prompt,
          prompt_index: EVERYDAY_QUESTIONS.length + j,
          run_number: 1,
          brand_mentioned: true,
          is_branded_prompt: true,
          mention_verification: "verified_domain",
          response_text: text,
          response_snippet: text,
          cited_sources: sql.json([]),
          llm_model: MODELS[engine],
        });
      }
    }
  }
  if (citationRows.length > 0) await sql`INSERT INTO citations ${sql(citationRows)}`;
  if (failureRows.length > 0) await sql`INSERT INTO engine_call_failures ${sql(failureRows)}`;

  const cleanup = async () => {
    const ids = Object.values(auditIds);
    await sql`DELETE FROM generated_reports WHERE brand_id = ${brandId}`;
    await sql`DELETE FROM evidence_snapshots WHERE brand_id = ${brandId}`;
    if (ids.length > 0) {
      await sql`DELETE FROM engine_call_failures WHERE audit_id = ANY(${ids})`;
      await sql`DELETE FROM citations WHERE audit_id = ANY(${ids})`;
    }
    await sql`DELETE FROM brand_directory_listings WHERE brand_id = ${brandId}`;
    await sql`DELETE FROM agency_brand_assets WHERE organization_id = ${orgId}`;
    await sql`DELETE FROM report_delivery_schedules WHERE organization_id = ${orgId}`;
    await sql`DELETE FROM report_templates WHERE organization_id = ${orgId}`;
    await sql`DELETE FROM visibility_trends WHERE brand_id = ${brandId}`;
    await sql`DELETE FROM audits WHERE brand_id = ${brandId}`;
    await sql`DELETE FROM brands WHERE id = ${brandId}`;
    await sql`DELETE FROM organizations WHERE id = ${orgId}`;
  };

  return { orgId, brandId, brandName, domain, audits: auditIds, cleanup };
}
