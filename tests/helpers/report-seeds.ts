/**
 * S01B part 4a (LLD amendment 51): the report fixtures. Three invented businesses, each seeded as real audits in the
 * integration database and turned into a report by the real code path -- the audit's own recommendation step for its
 * Action Center items, then the generator (buildReportData -> buildReportV2 -> snapshot) and the renderer -- never
 * hand-composed render input. Each is named after what it renders, and shaped like a real client of the agency
 * that uses Vunnara, without any of their data (S02 part 0, LLD amendments 57 and 66: no real name anywhere):
 * - BLUEGUM ("Bluegum Home Services", like the real audit #54): home services on Sydney's north shore, 6 of 40
 *   answers, Yellow Pages and hipages cited most, the owner's Yellow Pages profile linked, the ABN verified, an
 *   earlier audit for the trend, an agency note, an agency action and an item done since the last report;
 * - IRONSTONE ("Ironstone Property Services", like the real audit #55): property maintenance in Castle Hill, Claude
 *   out of credit for the whole audit, 5 of 30 answers, seven directories cited and none linked, Reddit cited;
 * - KURRAJONG ("Kurrajong IT Solutions", like the real audit #52): IT support in western Sydney, 0 of 40 answers, other
 *   providers' sites cited instead, Claude saying it couldn't find the business, Local Business Guide not linked, an
 *   ABN on file that isn't verified;
 * - WARATAH ("Waratah Home Services", S01C part 3a, like the real audit #54 report reviewed on 25 Nov 2026): general
 *   trades in Lidcombe NSW 2141 (the brand's own postcode), 13 directories cited 73 times, Gemini at 0 of 10 while its
 *   answers cite directories, 13 Google questions, rule j and the Wikipedia item as the other actions, and a trend
 *   with a 3-of-4 audit (Claude refused by the spend limit), a question change and an audit excluded from trends.
 * Each business's own domain is under example.com.au; the other businesses AI cites instead are under the reserved .test
 * domain (each its own registrable domain, so none reads as the brand's own site). ABNs are made up, and every name is
 * invented.
 *
 * Seeds with a raw postgres client (the test database only); `cleanup` removes every row it made. Callers set
 * DATABASE_URL and SERVICE_DATABASE_URL to the test database first (the recommendation step reads through the app).
 */
import { randomUUID } from "node:crypto";
import type postgres from "postgres";

export const SEED_ENGINES = ["chatgpt", "claude", "gemini", "perplexity"] as const;
type Engine = (typeof SEED_ENGINES)[number];

const MODELS: Record<Engine, string> = {
  chatgpt: "gpt-4o-search-preview",
  claude: "claude-sonnet-4-5",
  gemini: "gemini-2.5-flash",
  perplexity: "sonar",
};

const OUT_OF_CREDIT = "400 You have reached your specified API usage limits.";

interface SeedAudit {
  number: number;
  completedAt: string;
  failedEngines?: Engine[];
  /** The audit's own everyday questions, when they differ from the spec's (a question change). */
  everyday?: readonly string[];
  /** audits.prompt_pack_version (1 when absent): audits compare only within one version. */
  promptPackVersion?: number;
  /** audits.excluded_from_trends_reason: an operator excluded the audit from every trend. */
  excludedReason?: string;
  /**
   * The answer (0-based, in engine order, ten each) a directory's citations start at -- 0 when absent -- so they can
   * fall on a chosen engine's answers (S01C: Gemini's, the third engine's, are answers 20-29).
   */
  directoryStart?: Record<string, number>;
  /** engine -> everyday question numbers (1-based) whose answer named the business. */
  mentions: Partial<Record<Engine, number[]>>;
  /** domain -> how many everyday answers cite it (the first N answers, in engine order). */
  directories?: Record<string, number>;
  /** Of a directory's citations, how many link the owner's own profile (the rest link other businesses'). */
  ownProfileCitations?: Record<string, number>;
  /** Other businesses' own sites -> how many everyday answers cite them (rule g). */
  otherSites?: Record<string, number>;
  reddit?: number;
}

