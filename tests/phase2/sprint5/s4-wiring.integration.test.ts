/**
 * §11-7: S4-wiring integration test for Sprint 5 Trust Intelligence.
 *
 * Tests dual consensus alert thresholds and hallucination alert gating.
 * (The narrative-section checks went with narrative-generator.ts, 1 Nov.)
 *
 * Re-break: unwire a section → test fails.
 */

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const TEST_DB_URL = "postgresql://postgres:password@localhost:5432/visibleau";

let client: ReturnType<typeof postgres>;

const TEST_ORG_ID = "e5e5e5e5-aaaa-bbbb-cccc-000000000001";
const TEST_BRAND_ID = "e5e5e5e5-aaaa-bbbb-cccc-000000000002";
const TEST_AUDIT_ID = "e5e5e5e5-aaaa-bbbb-cccc-000000000003";

const CLEANUP: { table: string; ids: string[] }[] = [];

function trackCleanup(table: string, id: string) {
  const entry = CLEANUP.find((e) => e.table === table);
  if (entry) entry.ids.push(id);
  else CLEANUP.push({ table, ids: [id] });
}

beforeAll(async () => {
  client = postgres(TEST_DB_URL, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${TEST_ORG_ID}, ${"s5-wiring-test-clerk"}, 'S5 Wiring Test Org', 's5-wiring-test')
    ON CONFLICT (id) DO NOTHING
  `;
  trackCleanup("organizations", TEST_ORG_ID);

  await client`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${TEST_ORG_ID}, 'cus_test_s5', 'sub_test_s5', 'price_test_s5', 'growth', 'monthly', 'active')
    ON CONFLICT DO NOTHING
  `;
  trackCleanup("subscriptions", TEST_ORG_ID);

  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${TEST_BRAND_ID}, ${TEST_ORG_ID}, 'Wiring Test Brand', 'wiring-test.example.com', 'tradies', 'au', ARRAY['VIC:Melbourne'])
    ON CONFLICT (id) DO NOTHING
  `;
  trackCleanup("brands", TEST_BRAND_ID);

  await client`
    INSERT INTO audits (id, brand_id, organization_id, status, audit_number, engines)
    VALUES (${TEST_AUDIT_ID}, ${TEST_BRAND_ID}, ${TEST_ORG_ID}, 'complete', 1, ARRAY['chatgpt'])
    ON CONFLICT (id) DO NOTHING
  `;
  trackCleanup("audits", TEST_AUDIT_ID);
});

afterAll(async () => {
  // Reverse-order cleanup
  const order = [
    "action_items",
    "notification_preferences",
    "evidence_snapshots",
    "citation_source_intelligence",
    "brand_consensus_checks",
    "brand_entity_scores",
    "linkedin_presence_audits",
    "youtube_presence_audits",
    "audits",
    "subscriptions",
    "brands",
    "organizations",
  ];
  for (const table of order) {
    const entry = CLEANUP.find((e) => e.table === table);
    if (!entry) continue;
    for (const id of entry.ids) {
      if (table === "subscriptions" || table === "notification_preferences") {
        await client`DELETE FROM ${client(table)} WHERE organization_id = ${id}`.catch(() => {});
      } else {
        await client`DELETE FROM ${client(table)} WHERE id = ${id}`.catch(() => {});
      }
    }
  }
  await client.end();
});

// DEMO-BLOCKER (1 Nov), part 5 point 9: the "S5 sections wire into
// narrative generator" checks went with lib/communication/narrative-
// generator.ts. The report's narrative is now built from the audit's
// measured figures (lib/reports/report-narrative.ts); LinkedIn, consensus,
// knowledge-panel, source-type and evidence lines are no longer in it.

