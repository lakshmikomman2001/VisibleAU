/**
 * Vunnara Build 1 follow-up (entry-point check) -- real-DB proof that
 * the external client portal (app/client-portal/[inviteToken]/page.tsx)
 * renders safely for a brand that needs confirmation and so has never
 * had an audit run. The portal is read-only -- it only ever SELECTs the
 * latest 'complete' audit, never calls getAuditPrompts() or any runner
 * -- so the needs-confirmation gate can't throw through it. The
 * required behaviour is the existing "no completed audits yet" empty
 * state, same as any other brand that simply hasn't been audited yet:
 * never an error page, never a 500.
 *
 * Pattern follows tests/integration/insufficient-data-phase2-surfaces.
 * integration.test.ts's client-portal case: render the server component
 * directly via renderToStaticMarkup(), real DB rows, no mocked DB layer.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const BRAND_ID = randomUUID();
const INVITE_TOKEN = `needs-confirm-${randomUUID()}`;

let client: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`portal-confirm-${ORG_ID}`}, 'Portal Confirm Test Org', ${`portal-confirm-org-${ORG_ID}`})
  `;
  // Unconfirmed brand -- classification_status defaults to 'pending',
  // location_mode defaults to NULL. Never audited, since every audit
  // entry point blocks it -- no audits row exists at all.
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_ID}, ${ORG_ID}, 'Portal Confirm Co', 'portalconfirmco.example.com.au', 'tradies', 'au', ARRAY[]::text[])
  `;
  await client`
    INSERT INTO client_portal_invites (organization_id, brand_id, invite_token, status)
    VALUES (${ORG_ID}, ${BRAND_ID}, ${INVITE_TOKEN}, 'active')
  `;
});

afterAll(async () => {
  await client`DELETE FROM client_portal_invites WHERE invite_token = ${INVITE_TOKEN}`;
  await client`DELETE FROM brands WHERE id = ${BRAND_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

describe("app/client-portal/[inviteToken]/page.tsx -- a needs-confirmation brand with no audits yet", () => {
  it("renders the existing 'no completed audits yet' note, never an error page", async () => {
    const ClientPortalViewPage = (await import("@/app/client-portal/[inviteToken]/page")).default;
    const element = await ClientPortalViewPage({
      params: Promise.resolve({ inviteToken: INVITE_TOKEN }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("No completed audits yet");
    expect(html).toContain("Portal Confirm Co");
    expect(html).not.toContain("Brand Not Found");
    expect(html).not.toContain("Invalid Link");
    expect(html).not.toMatch(/error/i);
  });
});