export interface SeedSpec {
  key: "bluegum" | "ironstone" | "kurrajong" | "waratah";
  brandName: string;
  domainStem: string;
  vertical: "tradies" | "professional_services";
  categories: string[];
  suburb: string;
  state: string;
  /** brands.postcode (the brand's own; absent leaves it null). */
  postcode?: string;
  region: string;
  competitors: string[];
  everyday: readonly string[];
  branded: readonly string[];
  /** The listed businesses in an answer that names the brand, and in one that doesn't. */
  others: readonly string[];
  /** engine -> what its answers to the branded questions say (default: a short description naming the brand). */
  brandedAnswer?: Partial<Record<Engine, string>>;
  audits: SeedAudit[];
  /** The owner's confirmed directory profiles: directory key -> profile URL path on that directory's site. */
  linkedProfiles?: Record<string, { domain: string; path: string }>;
  abn: string | null;
  /** The latest identity check; status and name null for a check that ran with no ABN on file (lookupAbn's result). */
  entity: { verified: boolean; status: string | null; name: string | null } | null;
  technicalScore: string;
  /**
   * audits.score_frequency on the basis audit, as the runner stores it and the recommendation step reads it (absent:
   * null, which that step reads as 100, as the first three seeds always had). Waratah's 15.00 lets the Wikipedia
   * check's item fire, as it did for the real audit #54.
   */
  scoreFrequency?: string;
  /** The technical audit's per-area scores (absent leaves them null, as the first three seeds have). */
  technicalDims?: Partial<
    Record<"robots" | "schema" | "meta" | "content" | "brand_entity" | "signals", number>
  >;
  /** The basis audit's Google Search AI results: every everyday and branded question, on both surfaces. */
  google?: {
    locationCode: number;
    locationLabel: string;
    mentionedOnAiMode: number[];
    /** S02 part 0: question numbers (1-based) AI Mode gave no answer for ("No answer"); absent: none. */
    aiModeNotShown?: number[];
    /** S02 part 0: Google answered nothing -- every question skipped with this stored reason, as the collector does. */
    skippedReason?: string;
  };
  /** Agency workflow on the basis audit's items: an in-progress item, a note, an agency action, one done item. */
  agencyWork: boolean;
}

export const BLUEGUM: SeedSpec = {
  key: "bluegum",
  brandName: "Bluegum Home Services",
  domainStem: "bluegumhome",
  vertical: "tradies",
  categories: ["trades_plumbing"],
  suburb: "Chatswood",
  state: "NSW",
  region: "NSW:Chatswood",
  competitors: ["Northshore Plumbing Co", "Lane Cove Trades"],
  everyday: [
    "Who is the best emergency plumber in Chatswood?",
    "Recommend a reliable plumber near Chatswood NSW",
    "Which home maintenance companies on the north shore have good reviews?",
    "I have a blocked drain in Chatswood, who should I call?",
    "Best hot water system installer near Willoughby",
    "Who can fix a leaking tap in Chatswood this week?",
    "Affordable plumbing services on Sydney's lower north shore",
    "Trusted tradie for bathroom repairs in Chatswood",
    "Where can I find a licensed plumber with good reviews in Artarmon?",
    "Which companies offer home maintenance plans in Chatswood?",
  ],
  branded: [
    "Is Bluegum Home Services reputable?",
    "What do customers say about Bluegum Home Services?",
    "Does Bluegum Home Services work in Chatswood?",
  ],
  others: ["Northshore Plumbing Co", "Lane Cove Trades", "Willoughby Drains"],
  audits: [
    {
      number: 53,
      completedAt: "2026-11-13T03:00:00.000Z",
      mentions: { chatgpt: [1, 2], claude: [3], gemini: [], perplexity: [1, 4] },
      directories: { "yellowpages.com.au": 15, "hipages.com.au": 8, "airtasker.com": 5 },
      ownProfileCitations: { "yellowpages.com.au": 2 },
    },
    {
      number: 54,
      completedAt: "2026-11-20T03:00:00.000Z",
      mentions: { chatgpt: [1, 4], claude: [2], gemini: [], perplexity: [1, 3, 6] },
      directories: {
        "yellowpages.com.au": 17,
        "hipages.com.au": 9,
        "airtasker.com": 6,
        "localsearch.com.au": 4,
      },
      ownProfileCitations: { "yellowpages.com.au": 3 },
    },
  ],
  linkedProfiles: {
    yellow_pages_au: {
      domain: "yellowpages.com.au",
      path: "/nsw/chatswood/bluegum-home-services-15530000",
    },
  },
  abn: "51824753557",
  entity: { verified: true, status: "Active", name: "BLUEGUM HOME SERVICES PTY LTD" },
  technicalScore: "48.00",
  agencyWork: true,
};

