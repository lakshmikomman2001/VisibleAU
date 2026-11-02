// @vitest-environment jsdom
/**
 * A rate-limited engine says "rate limit", never "check billing" (2 Nov,
 * Sri's decision), where people read it: an audit shaped like a Gemini
 * per-minute rate limit -- all 13 calls stored as "HTTP 429
 * RESOURCE_EXHAUSTED: You exceeded your current quota, please check your
 * plan and billing details. ..." (error_class rate_limited, 3 attempts),
 * the other three engines answering -- on the finished audit's banner, in
 * the whole-engine-failure email (owner and operator copies) and on the
 * client portal. And diag-0108's message_category, run in PostgreSQL,
 * agrees with the TypeScript on every sample.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  FAILURE_PATTERN_SQL_CATEGORIES,
  type FailurePatternKey,
  failureMessageCategory,
} from "@/lib/llm/failure-patterns";
import {
  FAILURE_MESSAGE_SAMPLES,
  GEMINI_RATE_LIMIT_SENTENCE,
} from "@/tests/helpers/failure-message-samples";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ organizationId: ORG_ID }),
}));
const router = vi.hoisted(() => ({ refresh: () => {}, push: () => {}, back: () => {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

const BRAND_ID = randomUUID();
const AUDIT_ID = randomUUID();
const TOKEN = `portal-rl-${randomUUID()}`;
const ENGINES = ["chatgpt", "claude", "gemini", "perplexity"];
const STORED = `HTTP 429 RESOURCE_EXHAUSTED: ${GEMINI_RATE_LIMIT_SENTENCE}`;
const LABEL = "Provider rate limit (too many requests at once)";
const CHECK =
  "Usually temporary. If it keeps happening, lower audit concurrency or raise the provider's rate limit tier.";
const NONE = "Good local options: Alpha Plumbing and Beta Plumbing.";

let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`rl-${ORG_ID}`}, 'Rate Limit Label Agency', ${`rl-${ORG_ID}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Omega Services', 'omega-rl.example.com.au', 'tradies', 'au', ARRAY[]::text[])
  `;
  const completedAt = new Date(Date.now() - 3600000);
  const startedAt = new Date(completedAt.getTime() - 3 * 60000);
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, engines, engine_count, prompts_count, runs_per_prompt, total_calls, started_at, completed_at, created_at, metadata)
    VALUES (${AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 41, 'manual', 'complete', ${ENGINES}, 4, 13, 1, 52,
      ${startedAt}, ${completedAt}, ${startedAt}, ${client.json({ engineFailures: { gemini: 13 } })})
  `;
  const failures: Record<string, unknown>[] = [];
  const answers: Record<string, unknown>[] = [];
  for (const engine of ENGINES) {
    for (let i = 0; i < 13; i++) {
      if (engine === "gemini") {
        failures.push({
          audit_id: AUDIT_ID,
          organization_id: ORG_ID,
          engine,
          prompt: `q${i}`,
          prompt_index: i,
          is_branded_prompt: i >= 10,
          error_class: "rate_limited",
          error_message: STORED,
          attempts: 3,
          latency_ms: 2100,
          cost_usd: "0",
        });
        continue;
      }
      answers.push({
        audit_id: AUDIT_ID,
        engine,
        prompt: `q${i}`,
        prompt_index: i,
        run_number: 1,
        brand_mentioned: false,
        is_branded_prompt: i >= 10,
        sentiment_label: "neutral",
        context_label: "absent",
        response_text: NONE,
        response_snippet: NONE,
        cited_sources: client.json([]),
        llm_model: "test-model",
        llm_cost_usd: "0.010000",
      });
    }
  }
  await client`INSERT INTO engine_call_failures ${client(failures)}`;
  await client`INSERT INTO citations ${client(answers)}`;
  await client`
    INSERT INTO client_portal_invites (organization_id, brand_id, invite_token)
    VALUES (${ORG_ID}, ${BRAND_ID}, ${TOKEN})
  `;
}, 120000);

afterAll(async () => {
  await client`DELETE FROM client_portal_invites WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM action_items WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM engine_call_failures WHERE audit_id = ${AUDIT_ID}`;
  await client`DELETE FROM citations WHERE audit_id = ${AUDIT_ID}`;
  await client`DELETE FROM audits WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

describe("Gemini's 429 RESOURCE_EXHAUSTED ('check your plan and billing details') reads as a rate limit", () => {
  it("the finished audit's banner", async () => {
    const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
    const element = await AuditPage({
      params: Promise.resolve({ auditId: AUDIT_ID }),
      searchParams: Promise.resolve({}),
    });
    document.body.innerHTML = renderToStaticMarkup(element);
    const banner = document.body.querySelector("[data-engine-total-failure]") as HTMLElement;
    expect(banner.textContent).toContain(
      "Gemini returned an error for all 13 questions, so this audit's Visibility is based on 3 engines (30 answers).",
    );
    expect(banner.textContent).toContain(LABEL);
    expect(banner.textContent).toContain(CHECK);
    expect(banner.textContent).not.toContain("account/credit");
    expect(banner.textContent).not.toMatch(/billing/i);
  });

  it("the whole-engine-failure email, owner's and operator's copies", async () => {
    const { findEngineTotalFailures } = await import("@/lib/audit/engine-total-failure-alert");
    const { engineTotalFailureEmail } = await import(
      "@/lib/email/templates/alerts/engine-total-failure"
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const alert = await findEngineTotalFailures(AUDIT_ID);
    warn.mockRestore();
    expect(alert?.engines).toEqual([
      {
        engine: "gemini",
        reasonLabel: LABEL,
        reasonCheck: CHECK,
        errorClass: "rate_limited",
        statusCode: 429,
      },
    ]);
    if (!alert) return;
    const owner = engineTotalFailureEmail({
      ...alert,
      audience: "org",
      auditUrl: "https://example.test/audits/41",
    });
    const operator = engineTotalFailureEmail({
      ...alert,
      audience: "operator",
      auditUrl: "https://example.test/audits/41",
    });
    expect(owner.text).toContain(LABEL);
    expect(owner.text).toContain(CHECK);
    expect(operator.text).toContain(`${LABEL} (rate_limited, HTTP 429)`);
    for (const email of [owner, operator]) {
      expect(email.text).not.toContain("account/credit");
      expect(email.text).not.toContain("Check billing");
      expect(email.html).not.toContain("account/credit");
    }
  });

  it("the client portal", async () => {
    const Page = (await import("@/app/client-portal/[inviteToken]/page")).default;
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ inviteToken: TOKEN }) }),
    );
    expect(html).toContain(
      `Based on 3 of 4 engines. Gemini returned an error for every question: ${LABEL}.`,
    );
    expect(html).not.toContain("account/credit");
    expect(html).not.toContain("check your plan");
  });
});

describe("diag-0108's message_category, run in PostgreSQL, agrees with the TypeScript", () => {
  it("on every sample, the new 429 branches included", async () => {
    const diag = readFileSync(
      join(process.cwd(), "db/prod-fixes/diag-0108-audit37-engine-failures.sql"),
      "utf8",
    );
    const caseSql = diag.match(
      /CASE\s+WHEN f\.error_message[\s\S]*?END(?= AS message_category)/,
    )?.[0];
    if (!caseSql) throw new Error("no message_category CASE in diag-0108");
    const rows = await client.unsafe<{ i: number; category: string }[]>(
      `SELECT f.i::int AS i, ${caseSql} AS category
       FROM unnest($1::text[]) WITH ORDINALITY AS f(error_message, i)
       ORDER BY f.i`,
      [FAILURE_MESSAGE_SAMPLES.map((s) => s.message)],
    );
    const keyByLabel = new Map(
      Object.entries(FAILURE_PATTERN_SQL_CATEGORIES).map(([key, label]) => [
        label,
        key as FailurePatternKey,
      ]),
    );
    expect(rows).toHaveLength(FAILURE_MESSAGE_SAMPLES.length);
    for (const [index, s] of FAILURE_MESSAGE_SAMPLES.entries()) {
      const sqlKey = keyByLabel.get(rows[index].category) ?? null;
      expect(sqlKey, `${s.name}: SQL said '${rows[index].category}'`).toBe(
        failureMessageCategory(s.message ?? ""),
      );
      expect(sqlKey, s.name).toBe(s.category);
    }
  });
});
