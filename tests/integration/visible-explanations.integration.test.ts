// @vitest-environment jsdom
/**
 * Price corrections (25 Oct), item 4 -- every "why" on the audit page,
 * client portal and sample audit is visible text, in the element's
 * accessible name or description (aria-describedby), never only in a
 * hover `title` -- phones, keyboards and screen readers never see one.
 *
 * Renders the real pages from a real (test) database, puts the HTML into
 * this file's jsdom document, and queries it the way assistive technology does (Testing
 * Library's getByRole with `description`).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import { within } from "@testing-library/react";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const RANKED_AUDIT = randomUUID();
const UNRANKED_AUDIT = randomUUID();
const INVITE_TOKEN = `visible-explanations-${randomUUID()}`;

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ organizationId: ORG_ID }),
}));

const ENGINES = ["chatgpt", "claude", "gemini", "perplexity"];
const RANKED =
  "Good local options:\n1. Alpha Plumbing\n2. Beta Plumbing\n3. Gamma Plumbing\n4. Explain Co, fast call-outs.";
const PROSE = "Explain Co is a plumber some people in Bondi recommend.";
const NONE = "Good local options: Alpha Plumbing and Beta Plumbing.";

/** The explanations that used to be hover-only. */
const EXPLANATIONS = [
  "No tone classifier yet",
  "No classifier for recommended vs listed yet",
  "Never inside a numbered or bulleted list",
  "not confirmed as your business",
  "1 error",
];

let client: ReturnType<typeof postgres>;

async function seed(auditId: string, auditNumber: number, mentionText: string) {
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, engines, engine_count, prompts_count, runs_per_prompt, total_calls, started_at, completed_at)
    VALUES (${auditId}, ${BRAND_ID}, ${ORG_ID}, ${auditNumber}, 'manual', 'complete', ${ENGINES}, 4, 10, 1, 40, now() - interval '5 minutes', now())
  `;
  for (const engine of ENGINES) {
    for (let i = 0; i < 10; i++) {
      if (engine === "claude" && i === 9) {
        await client`
          INSERT INTO engine_call_failures (audit_id, organization_id, engine, prompt, prompt_index, is_branded_prompt, error_class, error_message, attempts, latency_ms, cost_usd)
          VALUES (${auditId}, ${ORG_ID}, ${engine}, ${`q${i}`}, ${i}, false, 'other', 'Bad request', 1, 900, '0')
        `;
        continue;
      }
      const mentioned = i === 0 && engine !== "claude";
      // One unverified name match, for the Responses tab's "Maybe" chip.
      const unverified = i === 1 && engine === "chatgpt";
      const text = mentioned ? mentionText : unverified ? PROSE : NONE;
      await client`
        INSERT INTO citations (audit_id, engine, prompt, prompt_index, run_number, brand_mentioned, is_branded_prompt, mention_verification, sentiment_label, context_label, response_text, response_snippet, cited_sources, llm_model, llm_cost_usd)
        VALUES (${auditId}, ${engine}, ${`q${i}`}, ${i}, 1, ${mentioned || unverified}, false,
          ${mentioned ? "verified_location" : unverified ? "unverified" : null}, 'neutral', 'absent', ${text}, ${text},
          ${client.json([])}, 'test-model', '0.010000')
      `;
    }
  }
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`visible-${ORG_ID}`}, 'Visible Explanations Org', ${`visible-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, prompt_pack, prompt_pack_generator_version, classification_status, classification, category_confirmed_at, location_mode)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Explain Co', 'explainco.example.com.au', 'tradies', 'au',
      ARRAY[]::text[], ${client.json(["q"])}, ${PROMPT_GENERATOR_VERSION}, 'complete',
      ${client.json({ category: "trades_plumbing", buyerType: "smb", confidence: 0.95, intentSignals: [], competitors: [], auRelevance: "au_present" })},
      now(), 'fixed')
  `;
  await seed(UNRANKED_AUDIT, 1, PROSE); // older: mentioned in prose, never ranked
  await seed(RANKED_AUDIT, 2, RANKED); // latest: the client portal shows this one
  await client`
    INSERT INTO client_portal_invites (id, organization_id, brand_id, invite_token)
    VALUES (${randomUUID()}, ${ORG_ID}, ${BRAND_ID}, ${INVITE_TOKEN})
  `;
}, 60000);

afterAll(async () => {
  await client`DELETE FROM client_portal_invites WHERE invite_token = ${INVITE_TOKEN}`;
  await client`DELETE FROM engine_call_failures WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM citations WHERE audit_id IN (${RANKED_AUDIT}, ${UNRANKED_AUDIT})`;
  await client`DELETE FROM action_items WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM audits WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM brands WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

function dom(html: string) {
  document.body.innerHTML = html;
  return { body: within(document.body), document };
}

async function auditPage(auditId: string, tab?: "responses") {
  const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
  const element = await AuditPage({
    params: Promise.resolve({ auditId }),
    searchParams: Promise.resolve(tab ? { tab } : {}),
  });
  return dom(renderToStaticMarkup(element));
}

