/**
 * S04B part 4 (LLD amendment 102; contract P07.reachFilter, P07.responses), the audit page rendered through its real
 * loader on a seeded, invented business (Ironstone) whose set is moved to three reaches: 4 Local, 3 NSW, 3 Australia.
 * - The reach filter "All areas · Local · NSW · Australia" sits above the per-engine table; "All areas" (and no ?area)
 *   is the page as it was.
 * - ?area=state shows each engine's NSW answers only; every engine's reaches add up to its All areas figure.
 * - The Responses tab has one section per reach in reach order, with its count; the names-your-business questions last.
 * - visibility_reach off: neither the filter nor the sections (the page as before).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { IRONSTONE, type SeededReportBrand, seedReportBrand } from "@/tests/helpers/report-seeds";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { session } = vi.hoisted(() => ({ session: { organizationId: "" } }));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({ organizationId: session.organizationId })),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/audits/x",
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

let sql: ReturnType<typeof postgres>;
let seed: SeededReportBrand;
let everydayCount = 0;

const clean = (html: string) => html.replace(/<!-- -->/g, "").replace(/&#x27;/g, "'");

async function auditPage(searchParams: Record<string, string> = {}): Promise<string> {
  session.organizationId = seed.orgId;
  const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
  return clean(
    renderToStaticMarkup(
      await AuditPage({
        params: Promise.resolve({ auditId: seed.basisAuditId }),
        searchParams: Promise.resolve(searchParams),
      }),
    ),
  );
}

async function flag(on: boolean) {
  await sql`DELETE FROM org_feature_flags WHERE organization_id = ${seed.orgId} AND flag_key = 'visibility_reach'`;
  if (on)
    await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled)
      VALUES (${seed.orgId}, 'visibility_reach', true)`;
}

/** Each engine row's "k of n" (or its no-answer words), from the per-engine table. */
function engineLines(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/id="engine-([a-z]+)-counts"[^>]*>([^<]*)</g)) out[m[1]] = m[2];
  return out;
}

const kn = (line: string) => {
  const m = line.match(/(\d+) of (\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
};

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  seed = await seedReportBrand(sql, IRONSTONE);
  // The seed has no question set: give the basis audit one, its own questions in order -- the first 4 everyday ones
  // Local, the next 3 NSW, the rest Australia, then those naming the business.
  const asked = await sql<{ prompt: string; branded: boolean }[]>`
    SELECT prompt, bool_or(branded) AS branded FROM (
      SELECT prompt, coalesce(is_branded_prompt, false) AS branded FROM citations WHERE audit_id = ${seed.basisAuditId}
      UNION ALL
      SELECT prompt, is_branded_prompt FROM engine_call_failures WHERE audit_id = ${seed.basisAuditId}
    ) p GROUP BY prompt ORDER BY bool_or(branded), prompt`;
  const [set] = await sql<{ id: string }[]>`
    INSERT INTO brand_question_sets (organization_id, brand_id, version, is_current, comparison_hash)
    VALUES (${seed.orgId}, ${seed.brandId}, 1, true, 'reach-views') RETURNING id`;
  let everyday = 0;
  for (const [position, a] of asked.entries()) {
    const reach = a.branded ? "local" : everyday < 4 ? "local" : everyday < 7 ? "state" : "country";
    if (!a.branded) everyday++;
    const kind = a.branded ? "branded" : "everyday";
    const [q] = await sql<{ id: string }[]>`
      INSERT INTO brand_questions (organization_id, brand_id, text, text_key, kind, source, reach)
      VALUES (${seed.orgId}, ${seed.brandId}, ${a.prompt}, question_text_key(${a.prompt}), ${kind}, 'original', ${reach})
      RETURNING id`;
    await sql`INSERT INTO brand_question_set_items (set_id, organization_id, question_id, position, kind, reach, source)
      VALUES (${set.id}, ${seed.orgId}, ${q.id}, ${position}, ${kind}, ${reach}, 'original')`;
  }
  everydayCount = everyday;
  await sql`UPDATE audits SET question_set_id = ${set.id} WHERE id = ${seed.basisAuditId}`;
  const { writeAuditReachResults } = await import("@/lib/reach/results");
  const { serviceDb } = await import("@/db/client");
  await writeAuditReachResults(serviceDb, {
    auditId: seed.basisAuditId,
    organizationId: seed.orgId,
  });
}, 300_000);

