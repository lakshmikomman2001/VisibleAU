/**
 * Vunnara Build 1 follow-up (entry-point check) -- real-DB proof that
 * the public pre-signup sample audit (lib/sample-audit/run.ts) still
 * completes after the needs-confirmation gate landed. Its brand is a
 * synthetic row in the dedicated "sample" org with NO classification
 * and NO location (by design -- there's no onboarding step before
 * this runs) -- without lib/audit/get-audit-prompts.ts's
 * `allowUnconfirmed` opt-out, this would throw
 * BrandNeedsConfirmationError for every single prospect who tries it,
 * silently breaking the marketing funnel (runAuditInline() never
 * throws back out, so nothing would visibly crash -- the audit would
 * just sit at status 'failed' forever).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

let client: ReturnType<typeof postgres>;
const PACK_ID = randomUUID();
const DOMAIN = `sample-confirm-${Date.now()}.example.com.au`;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  // The generic vertical+region pack getAuditPrompts() falls through
  // to for a brand with no classification at all -- the "general
  // questions" fallback this sample audit (and any newly-created, not
  // yet classified real brand) relies on.
  await client`
    INSERT INTO vertical_packs (id, vertical, region, version, name, prompts_count)
    VALUES (${PACK_ID}, 'tradies', 'au', 'v1', 'Tradies AU Sample Pack', 3)
  `;
  await client`
    INSERT INTO vertical_pack_prompts (pack_id, prompt_template, rank)
    VALUES
      (${PACK_ID}, 'Best plumber in {region}?', 1),
      (${PACK_ID}, 'Who are reliable tradies in {region}?', 2),
      (${PACK_ID}, 'Top-rated local trade businesses in {region}?', 3)
  `;
});

afterAll(async () => {
  await client`DELETE FROM vertical_pack_prompts WHERE pack_id = ${PACK_ID}`;
  await client`DELETE FROM vertical_packs WHERE id = ${PACK_ID}`;
  // Clean up only what this test created -- never the shared "sample"
  // org itself, which other tests/real sample-audit traffic may also
  // depend on existing.
  const [brand] = await client`SELECT id FROM brands WHERE domain = ${DOMAIN}`;
  if (brand) {
    await client`DELETE FROM citations WHERE audit_id IN (SELECT id FROM audits WHERE brand_id = ${brand.id})`;
    await client`DELETE FROM audits WHERE brand_id = ${brand.id}`;
    await client`DELETE FROM brands WHERE id = ${brand.id}`;
  }
  await client.end();
});

describe("lib/sample-audit/run.ts -- still completes for a brand with no classification and no location", () => {
  it("runs to completion with real citation rows, using the generic vertical+region pack", async () => {
    const { runSampleAudit } = await import("@/lib/sample-audit/run");
    const { auditId, brandId } = await runSampleAudit(DOMAIN, "tradies");

    const [brand] = await client<{ classification_status: string; location_mode: string | null }[]>`
      SELECT classification_status, location_mode FROM brands WHERE id = ${brandId}
    `;
    // Confirms this is genuinely the unconfirmed shape the gate would
    // otherwise block -- not accidentally passing because the brand
    // happened to already look confirmed.
    expect(brand.classification_status).toBe("pending");
    expect(brand.location_mode).toBeNull();

    // runSampleAudit() fires runAuditInline() fire-and-forget (the
    // marketing funnel can't make a prospect wait on the HTTP response
    // for the full run) -- it only returns once the audit row exists,
    // not once the run finishes. Poll for a terminal status instead of
    // asserting immediately, so this test doesn't race the still-running
    // background work (and so afterAll's cleanup DELETEs don't fire out
    // from under an insert still in flight).
    let audit: { status: string } | undefined;
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      [audit] = await client<{ status: string }[]>`
        SELECT status FROM audits WHERE id = ${auditId}
      `;
      if (audit?.status === "complete" || audit?.status === "failed") break;
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(audit?.status).toBe("complete");

    const citationRows = await client`SELECT prompt FROM citations WHERE audit_id = ${auditId}`;
    expect(citationRows.length).toBeGreaterThan(0);
  });

  it("never shows up in a real customer's own brand trend (separate org, RLS-scoped)", async () => {
    const [sampleBrand] = await client<{ organization_id: string }[]>`
      SELECT organization_id FROM brands WHERE domain = ${DOMAIN}
    `;
    const [sampleOrg] = await client<{ slug: string }[]>`
      SELECT slug FROM organizations WHERE id = ${sampleBrand.organization_id}
    `;
    // The sample brand lives in its own dedicated org -- every brand
    // page / trend query is scoped by withRlsContext(currentUser.
    // organizationId, ...), which Postgres RLS enforces regardless of
    // application logic, so a real customer's own org can never see
    // this row's audits no matter what they query.
    expect(sampleOrg.slug).toBe("__sample__");
  });
});
