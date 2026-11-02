/**
 * 3 Nov ("Logo uploads: limits now, cleanup job dry-run") -- POST
 * /api/branding/logo had no limit. Against the real route, the local test
 * database (the rate-limit counters) and local storage (a temp folder):
 * - at most 20 uploads per workspace per hour (429);
 * - at most 200 stored files per workspace (409);
 * - each refusal says so, stores nothing and logs counts only.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const currentUser = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => currentUser.value),
}));
const storageFailure = vi.hoisted(() => ({ list: false }));
vi.mock("@/lib/storage", async () => {
  const { LocalStorageAdapter } = await import("@/lib/storage/local-adapter");
  return {
    getStorage: () => {
      const storage = new LocalStorageAdapter();
      if (storageFailure.list) {
        storage.list = async () => {
          throw new Error("storage can't be reached");
        };
      }
      return storage;
    },
  };
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const TOO_MANY = "Too many uploads, try again later";
// Mid-hour, so the counters' fixed window can't roll over during a test.
const MID_HOUR = new Date("2026-11-03T10:30:00.000Z");

let sql: ReturnType<typeof postgres>;
let storageDir: string;
const orgs: string[] = [];

/** A fresh workspace with an owner, signed in: its counters and folder start empty. */
async function freshWorkspace() {
  const org = randomUUID();
  const owner = randomUUID();
  orgs.push(org);
  const tag = org.slice(0, 8);
  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${org}, ${`logo-limits-${tag}`}, ${`Logo Limits ${tag}`}, ${`logo-limits-${tag}`})
  `;
  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${owner}, ${`logo-limits-${owner}`}, ${org}, ${`owner-${tag}@example.com.au`}, 'Owner', 'owner')
  `;
  await sql`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${org}, ${owner}, 'owner', now() + interval '7 days', now(), true)
  `;
  currentUser.value = {
    id: owner,
    organizationId: org,
    role: "owner",
    email: `owner-${tag}@example.com.au`,
    organization: { id: org, region: "au" },
  };
  return org;
}

async function upload() {
  const { POST } = await import("@/app/api/branding/logo/route");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(PNG)], { type: "image/png" }), "logo.png");
  const res = await POST(
    new Request("http://localhost/api/branding/logo", { method: "POST", body: form }),
  );
  return {
    status: res.status,
    retryAfter: res.headers.get("Retry-After"),
    body: (await res.json()) as { logoUrl?: string; error?: string },
  };
}

function storedFiles(org: string): string[] {
  try {
    return readdirSync(join(storageDir, org, "branding"));
  } catch {
    return [];
  }
}

/** Files already in the folder, as earlier uploads would have left them. */
function fill(org: string, count: number) {
  const folder = join(storageDir, org, "branding");
  mkdirSync(folder, { recursive: true });
  for (let i = 0; i < count; i++) writeFileSync(join(folder, `${randomUUID()}.png`), PNG);
}

beforeAll(async () => {
  sql = postgres(getTestDatabaseUrl(), { max: 1 });
  storageDir = mkdtempSync(join(tmpdir(), "vunnara-logo-limits-"));
}, 60_000);

afterAll(async () => {
  for (const org of orgs) {
    await sql`DELETE FROM org_members WHERE organization_id = ${org}`;
    await sql`DELETE FROM users WHERE organization_id = ${org}`;
    await sql`DELETE FROM organizations WHERE id = ${org}`;
  }
  await sql`DELETE FROM rate_limit_counters WHERE bucket_key LIKE 'logo-upload:%'`;
  await sql?.end();
  rmSync(storageDir, { recursive: true, force: true });
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: MID_HOUR });
  vi.stubEnv("STORAGE_DRIVER", "local");
  vi.stubEnv("STORAGE_LOCAL_DIR", storageDir);
  storageFailure.list = false;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("at most 20 uploads per workspace per hour", () => {
  it("the 21st is refused with 429, says why, stores nothing and logs counts only", async () => {
    const org = await freshWorkspace();
    for (let i = 0; i < 20; i++) expect((await upload()).status).toBe(201);
    expect(storedFiles(org)).toHaveLength(20);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const refused = await upload();
    expect(refused.status).toBe(429);
    expect(refused.body.error).toBe(TOO_MANY);
    expect(Number(refused.retryAfter)).toBe(30 * 60);
    expect(storedFiles(org)).toHaveLength(20);

    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(String(warn.mock.calls[0][0]));
    expect(logged).toEqual({
      event: "logo_upload_limited",
      organizationId: org,
      limit: "hourly",
      max: 20,
    });
  });

  it("the next hour it's allowed again", async () => {
    await freshWorkspace();
    for (let i = 0; i < 20; i++) await upload();
    expect((await upload()).status).toBe(429);
    vi.setSystemTime(new Date(MID_HOUR.getTime() + 60 * 60 * 1000));
    expect((await upload()).status).toBe(201);
  });

  it("one workspace's uploads don't use up another's", async () => {
    await freshWorkspace();
    for (let i = 0; i < 20; i++) await upload();
    expect((await upload()).status).toBe(429);
    await freshWorkspace();
    expect((await upload()).status).toBe(201);
  });

  it("a file that was refused anyway doesn't use one up", async () => {
    await freshWorkspace();
    const { POST } = await import("@/app/api/branding/logo/route");
    for (let i = 0; i < 25; i++) {
      const form = new FormData();
      form.append("file", new Blob(["not an image"], { type: "image/png" }), "logo.png");
      const res = await POST(
        new Request("http://localhost/api/branding/logo", { method: "POST", body: form }),
      );
      expect(res.status).toBe(415);
    }
    expect((await upload()).status).toBe(201);
  });
});

describe("at most 200 stored files per workspace", () => {
  it("with 199 stored the upload works; with 200 it's refused with 409 and logs counts only", async () => {
    const org = await freshWorkspace();
    fill(org, 199);
    expect((await upload()).status).toBe(201);
    expect(storedFiles(org)).toHaveLength(200);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const refused = await upload();
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe(TOO_MANY);
    expect(storedFiles(org)).toHaveLength(200);

    const logged = JSON.parse(String(warn.mock.calls[0][0]));
    expect(logged).toEqual({
      event: "logo_upload_limited",
      organizationId: org,
      limit: "stored",
      stored: 200,
      max: 200,
    });
  });

  it("another workspace's files don't count", async () => {
    const full = await freshWorkspace();
    fill(full, 200);
    expect((await upload()).status).toBe(409);
    await freshWorkspace();
    expect((await upload()).status).toBe(201);
  });

  it("if storage can't be listed the cap is skipped and logged: the upload decides", async () => {
    const org = await freshWorkspace();
    storageFailure.list = true;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await upload()).status).toBe(201);
    expect(storedFiles(org)).toHaveLength(1);
    expect(JSON.parse(String(error.mock.calls[0][0]))).toMatchObject({
      event: "logo_upload_cap_unchecked",
      organizationId: org,
    });
  });
});