export const IRONSTONE: SeedSpec = {
  key: "ironstone",
  brandName: "Ironstone Property Services",
  domainStem: "ironstoneproperty",
  vertical: "tradies",
  categories: ["trades_general"],
  suburb: "Castle Hill",
  state: "NSW",
  region: "NSW:Castle Hill",
  competitors: ["Hills Handy Co"],
  everyday: [
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
  ],
  branded: [
    "Is Ironstone Property Services reputable?",
    "What do customers say about Ironstone Property Services?",
    "Does Ironstone Property Services service Castle Hill?",
  ],
  others: ["Hills Handy Co", "Northwest Property Care", "Castle Trades Group"],
  audits: [
    {
      number: 55,
      completedAt: "2026-11-20T02:00:00.000Z",
      failedEngines: ["claude"],
      mentions: { chatgpt: [1, 4], gemini: [], perplexity: [1, 3, 6] },
      directories: {
        "hipages.com.au": 9,
        "wordofmouth.com.au": 8,
        "localsearch.com.au": 7,
        "airtasker.com": 5,
        "yellowpages.com.au": 5,
        "productreview.com.au": 1,
        "truelocal.com.au": 1,
      },
      reddit: 2,
    },
  ],
  abn: "33628104975",
  entity: { verified: true, status: "Active", name: "IRONSTONE PROPERTY SERVICES PTY LTD" },
  technicalScore: "37.00",
  agencyWork: false,
};

export const KURRAJONG: SeedSpec = {
  key: "kurrajong",
  brandName: "Kurrajong IT Solutions",
  domainStem: "kurrajongit",
  vertical: "professional_services",
  categories: ["general"],
  suburb: "Penrith",
  state: "NSW",
  region: "NSW:Penrith",
  competitors: [],
  everyday: [
    "Who is the best IT support company in Penrith for small businesses?",
    "Recommend a managed IT services provider near Penrith NSW",
    "Which IT companies in western Sydney have good reviews?",
    "My office network keeps dropping out in Penrith, who should I call?",
    "Best computer repair service near St Marys",
    "Who can set up Microsoft 365 for a small business in Penrith?",
    "Affordable IT support for a dental practice in western Sydney",
    "Trusted cyber security help for a small business in Penrith",
    "Where can I find on-site IT support in the Blue Mountains?",
    "Which companies offer IT support plans for small offices in Penrith?",
  ],
  branded: [
    "Is Kurrajong IT Solutions reputable?",
    "What do customers say about Kurrajong IT Solutions?",
    "Does Kurrajong IT Solutions support businesses in Penrith?",
  ],
  others: ["Wattle IT Group", "Southern Byte Technology", "Lyrebird Tech Services"],
  brandedAnswer: {
    claude:
      "I was unable to find any verified information about a company specifically called Kurrajong IT Solutions in Penrith. It may be a small or newly registered business.",
  },
  audits: [
    {
      number: 52,
      completedAt: "2026-11-20T01:00:00.000Z",
      mentions: {},
      directories: {
        "localbusinessguide.com.au": 14,
        "directso.com.au": 6,
        "whereis.com": 4,
      },
      otherSites: {
        "wattle-it.test": 27,
        "southern-byte.test": 9,
        "lyrebird-tech.test": 6,
      },
    },
  ],
  abn: "86103551072",
  entity: { verified: false, status: "Cancelled", name: "KURRAJONG COMPUTING PTY LTD" },
  technicalScore: "22.00",
  agencyWork: false,
};

const WARATAH_EVERYDAY = [
  "Who is the best handyman in Lidcombe for small repairs?",
  "Recommend a reliable home maintenance company near Lidcombe NSW",
  "Which general trades businesses in western Sydney have good reviews?",
  "I need someone to fix a sticking door in Lidcombe, who should I call?",
  "Best tradie near Auburn for odd jobs around the house",
  "Who can patch plasterboard and paint a wall in Lidcombe this week?",
  "Affordable home repairs in the Cumberland area",
  "Trusted tradesperson for small renovations near Berala",
  "Where can I find an insured handyman with good reviews in Lidcombe?",
  "Which companies offer regular property maintenance in Lidcombe?",
] as const;

/** The question set before the change at #47: one question was replaced. */
const WARATAH_EVERYDAY_BEFORE = [
  ...WARATAH_EVERYDAY.slice(0, 9),
  "Who does gutter cleaning in Lidcombe?",
] as const;