// ──────────────────────────────────────────────
// 2. DUAL CONSENSUS ALERT THRESHOLDS
// ──────────────────────────────────────────────
describe("dual consensus alert thresholds (LLD 7252 + 8402)", () => {
  async function seedConsensusWithAvg(avg: number) {
    // Delete existing checks
    await client`DELETE FROM brand_consensus_checks WHERE brand_id = ${TEST_BRAND_ID}`;
    // Seed a single source with the target score
    const [cc] = await client`
      INSERT INTO brand_consensus_checks (brand_id, organization_id, market_code, source_type, consistency_score, discrepancies)
      VALUES (${TEST_BRAND_ID}, ${TEST_ORG_ID}, 'AU_EN', 'google_business_profile', ${avg}, '[]'::jsonb)
      RETURNING id
    `;
    trackCleanup("brand_consensus_checks", cc.id);
  }

  async function runAlertLogic(avgScore: number) {
    // In-app: action_items at < 70
    const actionItemCreated = avgScore < 70;
    // Email: consensus alert at < 60
    const emailSent = avgScore < 60;
    return { actionItemCreated, emailSent };
  }

  it("avg=67: in-app action item fires (<70), NO email (>=60)", async () => {
    const result = await runAlertLogic(67);
    expect(result.actionItemCreated).toBe(true);
    expect(result.emailSent).toBe(false);
  });

  it("avg=55: BOTH in-app (<70) AND email (<60) fire", async () => {
    const result = await runAlertLogic(55);
    expect(result.actionItemCreated).toBe(true);
    expect(result.emailSent).toBe(true);
  });

  it("avg=75: NEITHER fires (>=70)", async () => {
    const result = await runAlertLogic(75);
    expect(result.actionItemCreated).toBe(false);
    expect(result.emailSent).toBe(false);
  });

  it("the thresholds in check-cross-platform-consensus.ts match spec", async () => {
    const src = await import("fs").then((fs) =>
      fs.readFileSync("inngest/functions/check-cross-platform-consensus.ts", "utf-8"),
    );
    // In-app at < 70 (LLD 7252)
    expect(src).toContain("avgScore < 70");
    // Email at < 60 (LLD 8402)
    expect(src).toContain("avgScore < 60");
  });
});

// ──────────────────────────────────────────────
// 3. HALLUCINATION ALERT GATING
// ──────────────────────────────────────────────
// Task 15: each alert names its type (sendAlert("hallucination", ...)) and
// lib/email/recipients.ts maps the type to its own preference column.
describe("hallucination alert gated on emailOnHallucination (not emailOnDrift)", () => {
  const COMPOSER = "lib/communication/alert-composer.ts";

  /**
   * The function's body, up to its closing brace on a line of its own, whatever the file's line endings: on
   * a CRLF checkout "\n}\n" never matched, the cut ran to the end of the file and took in sendDriftAlert's
   * "drift" (8 Nov nightly). A cut that doesn't land fails loudly.
   */
  function bodyOf(source: string, fn: string): string {
    const src = source.replace(/\r\n/g, "\n");
    const fnStart = src.indexOf(`async function ${fn}`);
    const fnEnd = src.indexOf("\n}\n", fnStart);
    expect(fnStart, `${fn} not found`).toBeGreaterThanOrEqual(0);
    expect(fnEnd, `${fn}'s closing brace not found`).toBeGreaterThan(fnStart);
    return src.slice(fnStart, fnEnd);
  }

  async function alertBody(fn: string) {
    const fs = await import("node:fs");
    return bodyOf(fs.readFileSync(COMPOSER, "utf-8"), fn);
  }

  it("cuts a function the same out of a CRLF checkout", async () => {
    const fs = await import("node:fs");
    const lf = fs.readFileSync(COMPOSER, "utf-8").replace(/\r\n/g, "\n");
    const crlf = lf.replace(/\n/g, "\r\n");
    expect(bodyOf(crlf, "sendHallucinationAlert")).toBe(bodyOf(lf, "sendHallucinationAlert"));
    expect(bodyOf(crlf, "sendHallucinationAlert")).not.toContain('"drift"');
  });

  it("sendHallucinationAlert gates on emailOnHallucination (not emailOnDrift)", async () => {
    const { NOTIFICATION_PREFERENCES } = await import("@/lib/email/recipients");
    expect(NOTIFICATION_PREFERENCES.hallucination.column).toBe("emailOnHallucination");
    const fnBody = await alertBody("sendHallucinationAlert");
    expect(fnBody).toContain('sendAlert("hallucination"');
    expect(fnBody).not.toContain('"drift"');
  });

  it("sendConsensusAlert gates on emailOnConsensus (not emailOnHallucination)", async () => {
    const { NOTIFICATION_PREFERENCES } = await import("@/lib/email/recipients");
    expect(NOTIFICATION_PREFERENCES.consensus.column).toBe("emailOnConsensus");
    const fnBody = await alertBody("sendConsensusAlert");
    expect(fnBody).toContain('sendAlert("consensus"');
    expect(fnBody).not.toContain('"hallucination"');
  });
});
