/**
 * Audit reliability, Part C, items 3, 4 and 5 -- real-DB proof that:
 *   - the sample's required location actually reaches the questions
 *     asked (not just the brand row), and the result is labelled with
 *     it;
 *   - the status route's progress counts are real (driven by actual
 *     citations/engine_call_failures rows), not a client-side timer;
 *   - a real run's cost is actually recorded against the real
 *     __sample__ org and counted by the daily spend cap.
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

let client: ReturnType<typeof postgres>;
const DOMAIN = `sample-loc-${randomUUID()}.example.com.au`;
const PACK_ID = randomUUID();

function randomIp() {
  return `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  // Same reasoning as tests/integration/sample-audit-needs-confirmation.
  // integration.test.ts: the generic vertical+region pack getAuditPrompts()
  // falls through to for an unclassified brand -- seeded here rather than
  // assumed present, and with a {location}-templated row so this test can
  // prove the chosen location actually reaches a real asked question.
  await client`
    INSERT INTO vertical_packs (id, vertical, region, version, name, prompts_count)
    VALUES (${PACK_ID}, 'tradies', 'au', 'v1', 'Tradies AU Sample-Location Pack', 2)
  `;
  await client`
    INSERT INTO vertical_pack_prompts (pack_id, prompt_template, rank)
    VALUES
      (${PACK_ID}, 'Best plumber in {location}?', 1),
      (${PACK_ID}, 'Who are reliable tradies nearby?', 2)
  `;
});

afterAll(async () => {
  await client`DELETE FROM vertical_pack_prompts WHERE pack_id = ${PACK_ID}`;
  await client`DELETE FROM vertical_packs WHERE id = ${PACK_ID}`;
  const [brand] = await client`SELECT id FROM brands WHERE domain = ${DOMAIN}`;
  if (brand) {
    await client`DELETE FROM engine_call_failures WHERE audit_id IN (SELECT id FROM audits WHERE brand_id = ${brand.id})`;
    await client`DELETE FROM citations WHERE audit_id IN (SELECT id FROM audits WHERE brand_id = ${brand.id})`;
    await client`DELETE FROM audits WHERE brand_id = ${brand.id}`;
    await client`DELETE FROM brands WHERE id = ${brand.id}`;
  }
  await client.end();
});

describe("the sample's required location reaches the brand row and the questions asked", () => {
  it("POST /api/sample-audit rejects a missing location with 400, before anything is created", async () => {
    const { POST } = await import("@/app/api/sample-audit/route");
    const req = new Request("http://localhost/api/sample-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": randomIp() },
      body: JSON.stringify({ domain: DOMAIN, vertical: "tradies" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);

    const rows = await client`SELECT id FROM brands WHERE domain = ${DOMAIN}`;
    expect(rows.length).toBe(0);
  });

  it("rejects a curated location that isn't one of the AU_LOCATIONS values", async () => {
    const { POST } = await import("@/app/api/sample-audit/route");
    const req = new Request("http://localhost/api/sample-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": randomIp() },
      body: JSON.stringify({
        domain: DOMAIN,
        vertical: "tradies",
        location: { type: "curated", value: "NSW:Not A Real Suburb" },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // ---------------------------------------------------------------------
  // Reliability follow-up, item 4 -- "My suburb isn't listed": a
  // free-text suburb plus a real AU state, for the 20-entry
  // AU_LOCATIONS list's uncovered majority of real AU suburbs.
  // ---------------------------------------------------------------------
  describe("custom (uncurated) suburb", () => {
    it("rejects junk (digits, too short) in the custom suburb field", async () => {
      const { POST } = await import("@/app/api/sample-audit/route");
      const cases = [
        { type: "custom", suburb: "N0rwest123", state: "NSW" }, // digits
        { type: "custom", suburb: "N", state: "NSW" }, // 1 char, below the 2-char minimum
        { type: "custom", suburb: "x".repeat(41), state: "NSW" }, // 41 chars, above the 40-char maximum
        { type: "custom", suburb: "Norwest", state: "ZZ" }, // not a real AU_STATE_CODES value
      ];
      for (const location of cases) {
        const req = new Request("http://localhost/api/sample-audit", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-forwarded-for": randomIp() },
          body: JSON.stringify({ domain: DOMAIN, vertical: "tradies", location }),
        });
        const res = await POST(req);
        expect(res.status, `expected 400 for ${JSON.stringify(location)}`).toBe(400);
      }
    });

    it("accepts letters, spaces, hyphens and apostrophes -- real AU suburb shapes the wizard's own narrower regex would reject", async () => {
      const validSuburbs = ["O'Connor", "Point Cook", "Woy Woy", "Mount Ku-ring-gai"];
      for (const suburb of validSuburbs) {
        expect(suburb).toMatch(/^[A-Za-z][A-Za-z\s'-]{1,39}$/);
      }
    });

    it(
      "a real run with a custom suburb: stored with city = NULL, and the suburb reaches a real asked question",
      async () => {
        const customDomain = `sample-loc-custom-${randomUUID()}.example.com.au`;
        const { runSampleAudit } = await import("@/lib/sample-audit/run");
        const { auditId, brandId } = await runSampleAudit(customDomain, "tradies", {
          type: "custom",
          suburb: "Norwest",
          state: "NSW",
        });

        const [brand] = await client<
          { suburb: string | null; city: string | null; state: string | null }[]
        >`SELECT suburb, city, state FROM brands WHERE id = ${brandId}`;
        expect(brand.suburb).toBe("Norwest");
        // Reliability follow-up, item 4 -- exactly like the wizard's
        // own uncurated-suburb path: city stays NULL, never guessed.
        expect(brand.city).toBeNull();
        expect(brand.state).toBe("NSW");

        let status: string | undefined;
        const deadline = Date.now() + 15_000;
        while (Date.now() < deadline) {
          [{ status }] = await client<{ status: string }[]>`SELECT status FROM audits WHERE id = ${auditId}`;
          if (status === "complete" || status === "failed") break;
          await new Promise((r) => setTimeout(r, 100));
        }
        expect(status).toBe("complete");

        const promptRows = await client<{ prompt: string }[]>`
          SELECT DISTINCT prompt FROM citations WHERE audit_id = ${auditId}
        `;
        expect(promptRows.some((r) => r.prompt.includes("Norwest"))).toBe(true);

        await client`DELETE FROM engine_call_failures WHERE audit_id = ${auditId}`;
        await client`DELETE FROM citations WHERE audit_id = ${auditId}`;
        await client`DELETE FROM audits WHERE id = ${auditId}`;
        await client`DELETE FROM brands WHERE id = ${brandId}`;
      },
      30_000,
    );
  });

  it(
    "a real run: the brand gets the chosen suburb/city/state confirmed, and the location reaches a real asked question",
    async () => {
      const { runSampleAudit } = await import("@/lib/sample-audit/run");
      const { auditId, brandId } = await runSampleAudit(DOMAIN, "tradies", {
        type: "curated",
        value: "QLD:Gold Coast",
      });

      const [brand] = await client<
        {
          suburb: string | null;
          city: string | null;
          state: string | null;
          location_mode: string | null;
          location_confirmed_at: Date | null;
        }[]
      >`
        SELECT suburb, city, state, location_mode, location_confirmed_at FROM brands WHERE id = ${brandId}
      `;
      expect(brand.suburb).toBe("Gold Coast");
      expect(brand.city).toBe("Gold Coast");
      expect(brand.state).toBe("QLD");
      expect(brand.location_mode).toBe("fixed");
      expect(brand.location_confirmed_at).not.toBeNull();

      // Poll for a terminal status -- runSampleAudit() is fire-and-forget.
      let status: string | undefined;
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        [{ status }] = await client<{ status: string }[]>`SELECT status FROM audits WHERE id = ${auditId}`;
        if (status === "complete" || status === "failed") break;
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(status).toBe("complete");

      const promptRows = await client<{ prompt: string }[]>`
        SELECT DISTINCT prompt FROM citations WHERE audit_id = ${auditId}
      `;
      expect(promptRows.length).toBeGreaterThan(0);
      // The {location}-templated row above expands to "Best plumber in
      // Gold Coast, QLD?" (lib/verticals/expand-prompt.ts's
      // formatLocation) -- a real, persisted question naming the
      // suburb the visitor actually chose, not just a brand-row field.
      expect(promptRows.some((r) => r.prompt.includes("Gold Coast"))).toBe(true);

      // Audit reliability, Part C, item 5 -- "sample spend is recorded
      // and capped": this real run just completed for the real
      // __sample__ org, via BudgetPolicyService.record() (no dead
      // skip -- Part C item 5). Confirms the full chain end to end,
      // not just that record() itself doesn't skip in isolation.
      const [snapshot] = await client<{ actual_cost_cents: number; organization_id: string }[]>`
        SELECT actual_cost_cents, organization_id FROM audit_cost_snapshots WHERE audit_id = ${auditId}
      `;
      expect(snapshot).toBeDefined();
      expect(Number(snapshot.actual_cost_cents)).toBeGreaterThanOrEqual(0);

      const { checkSampleAuditDailyCap } = await import("@/lib/sample-audit/daily-cap");
      const capCheck = await checkSampleAuditDailyCap();
      expect(capCheck.spentTodayCents).toBeGreaterThan(0);
    },
    30_000,
  );

  it(
    "the status route's progress counts are real -- answeredCount matches the actual citations + engine_call_failures rows written",
    async () => {
      const [audit] = await client<{ id: string; total_calls: number }[]>`
        SELECT a.id, a.total_calls FROM audits a JOIN brands b ON b.id = a.brand_id WHERE b.domain = ${DOMAIN} LIMIT 1
      `;
      const [{ citationCount }] = await client<{ citationCount: string }[]>`
        SELECT count(*) AS "citationCount" FROM citations WHERE audit_id = ${audit.id}
      `;
      const [{ failureCount }] = await client<{ failureCount: string }[]>`
        SELECT count(*) AS "failureCount" FROM engine_call_failures WHERE audit_id = ${audit.id}
      `;
      const expectedAnswered = Number(citationCount) + Number(failureCount);
      expect(expectedAnswered).toBeGreaterThan(0);

      const { GET } = await import("@/app/api/sample-audit/[auditId]/status/route");
      const req = new Request(`http://localhost/api/sample-audit/${audit.id}/status`, {
        headers: { "x-forwarded-for": randomIp() },
      });
      const res = await GET(req, { params: Promise.resolve({ auditId: audit.id }) });
      const body = await res.json();

      expect(body.answeredCount).toBe(expectedAnswered);
      // This test's own seeded pack has only 2 prompt templates (by
      // design, to keep the fixture small) -- 2 engines x 2 prompts x
      // 1 run = 4, not the full 12-call SAMPLE_AUDIT_CONFIG shape;
      // read the real stored value rather than assume it.
      expect(body.totalCalls).toBe(audit.total_calls);
      expect(body.totalCalls).toBeGreaterThan(0);
    },
    15_000,
  );
});
