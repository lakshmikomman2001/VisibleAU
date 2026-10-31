// @vitest-environment jsdom
/**
 * A1 (Sri, 31 Oct) -- the audit-complete email is on by default. An org
 * that has never saved Settings > Notifications (no notification_
 * preferences row) sees "Email on Audit Complete" switched on; one that
 * saved it off still sees it off.
 *
 * Runs the real GET /api/notification-preferences against a real (test)
 * database and feeds its response to the real page.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import { cleanup, render, screen, within } from "@testing-library/react";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const OWNER_EMAIL = "owner@prefs-default-test.example.com.au";

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ organizationId: ORG_ID, email: OWNER_EMAIL }),
}));

let client: ReturnType<typeof postgres>;

/** The page's fetch goes to the real route handler. */
async function stubFetchToRoute() {
  const { GET } = await import("@/app/api/notification-preferences/route");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => GET()),
  );
}

/** The switch in the same row as a setting's title. */
function switchFor(title: string): HTMLElement {
  let row: HTMLElement | null = screen.getByText(title).parentElement;
  while (row && !within(row).queryByRole("switch")) row = row.parentElement;
  if (!row) throw new Error(`no switch next to "${title}"`);
  return within(row).getByRole("switch");
}

async function renderPage() {
  const { default: NotificationPreferencesPage } = await import(
    "@/app/(auth)/settings/notifications/page"
  );
  render(<NotificationPreferencesPage />);
  await screen.findByText("Email on Audit Complete");
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`prefs-default-${ORG_ID}`}, 'Prefs Default Org', ${`prefs-default-${ORG_ID}`})
  `;
}, 60000);

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await client`DELETE FROM notification_preferences WHERE organization_id = ${ORG_ID}`;
});

afterAll(async () => {
  await client`DELETE FROM notification_preferences WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

describe("Settings > Notifications: audit complete is on by default", () => {
  it("a new org (nothing saved): the API says on, and the page shows the switch on", async () => {
    const { GET } = await import("@/app/api/notification-preferences/route");
    const body = await (await GET()).json();
    expect(body.preferences.emailOnAuditComplete).toBe(true);

    await stubFetchToRoute();
    await renderPage();
    expect(switchFor("Email on Audit Complete")).toHaveAttribute("aria-checked", "true");
  });

  it("an org that saved it off: the page shows the switch off", async () => {
    await client`
      INSERT INTO notification_preferences (organization_id, digest_email, email_on_audit_complete)
      VALUES (${ORG_ID}, ${OWNER_EMAIL}, false)
    `;
    await stubFetchToRoute();
    await renderPage();
    expect(switchFor("Email on Audit Complete")).toHaveAttribute("aria-checked", "false");
  });

  it("says who gets audit complete, and that it's on by default", async () => {
    await stubFetchToRoute();
    await renderPage();
    expect(
      screen.getByText(/every other email goes to the organisation's owner and admins/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/audit complete is on by default/i)).toBeInTheDocument();
  });
});