/** Where each directory's citations fall in the basis audit (Gemini's answers are 20-29). */
const WARATAH_START: Record<string, number> = {
  "yellowpages.com.au": 0,
  "localsearch.com.au": 30,
  "hipages.com.au": 20,
  "airtasker.com": 22,
  "wordofmouth.com.au": 25,
  "serviceseeking.com.au": 10,
  "oneflare.com.au": 14,
  "truelocal.com.au": 33,
  "google.com": 5,
  "localbusinessguide.com.au": 0,
  "whereis.com": 8,
  "birdeye.com": 16,
  "startlocal.com.au": 38,
};

const WARATAH_DIRECTORIES = {
  // The 9 usual directories for general trades, 58 times (Localsearch linked, 2 of its citations the owner's own).
  "yellowpages.com.au": 17,
  "localsearch.com.au": 8,
  "hipages.com.au": 7,
  "airtasker.com": 5,
  "wordofmouth.com.au": 5,
  "serviceseeking.com.au": 5,
  "oneflare.com.au": 4,
  "truelocal.com.au": 4,
  "google.com": 3,
  // 4 others, 15 times: 13 directories cited 73 times in all.
  "localbusinessguide.com.au": 5,
  "whereis.com": 5,
  "birdeye.com": 4,
  "startlocal.com.au": 1,
};

const waratahAudit = (
  number: number,
  completedAt: string,
  extra: Partial<SeedAudit> = {},
): SeedAudit => ({
  number,
  completedAt,
  promptPackVersion: 2,
  mentions: { chatgpt: [1, 4], claude: [2], gemini: [], perplexity: [3] },
  directories: { "yellowpages.com.au": 15, "hipages.com.au": 6, "localsearch.com.au": 4 },
  ownProfileCitations: { "localsearch.com.au": 1 },
  ...extra,
});

export const WARATAH: SeedSpec = {
  key: "waratah",
  brandName: "Waratah Home Services",
  domainStem: "waratahhome",
  vertical: "tradies",
  categories: ["trades_general"],
  suburb: "Lidcombe",
  state: "NSW",
  postcode: "2141",
  region: "NSW:Lidcombe",
  competitors: [],
  everyday: WARATAH_EVERYDAY,
  branded: [
    "Is Waratah Home Services reputable?",
    "What do customers say about Waratah Home Services?",
    "Does Waratah Home Services work in Lidcombe?",
  ],
  others: ["Cumberland Handy Co", "Auburn Home Repairs", "Berala Trades Group"],
  audits: [
    waratahAudit(46, "2026-10-16T03:00:00.000Z", {
      everyday: WARATAH_EVERYDAY_BEFORE,
      promptPackVersion: 1,
    }),
    waratahAudit(47, "2026-10-23T03:00:00.000Z", {
      failedEngines: ["claude"],
      mentions: { chatgpt: [1], gemini: [], perplexity: [3] },
    }),
    waratahAudit(48, "2026-10-30T03:00:00.000Z"),
    waratahAudit(49, "2026-11-06T03:00:00.000Z", {
      excludedReason: "measured with an earlier version of the mention check",
      mentions: {},
    }),
    waratahAudit(50, "2026-11-10T03:00:00.000Z", {
      mentions: { chatgpt: [1, 4, 7], claude: [2], gemini: [], perplexity: [3] },
    }),
    waratahAudit(52, "2026-11-14T03:00:00.000Z"),
    waratahAudit(54, "2026-11-21T03:00:00.000Z", {
      mentions: { chatgpt: [1, 4, 7], claude: [2], gemini: [], perplexity: [3, 6] },
      directories: WARATAH_DIRECTORIES,
      directoryStart: WARATAH_START,
      ownProfileCitations: { "localsearch.com.au": 2 },
    }),
  ],
  linkedProfiles: {
    localsearch: {
      domain: "localsearch.com.au",
      path: "/profile/waratah-home-services/lidcombe-nsw/2141001",
    },
  },
  scoreFrequency: "15.00",
  abn: null,
  // Checked with no ABN on file, as the technical audit's identity check stores it (lib/brand-entity/abn-lookup.ts).
  entity: { verified: false, status: null, name: null },
  technicalScore: "40.00",
  technicalDims: { robots: 18, schema: 4, meta: 9, content: 5, brand_entity: 2, signals: 2 },
  google: { locationCode: 9071881, locationLabel: "2141 NSW", mentionedOnAiMode: [3] },
  agencyWork: false,
};

export const REPORT_SEEDS = [BLUEGUM, IRONSTONE, KURRAJONG, WARATAH] as const;

