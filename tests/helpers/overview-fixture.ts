/**
 * Overview (7 Nov) -- a workspace for the Overview page's tests: brands with and without audits,
 * answers that do and don't count (unverified, branded), competitor names in the text, call costs, a
 * paid follow-up check, and an audit from the previous Sydney month.
 *
 * Seeds with a raw postgres client (the test DB only); `cleanup` removes every row it made.
 */
import { randomUUID } from "node:crypto";
import type postgres from "postgres";

export interface FixtureAnswer {
  /** The brand is named: "verified" counts, "unverified" never does. */
  brand?: "verified" | "unverified";
  /** Competitor names written in the answer. */
  names?: string[];
  /** A question that names the brand itself: never counted. */
  branded?: boolean;
  costUsd?: number;
}

export interface FixtureAudit {
  number: number;
  createdAt: Date;
  status?: "complete" | "failed";
  answers?: FixtureAnswer[];
  /** Failed calls, each with what it cost. */
  failureCostsUsd?: number[];
  /** Paid checks run after the audit, AUD cents, by source (e.g. "run-comparison-prompts"). */
  followUpCents?: Record<string, number>;
}

export interface FixtureBrand {
  name: string;
  competitors?: string[];
  audits?: FixtureAudit[];
}

export interface OverviewFixture {
  orgId: string;
  brandIds: Record<string, string>;
  auditIds: Record<string, string>;
  cleanup: () => Promise<void>;
}

const ENGINES = ["chatgpt", "perplexity"] as const;

function answerText(brandName: string, answer: FixtureAnswer): string {
  const names = [...(answer.brand ? [brandName] : []), ...(answer.names ?? [])];
  if (names.length === 0)
    return "Here are some well-reviewed local options:\n1. Northwest Property Care";
  return `Here are some well-reviewed local options:\n${names.map((n, i) => `${i + 1}. ${n} – local trades`).join("\n")}`;
}

export async function seedOverviewFixture(
  sql: postgres.Sql,
  options: { tier?: string; brands: FixtureBrand[] },
): Promise<OverviewFixture> {
  const orgId = randomUUID();
  const tag = orgId.slice(0, 8);
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug, metadata)
    VALUES (${orgId}, ${`overview-${tag}`}, ${`Overview workspace ${tag}`}, ${`overview-${tag}`},
            ${sql.json({ productTourComplete: true })})
  `;
  if (options.tier) {
    await sql`
      INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
      VALUES (${orgId}, ${`cus_${tag}`}, ${`sub_${tag}`}, 'price_test', ${options.tier}, 'monthly', 'active')
    `;
  }

  const brandIds: Record<string, string> = {};
  const auditIds: Record<string, string> = {};
  for (const brand of options.brands) {
    const brandId = randomUUID();
    brandIds[brand.name] = brandId;
    await sql`
      INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, suburb, state, categories, competitors)
      VALUES (${brandId}, ${orgId}, ${brand.name}, ${`${brandId.slice(0, 8)}.example.com.au`}, 'tradies', 'au',
              ARRAY['NSW:Castle Hill'], 'Castle Hill', 'NSW', ARRAY['trades_general'], ${brand.competitors ?? []})
    `;
    for (const audit of brand.audits ?? []) {
      const auditId = randomUUID();
      auditIds[`${brand.name} #${audit.number}`] = auditId;
      const status = audit.status ?? "complete";
      const answers = audit.answers ?? [];
      const completedAt =
        status === "complete" ? new Date(audit.createdAt.getTime() + 180_000) : null;
      await sql`
        INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count,
                            runs_per_prompt, metadata, started_at, completed_at, created_at,
                            prompt_pack_version, methodology_version)
        VALUES (${auditId}, ${brandId}, ${orgId}, ${audit.number}, ${status}, ${[...ENGINES]},
                ${Math.ceil(answers.length / ENGINES.length)}, 1, ${sql.json({})}, ${audit.createdAt},
                ${completedAt}, ${audit.createdAt}, 1, 3)
      `;
      const rows = answers.map((answer, i) => {
        const text = answerText(brand.name, answer);
        return {
          audit_id: auditId,
          engine: ENGINES[i % ENGINES.length],
          prompt: answer.branded ? `Is ${brand.name} any good? (${i})` : `Everyday question ${i}`,
          prompt_index: i,
          run_number: 1,
          brand_mentioned: answer.brand !== undefined,
          is_branded_prompt: answer.branded === true,
          mention_verification:
            answer.brand === "verified"
              ? "verified_domain"
              : answer.brand === "unverified"
                ? "unverified"
                : null,
          response_text: text,
          response_snippet: text.slice(0, 500),
          cited_sources: sql.json([]),
          llm_model: "gpt-4o-search-preview",
          llm_cost_usd: answer.costUsd ?? 0.01,
        };
      });
      if (rows.length > 0) await sql`INSERT INTO citations ${sql(rows)}`;
      const failures = (audit.failureCostsUsd ?? []).map((costUsd, i) => ({
        audit_id: auditId,
        organization_id: orgId,
        engine: "chatgpt",
        prompt: `Everyday question ${i}`,
        prompt_index: i,
        is_branded_prompt: false,
        error_class: "timeout",
        error_message: "Request timed out",
        attempts: 3,
        latency_ms: 60_000,
        cost_usd: costUsd,
      }));
      if (failures.length > 0) await sql`INSERT INTO engine_call_failures ${sql(failures)}`;
      for (const [source, cents] of Object.entries(audit.followUpCents ?? {})) {
        await sql`
          INSERT INTO audit_cost_snapshots (audit_id, organization_id, market_code, locale, actual_cost_cents, source)
          VALUES (${auditId}, ${orgId}, 'AU_EN', 'en-AU', ${cents}, ${source})
        `;
      }
    }
  }

  const cleanup = async () => {
    const ids = Object.values(auditIds);
    if (ids.length > 0) {
      await sql`DELETE FROM audit_cost_snapshots WHERE audit_id = ANY(${ids})`;
      await sql`DELETE FROM engine_call_failures WHERE audit_id = ANY(${ids})`;
      await sql`DELETE FROM citations WHERE audit_id = ANY(${ids})`;
    }
    await sql`DELETE FROM audits WHERE organization_id = ${orgId}`;
    await sql`DELETE FROM brands WHERE organization_id = ${orgId}`;
    await sql`DELETE FROM subscriptions WHERE organization_id = ${orgId}`;
    await sql`DELETE FROM organizations WHERE id = ${orgId}`;
  };

  return { orgId, brandIds, auditIds, cleanup };
}

/** The first instant of this calendar month in Sydney, from the database's clock. */
export async function sydneyMonthStart(sql: postgres.Sql): Promise<Date> {
  const [row] = await sql<{ start: Date }[]>`
    SELECT (date_trunc('month', now() AT TIME ZONE 'Australia/Sydney') AT TIME ZONE 'Australia/Sydney') AS start
  `;
  return new Date(row.start);
}
