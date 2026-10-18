/**
 * Vunnara Build 1, Part H -- real-DB proof for the Responses tab's
 * per-question overview: every question an audit asked, grouped by
 * whether it counts toward the Visibility Score (organic -- never
 * names the brand) or only asks about the brand directly (branded --
 * a mention there is expected, so it's never counted), with each
 * engine's Yes/No for that question linking down into the matching
 * evidence card below (run_number = 1 only, the one real result).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const AUDIT_ID = randomUUID();
const ENGINES = ["chatgpt", "claude"];

const ORGANIC_PROMPT_MENTIONED = "Best plumber in Bondi?";
const ORGANIC_PROMPT_NOT_MENTIONED = "Who offers emergency plumbing in Sydney?";
const BRANDED_PROMPT = "Is Bondi Plumbing any good?";

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ organizationId: ORG_ID }),
}));

let client: ReturnType<typeof postgres>;
let mentionedCitationId: string;
let notMentionedCitationId: string;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`qgroup-${ORG_ID}`}, 'Question Grouping Test Org', ${`qgroup-org-${ORG_ID}`})
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Bondi Plumbing', 'bondiplumbing.example.com.au', 'tradies', 'au', ARRAY['NSW:Sydney'])
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at)
    VALUES (${AUDIT_ID}, ${BRAND_ID}, ${ORG_ID}, 1, 'complete', ${ENGINES}, 3, 1, now())
  `;

  // Organic question, mentioned by chatgpt, not by claude.
  const [mentionedRow] = await client<{ id: string }[]>`
    INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources, response_snippet)
    VALUES (${AUDIT_ID}, 'chatgpt', ${ORGANIC_PROMPT_MENTIONED}, 1, true, false, ${client.json([])}, 'Bondi Plumbing is great.')
    RETURNING id
  `;
  mentionedCitationId = mentionedRow.id;
  await client`
    INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources, response_snippet)
    VALUES (${AUDIT_ID}, 'claude', ${ORGANIC_PROMPT_MENTIONED}, 1, false, false, ${client.json([])}, 'Try a few local plumbers.')
  `;

  // Organic question, not mentioned by either engine.
  const [notMentionedRow] = await client<{ id: string }[]>`
    INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources, response_snippet)
    VALUES (${AUDIT_ID}, 'chatgpt', ${ORGANIC_PROMPT_NOT_MENTIONED}, 1, false, false, ${client.json([])}, 'There are several options.')
    RETURNING id
  `;
  notMentionedCitationId = notMentionedRow.id;
  await client`
    INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources, response_snippet)
    VALUES (${AUDIT_ID}, 'claude', ${ORGANIC_PROMPT_NOT_MENTIONED}, 1, false, false, ${client.json([])}, 'Several options exist.')
  `;

  // Branded question (names the brand directly) -- mentioned by both,
  // as expected, but must never be grouped with the organic ones.
  await client`
    INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources, response_snippet)
    VALUES (${AUDIT_ID}, 'chatgpt', ${BRANDED_PROMPT}, 1, true, true, ${client.json([])}, 'Yes, well regarded.')
  `;
  await client`
    INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, cited_sources, response_snippet)
    VALUES (${AUDIT_ID}, 'claude', ${BRANDED_PROMPT}, 1, true, true, ${client.json([])}, 'Yes, good reputation.')
  `;
});

afterAll(async () => {
  await client`DELETE FROM citations WHERE audit_id = ${AUDIT_ID}`;
  await client`DELETE FROM audits WHERE id = ${AUDIT_ID}`;
  await client`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

async function renderResponsesTab(): Promise<string> {
  const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
  const element = await AuditPage({
    params: Promise.resolve({ auditId: AUDIT_ID }),
    searchParams: Promise.resolve({ tab: "responses" }),
  });
  return renderToStaticMarkup(element);
}

describe("Responses tab — question overview grouped by organic vs branded (Part H)", () => {
  it('shows "Counted in your score" for organic questions and "Mentions your name, not counted" for branded ones', async () => {
    const html = await renderResponsesTab();
    expect(html).toContain("Counted in your score");
    expect(html).toContain("Mentions your name, not counted");
  });

  it("lists the organic questions' text under the organic group", async () => {
    const html = await renderResponsesTab();
    expect(html).toContain(ORGANIC_PROMPT_MENTIONED);
    expect(html).toContain(ORGANIC_PROMPT_NOT_MENTIONED);
  });

  it("lists the branded question's text under the branded group, never implying it's scored", async () => {
    const html = await renderResponsesTab();
    expect(html).toContain(BRANDED_PROMPT);
  });

  it("shows a Yes/No per engine for a given question, matching what was actually stored", async () => {
    const html = await renderResponsesTab();
    expect(html).toContain("ChatGPT: Yes");
    expect(html).toContain("Claude: No");
  });

  it("links each engine's Yes/No down into the matching filtered evidence card (engine + status + row anchor)", async () => {
    const html = await renderResponsesTab();
    expect(html).toContain(
      `tab=responses&amp;engine=chatgpt&amp;status=mentioned#r-${mentionedCitationId}`,
    );
    expect(html).toContain(
      `tab=responses&amp;engine=chatgpt&amp;status=not_mentioned#r-${notMentionedCitationId}`,
    );
  });

  it("every evidence card below also states plainly whether it counts toward the score", async () => {
    const html = await renderResponsesTab();
    expect(html).toContain("Counted in score");
    expect(html).toContain("Mentions your name · not counted");
  });
});