afterAll(async () => {
  if (seed) {
    await sql`UPDATE audits SET question_set_id = NULL WHERE organization_id = ${seed.orgId}`;
    await sql`DELETE FROM brand_question_set_items WHERE organization_id = ${seed.orgId}`;
    await sql`DELETE FROM brand_question_sets WHERE organization_id = ${seed.orgId}`;
    await sql`DELETE FROM brand_questions WHERE organization_id = ${seed.orgId}`;
    await sql`DELETE FROM audit_reach_results WHERE organization_id = ${seed.orgId}`;
    await sql`DELETE FROM org_feature_flags WHERE organization_id = ${seed.orgId} AND flag_key = 'visibility_reach'`;
    await seed.cleanup();
  }
  await sql.end();
});

describe("the audit page by reach (P07)", () => {
  it("the stored reaches are Local, NSW and Australia", async () => {
    const rows = await sql<{ reach: string }[]>`
      SELECT reach FROM audit_reach_results WHERE audit_id = ${seed.basisAuditId}
      ORDER BY array_position(ARRAY['local','state','country','global'], reach)`;
    expect(rows.map((r) => r.reach)).toEqual(["local", "state", "country"]);
  });

  it("the filter sits above the per-engine table; All areas and no ?area are the page as it was", async () => {
    await flag(true);
    const page = await auditPage();
    expect(page).toContain('data-testid="p07-reach-filter"');
    const labels = [
      ...page.matchAll(/data-testid="p07-reach-filter-option"[^>]*>(?:<input[^>]*>)?([^<]*)</g),
    ].map((m) => m[1]);
    expect(labels).toEqual(["All areas", expect.stringMatching(/^Local · /), "NSW", "Australia"]);
    expect(page.indexOf('data-testid="p07-reach-filter"')).toBeLessThan(
      page.indexOf("Per-engine performance"),
    );
    expect(await auditPage({ area: "all" })).toBe(page);
    expect(await auditPage({ area: "nowhere" })).toBe(page);
  });

  it("a reach chosen: each engine's answers there only, and the reaches add up to All areas", async () => {
    await flag(true);
    const all = engineLines(await auditPage());
    const byReach = await Promise.all(
      ["local", "state", "country"].map(async (area) => engineLines(await auditPage({ area }))),
    );
    expect(Object.keys(all).length).toBeGreaterThan(0);
    for (const engine of Object.keys(all)) {
      const [k, n] = kn(all[engine]);
      const sums = byReach
        .map((lines) => kn(lines[engine] ?? ""))
        .reduce(([a, b], [c, d]) => [a + c, b + d], [0, 0]);
      expect([engine, ...sums]).toEqual([engine, k, n]);
    }
    // NSW's answers are its 3 questions' per engine that answered (the seed's failed engine answers none).
    const [{ answers }] = await sql<{ answers: number }[]>`
      SELECT count(*)::int AS answers FROM citations
      WHERE audit_id = ${seed.basisAuditId} AND run_number = 1 AND is_branded_prompt IS NOT TRUE
        AND question_text_key(prompt) IN (
          SELECT question_text_key(q.text) FROM brand_question_set_items i
          JOIN brand_questions q ON q.id = i.question_id
          JOIN audits a ON a.question_set_id = i.set_id
          WHERE a.id = ${seed.basisAuditId} AND i.reach = 'state')`;
    const nsw = Object.values(byReach[1]).reduce((sum, line) => sum + kn(line)[1], 0);
    expect(nsw).toBe(answers);
  });

  it("the Responses tab: one section per reach in reach order, with its count; the branded questions last", async () => {
    await flag(true);
    const page = await auditPage({ tab: "responses" });
    const sections = [
      ...page.matchAll(
        /data-testid="p07-responses" data-reach="([a-z]+)"[^>]*>([^<]*)<span[^>]*>([^<]*)</g,
      ),
    ];
    expect(sections.map((m) => [m[1], m[3]])).toEqual([
      ["local", "4 questions"],
      ["state", "3 questions"],
      ["country", `${everydayCount - 7} questions`],
    ]);
    expect(sections[1][2]).toBe("NSW");
    expect(page.indexOf('data-reach="country"')).toBeLessThan(
      page.indexOf("Mentions your name, not counted"),
    );
  });

  it("visibility_reach off: no filter and no sections, the page as before", async () => {
    await flag(false);
    expect(await auditPage()).not.toContain("p07-reach-filter");
    expect(await auditPage({ tab: "responses" })).not.toContain("p07-responses");
  });
});