export interface SeededReportBrand {
  spec: SeedSpec;
  orgId: string;
  brandId: string;
  domain: string;
  audits: Record<number, string>;
  basisAuditId: string;
  /** The Action Center item the agency hid from the report (agencyWork seeds), by title. */
  hiddenActionTitle: string | null;
  cleanup: () => Promise<void>;
}

const mentionText = (brand: string, others: readonly string[]) =>
  `Here are some well-reviewed local options:\n1. ${brand} – well reviewed and local\n2. ${others[0]}\n3. ${others[1]}`;
const noMentionText = (others: readonly string[]) =>
  `Here are some well-reviewed local options:\n1. ${others[0]}\n2. ${others[1]}\n3. ${others[2]}`;

/** Seeds one business: workspace, brand, audits and answers, checks, then its Action Center items as an audit makes them. */
export async function seedReportBrand(
  sql: postgres.Sql,
  spec: SeedSpec,
): Promise<SeededReportBrand> {
  const orgId = randomUUID();
  const brandId = randomUUID();
  const tag = orgId.slice(0, 8);
  const domain = `${spec.domainStem}-${tag}.example.com.au`;

  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${orgId}, ${`report-seed-${tag}`}, ${`Possum Marketing ${tag}`}, ${`report-seed-${tag}`})`;
  await sql`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, suburb, state,
                        postcode, categories, competitors, abn)
    VALUES (${brandId}, ${orgId}, ${spec.brandName}, ${domain}, ${spec.vertical}, 'au', ${[spec.region]},
            ${spec.suburb}, ${spec.state}, ${spec.postcode ?? null}, ${spec.categories}, ${spec.competitors},
            ${spec.abn})`;
  await sql`
    INSERT INTO agency_brand_assets (organization_id, brand_id, agency_name)
    VALUES (${orgId}, NULL, 'Possum Marketing')`;
  await sql`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier,
                               billing_interval, status)
    VALUES (${orgId}, ${`cus_${tag}`}, ${`sub_${tag}`}, 'price_test', 'agency', 'monthly', 'active')`;
  await sql`
    INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled) VALUES (${orgId}, 'report_v2', true)`;

  for (const [key, profile] of Object.entries(spec.linkedProfiles ?? {})) {
    await sql`
      INSERT INTO brand_directory_listings (organization_id, brand_id, directory_key, status, profile_url, confirmed_at)
      VALUES (${orgId}, ${brandId}, ${key}, 'listed', ${`https://www.${profile.domain}${profile.path}`}, now())`;
  }

  const auditIds: Record<number, string> = {};
  for (const audit of spec.audits) {
    const auditId = randomUUID();
    auditIds[audit.number] = auditId;
    const failed = new Set(audit.failedEngines ?? []);
    const everyday = audit.everyday ?? spec.everyday;
    const promptsCount = everyday.length + spec.branded.length;
    const completedAt = new Date(audit.completedAt);
    await sql`
      INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt,
                          metadata, started_at, completed_at, prompt_pack_version, methodology_version,
                          excluded_from_trends_reason)
      VALUES (${auditId}, ${brandId}, ${orgId}, ${audit.number}, 'complete', ${[...SEED_ENGINES]}, ${promptsCount}, 1,
              ${sql.json({ engineFailures: Object.fromEntries([...failed].map((e) => [e, promptsCount])) })},
              ${new Date(completedAt.getTime() - 180_000)}, ${completedAt}, ${audit.promptPackVersion ?? 1}, 2,
              ${audit.excludedReason ?? null})`;

    const rows: Record<string, unknown>[] = [];
    const failures: Record<string, unknown>[] = [];
    let answer = 0;
    for (const engine of SEED_ENGINES) {
      if (failed.has(engine)) {
        for (const [i, prompt] of [...everyday, ...spec.branded].entries())
          failures.push({
            audit_id: auditId,
            organization_id: orgId,
            engine,
            prompt,
            prompt_index: i,
            is_branded_prompt: i >= everyday.length,
            error_class: "other",
            error_message: OUT_OF_CREDIT,
            attempts: 1,
            latency_ms: 120,
          });
        continue;
      }
      const mentioned = new Set(audit.mentions[engine] ?? []);
      for (const [i, prompt] of everyday.entries()) {
        const isMention = mentioned.has(i + 1);
        const sources: Array<{ domain: string; url: string }> = [];
        if (isMention) sources.push({ domain, url: `https://${domain}/` });
        for (const [dir, count] of Object.entries(audit.directories ?? {})) {
          const start = audit.directoryStart?.[dir] ?? 0;
          if (answer < start || answer >= start + count) continue;
          const own = answer - start < (audit.ownProfileCitations?.[dir] ?? 0);
          const profile = Object.values(spec.linkedProfiles ?? {}).find((p) => p.domain === dir);
          sources.push({
            domain: dir,
            url:
              own && profile
                ? `https://www.${dir}${profile.path}`
                : `https://www.${dir}/listing/another-business-${answer}`,
          });
        }
        for (const [site, count] of Object.entries(audit.otherSites ?? {}))
          if (answer < count)
            sources.push({ domain: site, url: `https://${site}/services/it-support` });
        if (answer < (audit.reddit ?? 0))
          sources.push({
            domain: "reddit.com",
            url: `https://www.reddit.com/r/sydney/comments/seed${answer}/recommendations/`,
          });
        const text = isMention
          ? mentionText(spec.brandName, spec.others)
          : noMentionText(spec.others);
        rows.push({
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
        answer++;
      }
      for (const [j, prompt] of spec.branded.entries()) {
        const text =
          spec.brandedAnswer?.[engine] ??
          `${spec.brandName} is a local business in ${spec.suburb}.`;
        const found = !spec.brandedAnswer?.[engine];
        rows.push({
          audit_id: auditId,
          engine,
          prompt,
          prompt_index: everyday.length + j,
          run_number: 1,
          brand_mentioned: found,
          is_branded_prompt: true,
          mention_verification: found ? "verified_domain" : null,
          response_text: text,
          response_snippet: text.slice(0, 500),
          cited_sources: sql.json([]),
          llm_model: MODELS[engine],
        });
      }
    }
    if (rows.length > 0) await sql`INSERT INTO citations ${sql(rows)}`;
    if (failures.length > 0) await sql`INSERT INTO engine_call_failures ${sql(failures)}`;
  }
  const basisNumber = Math.max(...spec.audits.map((a) => a.number));
  const basisAuditId = auditIds[basisNumber];
  if (spec.scoreFrequency) {
    await sql`UPDATE audits SET score_frequency = ${spec.scoreFrequency} WHERE id = ${basisAuditId}`;
  }

  // The checks outside AI answers, all within their Enhanced windows (an Enhanced report re-runs nothing).
  if (spec.entity) {
    await sql`
      INSERT INTO brand_entity_scores (brand_id, organization_id, abn_verified, abn_number, abn_entity_name, abn_status,
                                       wikipedia_au_present, au_tld_domains, checked_at)
      VALUES (${brandId}, ${orgId}, ${spec.entity.verified}, ${spec.abn}, ${spec.entity.name}, ${spec.entity.status},
              false, ${sql.json([domain])}, now() - interval '2 days')`;
  }
  const dims = spec.technicalDims ?? {};
  await sql`
    INSERT INTO technical_audits (brand_id, organization_id, audit_id, score_composite, score_robots, score_schema,
                                  score_meta, score_content, score_brand_entity, score_signals, findings, created_at,
                                  crawled_at)
    VALUES (${brandId}, ${orgId}, ${basisAuditId}, ${spec.technicalScore}, ${dims.robots ?? null},
            ${dims.schema ?? null}, ${dims.meta ?? null}, ${dims.content ?? null}, ${dims.brand_entity ?? null},
            ${dims.signals ?? null},
            ${sql.json({
              scoringVersion: 4,
              robots: {
                fetchStatus: "ok",
                aiBotsAllowed: ["OAI-SearchBot", "Claude-SearchBot", "PerplexityBot", "Googlebot"],
                aiBotsBlocked: [],
              },
            })}, now() - interval '1 day', now() - interval '1 day')`;

  // S01C part 3a: the basis audit's Google Search AI questions, as the Google job stores them (both surfaces).
  if (spec.google) {
    const basis = spec.audits.find(
      (a) => a.number === Math.max(...spec.audits.map((x) => x.number)),
    );
    const everyday = basis?.everyday ?? spec.everyday;
    const completedAt = new Date(basis?.completedAt ?? Date.now());
    await sql`
      INSERT INTO audit_google_surfaces (audit_id, organization_id, surfaces, settings, location, status, completed_at,
                                         created_at)
      VALUES (${basisAuditId}, ${orgId}, ${["google_ai_overviews", "google_ai_mode"]},
              ${sql.json({
                aiOverviewsEnabled: true,
                aiModeEnabled: true,
                countInHeadline: false,
                queueMode: "standard",
                device: "desktop",
                maxCostUsdPerAudit: 1,
                provider: "dataforseo",
                decisions: {
                  google_ai_overviews: { on: true, reason: "global" },
                  google_ai_mode: { on: true, reason: "global" },
                },
              })},
              ${sql.json({
                code: spec.google.locationCode,
                label: spec.google.locationLabel,
                kind: "postcode",
                precise: true,
                note: null,
              })}, 'complete', ${completedAt}, ${completedAt})`;
    const results: Record<string, unknown>[] = [];
    for (const surface of ["google_ai_overviews", "google_ai_mode"] as const) {
      for (const [i, prompt] of [...everyday, ...spec.branded].entries()) {
        const branded = i >= everyday.length;
        const skipped = spec.google.skippedReason !== undefined;
        const shown =
          !skipped &&
          (surface === "google_ai_mode"
            ? !(spec.google.aiModeNotShown ?? []).includes(i + 1)
            : i % 3 !== 2);
        const mentioned =
          branded ||
          (surface === "google_ai_mode" && spec.google.mentionedOnAiMode.includes(i + 1));
        results.push({
          audit_id: basisAuditId,
          organization_id: orgId,
          surface,
          prompt,
          prompt_index: i,
          is_branded_prompt: branded,
          outcome: skipped ? "skipped" : shown ? "shown" : "not_shown",
          outcome_reason: skipped ? spec.google.skippedReason : null,
          provider: "dataforseo",
          attempts: 1,
          answer_text: shown ? noMentionText(spec.others) : null,
          cited_links: sql.json(
            shown
              ? [
                  {
                    domain: "yellowpages.com.au",
                    url: `https://www.yellowpages.com.au/listing/g${i}`,
                    googleLink: false,
                  },
                ]
              : [],
          ),
          google_link_count: 0,
          brand_mentioned: shown ? mentioned : null,
          mention_verification: shown && mentioned ? "verified_domain" : null,
          location_code: spec.google.locationCode,
          location_label: spec.google.locationLabel,
          device: "desktop",
        });
      }
    }
    await sql`INSERT INTO google_surface_results ${sql(results)}`;
  }

  // The basis audit's Action Center items, made by the audit's own recommendation step
  // (inngest/functions/generate-recommendations.ts), with the one network check (Wikipedia) recorded.
  await buildActionItems({ orgId, brandId, auditId: basisAuditId, spec });

  let hiddenActionTitle: string | null = null;
  if (spec.agencyWork) {
    // A report sent a week before, an item done since, the agency's note and its own action.
    await sql`
      INSERT INTO generated_reports (brand_id, organization_id, audit_id, report_type, period_label, narrative_text,
                                     headline, created_at)
      VALUES (${brandId}, ${orgId}, ${auditIds[spec.audits[0].number]}, 'weekly', '2026-W46', 'n', 'h',
              '2026-11-14T00:00:00Z')`;
    await sql`
      INSERT INTO action_items (organization_id, brand_id, recommendation_key, dimension, title, action,
                                confidence_label, expected_impact_score, status, done_at)
      VALUES (${orgId}, ${brandId}, 'seed-done-gbp', 'frequency', 'Claim your Google Business Profile', 'Done.',
              'likely', 'low', 'done', '2026-11-17T00:00:00Z')`;
    const [directoryItem] = await sql<{ id: string }[]>`
      SELECT id FROM action_items WHERE audit_id = ${basisAuditId} AND recommendation_key = 'directory-visibility'`;
    if (directoryItem) {
      await sql`UPDATE action_items SET status = 'in_progress' WHERE id = ${directoryItem.id}`;
      await sql`
        INSERT INTO report_action_choices (organization_id, brand_id, action_item_id, included, position, note)
        VALUES (${orgId}, ${brandId}, ${directoryItem.id}, true, 0,
                'We are updating the hipages profile this week, then Airtasker.')`;
    }
    // The agency hides one other item (here a finding's own action: Bluegum has no other open item): a hidden action
    // never prints, and its finding's card shows the finding without the action's pills.
    // S04 part 0i (LLD amendment 91): picked by title, so it's the same item every run -- the audit writes its items
    // in one transaction, so their created_at are equal, and ORDER BY created_at, id picked by a random id.
    const [other] = await sql<{ id: string; title: string }[]>`
      SELECT id, title FROM action_items
      WHERE audit_id = ${basisAuditId} AND status = 'open' AND recommendation_key <> 'directory-visibility'
      ORDER BY title COLLATE "C", id LIMIT 1`;
    if (other) {
      hiddenActionTitle = other.title;
      await sql`
        INSERT INTO report_action_choices (organization_id, brand_id, action_item_id, included, position, note)
        VALUES (${orgId}, ${brandId}, ${other.id}, false, 1, NULL)`;
    }
    await sql`
      INSERT INTO agency_actions (organization_id, brand_id, title, detail, priority, position)
      VALUES (${orgId}, ${brandId}, 'Ask five recent customers for a Yellow Pages review',
              'Send the review link with each invoice this month.', 'high', 0)`;
  }

  const cleanup = async () => {
    const ids = Object.values(auditIds);
    for (const table of [
      "report_action_choices",
      "report_brand_preferences",
      "agency_actions",
      "generated_reports",
      "action_items",
      "technical_audits",
      "youtube_presence_audits",
      "org_feature_flags",
      "brand_directory_listings",
      "agency_brand_assets",
      "report_delivery_schedules",
      "report_templates",
      "visibility_trends",
    ])
      await sql`DELETE FROM ${sql(table)} WHERE organization_id = ${orgId}`;
    await sql`DELETE FROM brand_entity_scores WHERE brand_id = ${brandId}`;
    await sql`DELETE FROM evidence_snapshots WHERE brand_id = ${brandId}`;
    if (ids.length > 0) {
      await sql`DELETE FROM google_surface_results WHERE audit_id = ANY(${ids})`;
      await sql`DELETE FROM audit_google_surfaces WHERE audit_id = ANY(${ids})`;
      await sql`DELETE FROM engine_call_failures WHERE audit_id = ANY(${ids})`;
      await sql`DELETE FROM citations WHERE audit_id = ANY(${ids})`;
    }
    await sql`DELETE FROM audits WHERE brand_id = ${brandId}`;
    await sql`DELETE FROM brands WHERE id = ${brandId}`;
    await sql`DELETE FROM subscriptions WHERE organization_id = ${orgId}`;
    await sql`DELETE FROM audit_trail WHERE organization_id = ${orgId}`;
    await sql`DELETE FROM organizations WHERE id = ${orgId}`;
  };

  return {
    spec,
    orgId,
    brandId,
    domain,
    audits: auditIds,
    basisAuditId,
    hiddenActionTitle,
    cleanup,
  };
}

