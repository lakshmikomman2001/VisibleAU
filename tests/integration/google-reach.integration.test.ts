/**
 * S04 part 5 (LLD 8.4.5; D-QI7): Google AI Overviews and AI Mode per reach, on the real queue and collector with a
 * fake provider (no network).
 * - A Local question is checked at the audit's own location (2153 NSW), as before; a State one at the state (DataForSEO's
 *   New South Wales, 20035, labelled "NSW"); a Country one at Australia (2036); a Worldwide one isn't checked.
 * - Each location's questions go in their own post, with that location; a Local-only audit posts exactly once per
 *   surface, at its location.
 * - The per-audit ceiling scales with the questions checked: the stored ceiling covers the Local questions, the others
 *   add their share; a Local-only audit keeps the stored ceiling (its last questions still skipped past it).
 * - S04 part 7: the summary the audit page shows says where a question beyond Local was checked ("Checked from NSW"),
 *   and "Worldwide questions are measured on the four AI engines only." when the audit asked Worldwide questions.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { GoogleSurfaceProvider, SurfaceTarget, TaskPoll } from "@/lib/serp/provider";
import { deleteOrgRows } from "@/tests/helpers/delete-org-rows";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG = randomUUID();
const LOCAL = { code: 9071744, label: "2153 NSW" };
let client: ReturnType<typeof postgres>;
let n = 0;

type Post = { surface: string; locationCode: number; indexes: number[] };
const posts: Post[] = [];

const done: TaskPoll = {
  state: "done",
  statusCode: 20000,
  answer: {
    shown: false,
    answerText: null,
    citedLinks: [],
    seDomain: "google.com.au",
    reportedLocationCode: null,
    fetchedAt: null,
  },
  costUsd: null,
  raw: {},
};

const provider: GoogleSurfaceProvider = {
  name: "dataforseo",
  postTasks: async (surface, items, target: SurfaceTarget) => {
    posts.push({
      surface,
      locationCode: target.locationCode,
      indexes: items.map((i) => i.promptIndex),
    });
    return items.map((i) => ({
      promptIndex: i.promptIndex,
      taskId: `task-${surface}-${target.locationCode}-${i.promptIndex}-${randomUUID().slice(0, 4)}`,
      statusCode: 20100,
      message: "Task Created.",
      costUsd: null,
    }));
  },
  getTask: async () => done,
  aiOverview: async () => ({ taskId: null, costUsd: null, poll: done }),
  aiMode: async () => ({ taskId: null, costUsd: null, poll: done }),
};

const step = {
  run: async <T>(_id: string, fn: () => Promise<T>) => fn(),
  sleep: async () => undefined,
  sendEvent: async () => ({ ids: [] }),
};

async function audit(maxCostUsdPerAudit: number) {
  const brandId = randomUUID();
  const auditId = randomUUID();
  n++;
  await client`INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, suburb, state)
    VALUES (${brandId}, ${ORG}, 'Wattlebird Plumbing', ${`${brandId.slice(0, 8)}.example.com.au`}, 'tradies', 'au',
            ARRAY['NSW:Norwest']::text[], 'Norwest', 'NSW')`;
  await client`INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status)
    VALUES (${auditId}, ${brandId}, ${ORG}, ${n}, 'manual', 'complete')`;
  await client`INSERT INTO audit_google_surfaces (audit_id, organization_id, surfaces, settings, location, status)
    VALUES (${auditId}, ${ORG}, ARRAY['google_ai_overviews', 'google_ai_mode']::text[],
      ${client.json({ aiOverviewsEnabled: true, aiModeEnabled: true, countInHeadline: false, queueMode: "standard", device: "desktop", maxCostUsdPerAudit, provider: "dataforseo", decisions: {} })},
      ${client.json({ ...LOCAL, kind: "postcode", precise: true, note: null })}, 'queued')`;
  return { brandId, auditId };
}

async function rows(auditId: string) {
  return client<
    {
      surface: string;
      prompt_index: number;
      location_code: number;
      location_label: string;
      outcome: string;
      outcome_reason: string | null;
    }[]
  >`SELECT surface, prompt_index, location_code, location_label, outcome, outcome_reason
    FROM google_surface_results WHERE audit_id = ${auditId} ORDER BY surface, prompt_index`;
}

async function run(a: { brandId: string; auditId: string }) {
  const { collectGoogleSurfaces } = await import("@/lib/audit/google-surfaces/collect");
  await collectGoogleSurfaces(
    step,
    { auditId: a.auditId, brandId: a.brandId, organizationId: ORG, sendAuditComplete: false },
    { provider },
  );
}

const PROMPTS = [
  { text: "Who is the best plumber in Norwest?", isBranded: false, reach: "local" as const },
  { text: "Is Wattlebird Plumbing any good?", isBranded: true, reach: "local" as const },
  { text: "Can you recommend a plumber in NSW?", isBranded: false, reach: "state" as const },
  {
    text: "Can you recommend a plumber in Australia?",
    isBranded: false,
    reach: "country" as const,
  },
  { text: "Can you recommend a plumber?", isBranded: false, reach: "global" as const },
];

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  vi.stubEnv("GOOGLE_AI_SURFACES_ENABLED", "true");
  vi.stubEnv("DATAFORSEO_LOGIN", "test-login");
  vi.stubEnv("DATAFORSEO_PASSWORD", "test-password");
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  await client`INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG}, ${`google-reach-${ORG}`}, 'Google Reach Org', ${`google-reach-${ORG}`})`;
});
beforeEach(() => {
  posts.length = 0;
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteOrgRows(client, ORG);
  await client.end();
});

describe("Google AI per reach", () => {
  it("each question at its reach's location; Worldwide not checked; one post per location", async () => {
    const a = await audit(1);
    const { queueGoogleQuestions } = await import("@/lib/audit/google-surfaces/dispatch");
    expect(await queueGoogleQuestions(a.auditId, PROMPTS)).toBe(true);
    const queued = await rows(a.auditId);
    expect(queued.filter((r) => r.surface === "google_ai_overviews")).toEqual([
      {
        surface: "google_ai_overviews",
        prompt_index: 0,
        location_code: 9071744,
        location_label: "2153 NSW",
        outcome: "pending",
        outcome_reason: null,
      },
      {
        surface: "google_ai_overviews",
        prompt_index: 1,
        location_code: 9071744,
        location_label: "2153 NSW",
        outcome: "pending",
        outcome_reason: null,
      },
      {
        surface: "google_ai_overviews",
        prompt_index: 2,
        location_code: 20035,
        location_label: "NSW",
        outcome: "pending",
        outcome_reason: null,
      },
      {
        surface: "google_ai_overviews",
        prompt_index: 3,
        location_code: 2036,
        location_label: "Australia",
        outcome: "pending",
        outcome_reason: null,
      },
    ]);
    expect(queued).toHaveLength(8);
    expect(queued.some((r) => r.prompt_index === 4)).toBe(false);

    await run(a);
    const byLocation = (code: number) =>
      posts.filter((p) => p.locationCode === code).map((p) => [p.surface, p.indexes]);
    expect(byLocation(9071744)).toEqual([
      ["google_ai_overviews", [0, 1]],
      ["google_ai_mode", [0, 1]],
    ]);
    expect(byLocation(20035)).toEqual([
      ["google_ai_overviews", [2]],
      ["google_ai_mode", [2]],
    ]);
    expect(byLocation(2036)).toEqual([
      ["google_ai_overviews", [3]],
      ["google_ai_mode", [3]],
    ]);
    expect((await rows(a.auditId)).every((r) => r.outcome === "not_shown")).toBe(true);
  });

  it("a Local-only audit posts once per surface at its location, as before", async () => {
    const a = await audit(1);
    const { queueGoogleQuestions } = await import("@/lib/audit/google-surfaces/dispatch");
    await queueGoogleQuestions(
      a.auditId,
      PROMPTS.slice(0, 2).map(({ reach: _r, ...p }) => p),
    );
    await run(a);
    expect(posts).toEqual([
      { surface: "google_ai_overviews", locationCode: 9071744, indexes: [0, 1] },
      { surface: "google_ai_mode", locationCode: 9071744, indexes: [0, 1] },
    ]);
  });

  it("the ceiling scales with the questions beyond Local; a Local-only audit keeps the stored one", async () => {
    const { queueGoogleQuestions } = await import("@/lib/audit/google-surfaces/dispatch");
    // The stored ceiling covers the 2 Local questions on both surfaces: 4 x US$0.0012.
    const scaled = await audit(0.0048);
    await queueGoogleQuestions(scaled.auditId, PROMPTS);
    await run(scaled);
    expect((await rows(scaled.auditId)).filter((r) => r.outcome === "skipped")).toEqual([]);
    expect(posts.flatMap((p) => p.indexes)).toHaveLength(8);

    // Local-only, the same stored ceiling, with 3 questions: the last one's two tasks are past it, as today.
    posts.length = 0;
    const localOnly = await audit(0.0048);
    await queueGoogleQuestions(localOnly.auditId, [
      ...PROMPTS.slice(0, 2),
      { text: "Who fixes leaking taps in Norwest?", isBranded: false, reach: "local" as const },
    ]);
    await run(localOnly);
    const skipped = (await rows(localOnly.auditId)).filter((r) => r.outcome === "skipped");
    expect(skipped.map((r) => r.prompt_index)).toEqual([2, 2]);
    expect(skipped[0].outcome_reason).toContain("0.0048");
  });

  // S04 part 7 (LLD 8.4.5, D-QI7): the audit page's Google section says where each question was checked.
  it("the summary: each question beyond Local says where it was checked; Worldwide's sentence; Local-only as before", async () => {
    const { loadGoogleSurfaceSummary } = await import("@/lib/audit/google-surfaces/summary");
    const { serviceDb } = await import("@/db/client");
    const a = await audit(1);
    const { queueGoogleQuestions } = await import("@/lib/audit/google-surfaces/dispatch");
    await queueGoogleQuestions(a.auditId, PROMPTS);
    await run(a);
    await client`INSERT INTO audit_reach_results (audit_id, organization_id, reach, everyday_answers, mentioned,
                                                  reach_hash)
      VALUES (${a.auditId}, ${ORG}, 'global', 4, 0, 'hash-global')`;
    const summary = await loadGoogleSurfaceSummary(serviceDb, a.auditId);
    expect(summary?.rows[0].results.map((r) => [r.promptIndex, r.checkedFrom])).toEqual([
      [0, undefined],
      [1, undefined],
      [2, "NSW"],
      [3, "Australia"],
    ]);
    expect(summary?.otherLocations).toEqual(["Checked from NSW", "Checked from Australia"]);
    expect(summary?.worldwideNote).toBe(
      "Worldwide questions are measured on the four AI engines only.",
    );

    const localOnly = await audit(1);
    await queueGoogleQuestions(
      localOnly.auditId,
      PROMPTS.slice(0, 2).map(({ reach: _r, ...p }) => p),
    );
    await run(localOnly);
    const plain = await loadGoogleSurfaceSummary(serviceDb, localOnly.auditId);
    expect(plain).not.toHaveProperty("otherLocations");
    expect(plain).not.toHaveProperty("worldwideNote");
    expect(plain?.rows[0].results.every((r) => !("checkedFrom" in r))).toBe(true);
  });
});