/** No explanation may live only in a title attribute. */
function expectNoExplanationInTitles(document: Document) {
  const titles = [...document.querySelectorAll("[title]")].map(
    (el) => el.getAttribute("title") ?? "",
  );
  for (const text of EXPLANATIONS) {
    expect(
      titles.filter((t) => t.includes(text)),
      text,
    ).toEqual([]);
  }
}

describe("audit page: every explanation is visible and in the accessible description", () => {
  it("Sentiment and Context say why they aren't measured", async () => {
    const { body, document } = await auditPage(RANKED_AUDIT);
    expect(
      body.getByRole("figure", {
        name: "Sentiment",
        description: "Not yet measured No tone classifier yet",
      }),
    ).toBeTruthy();
    expect(
      body.getByRole("figure", {
        name: "Context",
        description: "Not yet measured No classifier for recommended vs listed yet",
      }),
    ).toBeTruthy();
    expectNoExplanationInTitles(document);
  });

  it("Position and Source citation carry their detail and the small-sample note", async () => {
    const { body } = await auditPage(RANKED_AUDIT);
    expect(
      body.getByRole("figure", {
        name: "Position",
        description: "3 of 3 mentions were in a ranked list Based on 3 mentions — small sample",
      }),
    ).toBeTruthy();
    expect(
      body.getByRole("figure", {
        name: "Source citation",
        description: "mentions linked a source Based on 3 mentions — small sample",
      }),
    ).toBeTruthy();
  });

  it("a never-ranked Position says why", async () => {
    const { body } = await auditPage(UNRANKED_AUDIT);
    expect(
      body.getByRole("figure", {
        name: "Position",
        description: "Mentioned but not ranked Never inside a numbered or bulleted list",
      }),
    ).toBeTruthy();
  });

  it("a per-engine failure gives its reason in text, not a hover", async () => {
    const { body } = await auditPage(RANKED_AUDIT);
    expect(
      body.getByRole("figure", {
        name: "Claude",
        description: "0 of 9 · 0% 1 failed — not counted (1 error)",
      }),
    ).toBeTruthy();
    expect(
      body.getByRole("figure", { name: "ChatGPT", description: "1 of 10 · 10%" }),
    ).toBeTruthy();
  });

  it("Responses tab: Yes / No / Maybe chips are described by a visible legend", async () => {
    const { body, document } = await auditPage(RANKED_AUDIT, "responses");
    expect(
      body.getAllByRole("link", {
        name: "ChatGPT: Maybe",
        description: "Maybe: a possible mention, not confirmed as your business",
      }).length,
    ).toBeGreaterThan(0);
    expect(
      body.getAllByRole("link", { name: "Gemini: No", description: "No: not mentioned" }).length,
    ).toBeGreaterThan(0);
    expectNoExplanationInTitles(document);
  });
});

describe("client portal and sample audit: the same, visible", () => {
  it("client portal tiles", async () => {
    const ClientPortalViewPage = (await import("@/app/client-portal/[inviteToken]/page")).default;
    const element = await ClientPortalViewPage({
      params: Promise.resolve({ inviteToken: INVITE_TOKEN }),
    });
    const { body, document } = dom(renderToStaticMarkup(element));
    expect(
      body.getByRole("figure", {
        name: "Sentiment",
        description: "Not yet measured No tone classifier yet",
      }),
    ).toBeTruthy();
    expect(
      body.getByRole("figure", {
        name: "Position",
        description: "#4 3 of 3 mentions were in a ranked list Based on 3 mentions — small sample",
      }),
    ).toBeTruthy();
    expectNoExplanationInTitles(document);
  });

  it("sample audit cards", async () => {
    const SampleResultView = (
      await import("@/app/(marketing)/sample-audit/result/[id]/sample-result-view")
    ).default;
    const html = renderToStaticMarkup(
      SampleResultView({
        audit: {
          id: "x",
          status: "complete",
          headlineValue: 8,
          frequencyValue: 8,
          position: { kind: "not_ranked", line: "Mentioned but not ranked" },
          sourceCitation: {
            kind: "measured",
            value: "1 of 2",
            detail: "mentions linked a source",
            line: "1 of 2 mentions linked a source",
            smallSampleNote: "Based on 2 mentions — small sample",
          },
          brandName: "Explain Co",
          brandDomain: "explainco.example.com.au",
          place: "Bondi",
          insufficientData: false,
          noAnswers: false,
          sampleSize: 12,
          mentionedCount: 2,
        },
      }),
    );
    const { body, document } = dom(html);
    expect(
      body.getByRole("figure", {
        name: "Context",
        description: "Not yet measured No classifier for recommended vs listed yet",
      }),
    ).toBeTruthy();
    expect(
      body.getByRole("figure", {
        name: "Position",
        description: "Not ranked Never inside a numbered or bulleted list",
      }),
    ).toBeTruthy();
    expect(
      body.getByRole("figure", {
        name: "Source citation",
        description: "1 of 2 mentions linked a source Based on 2 mentions — small sample",
      }),
    ).toBeTruthy();
    expectNoExplanationInTitles(document);
  });
});