/** generate-recommendations' steps for one audit, in order, with Wikipedia's answer recorded ("no article"). */
async function buildActionItems(input: {
  orgId: string;
  brandId: string;
  auditId: string;
  spec: SeedSpec;
}): Promise<void> {
  const { serviceDb } = await import("@/db/client");
  const { buildRecommendations } = await import("@/lib/recommendations");
  const { gatherRecommendationEvidence, productionCheckers } = await import(
    "@/lib/recommendations/gather-evidence"
  );
  const { persistRecommendations } = await import("@/lib/recommendations/persist");
  const { findingRecommendations } = await import("@/lib/reports/finding-recommendations");
  const { resolveOrganicDimensions } = await import("@/lib/scoring/resolve-audit-dimensions");
  const evidence = await gatherRecommendationEvidence(
    {
      brandId: input.brandId,
      brandName: input.spec.brandName,
      auditId: input.auditId,
      region: "au",
      categories: input.spec.categories,
    },
    {
      ...productionCheckers(serviceDb),
      checkWikipediaAuStatus: async (name: string) => ({
        status: "not_found" as const,
        query: `${name} Australia`,
      }),
    },
  );
  const counts = (await resolveOrganicDimensions(serviceDb, [input.auditId])).get(input.auditId);
  const fromFindings = await findingRecommendations(serviceDb, {
    organizationId: input.orgId,
    brandId: input.brandId,
    auditId: input.auditId,
  });
  const fromRules = await buildRecommendations(
    {
      scoreFrequency: input.spec.scoreFrequency ?? null,
      scoreSentimentNumeric: null,
      scoreContextNumeric: null,
      scoreComposite: null,
      confidenceIntervals: null,
      vertical: input.spec.vertical,
      categories: input.spec.categories,
      mentionDetail: counts
        ? {
            mentionedCount: counts.mentionedCount,
            rankedCount: counts.rankedCount,
            medianPosition: counts.medianPosition,
            sourcedCount: counts.sourcedCount,
          }
        : null,
    },
    serviceDb,
    evidence,
  );
  await persistRecommendations(serviceDb, {
    auditId: input.auditId,
    organizationId: input.orgId,
    brandId: input.brandId,
    recommendations: [...fromRules, ...fromFindings],
  });
}
