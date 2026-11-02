/**
 * 2 Nov ("Upload instead does nothing in Brand basics") -- uploading and
 * serving logos, against the real routes, the local test database and the
 * local storage driver (a temp folder):
 * - POST /api/branding/logo: owners and admins only (analyst and viewer
 *   403, signed out 401); a PNG or JPEG of at most 2 MB, by its own bytes
 *   (413, 415); stored under <org>/branding/<random uuid>.<png|jpg>;
 * - GET /api/branding/logo/<org>/<file>: that file, as image/png or
 *   image/jpeg, nosniff, cached; 404 for anything else -- a traversal, a
 *   name that isn't <uuid>.png|.jpg, bytes that aren't what the name says,
 *   a missing file, storage failing;
 * - POST /api/brands saves a logo the workspace uploaded, and only that.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const currentUser = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => currentUser.value),
}));
// lib/storage/index.ts loads the adapter with require(), which Next's
// bundler handles and vitest's ESM loader can't: the same, real
// LocalStorageAdapter (writing under STORAGE_LOCAL_DIR), imported the ESM
// way -- and storage that can't be reached when STORAGE_DRIVER says so. It
// records which bucket each caller asks for: production's "reports" bucket
// takes only PDFs.
const storage = vi.hoisted(() => ({ buckets: [] as Array<string | undefined> }));
vi.mock("@/lib/storage", async () => {
  const { LocalStorageAdapter } = await import("@/lib/storage/local-adapter");
  return {
    getStorage: (bucket?: string) => {
      storage.buckets.push(bucket);
      if (process.env.STORAGE_DRIVER !== "local") {
        throw new Error(`Unknown STORAGE_DRIVER "${process.env.STORAGE_DRIVER}"`);
      }
      return new LocalStorageAdapter();
    },
  };
});

const ORG = randomUUID();
const OTHER_ORG = randomUUID();
const ROLES = ["owner", "admin", "analyst", "viewer"] as const;
type Role = (typeof ROLES)[number];
const PEOPLE: Record<Role, string> = {
  owner: randomUUID(),
  admin: randomUUID(),
  analyst: randomUUID(),
  viewer: randomUUID(),
};
const OTHER_OWNER = randomUUID();
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);

let sql: ReturnType<typeof postgres>;
let storageDir: string;

beforeAll(async () => {
  sql = postgres(getTestDatabaseUrl(), { max: 1 });
  storageDir = mkdtempSync(join(tmpdir(), "vunnara-logos-"));
  for (const [org, name] of [
    [ORG, "Splice Marketing"],
    [OTHER_ORG, "Other Agency"],
  ]) {
    const tag = org.slice(0, 8);
    await sql`
      INSERT INTO organizations (id, clerk_org_id, name, slug)
      VALUES (${org}, ${`logo-${tag}`}, ${`${name} ${tag}`}, ${`logo-${tag}`})
    `;
  }
  const people: Array<[string, string, Role]> = [
    ...ROLES.map((role) => [PEOPLE[role], ORG, role] as [string, string, Role]),
    [OTHER_OWNER, OTHER_ORG, "owner"],
  ];
  for (const [id, org, role] of people) {
    await sql`
      INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
      VALUES (${id}, ${`logo-${id}`}, ${org}, ${`${role}-${id.slice(0, 8)}@example.com.au`}, ${role}, 'member')
    `;
    await sql`
      INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
      VALUES (${org}, ${id}, ${role}, now() + interval '7 days', now(), true)
    `;
  }
}, 60_000);

afterAll(async () => {
  for (const org of [ORG, OTHER_ORG]) {
    await sql`DELETE FROM brands WHERE organization_id = ${org}`;
    await sql`DELETE FROM org_members WHERE organization_id = ${org}`;
    await sql`DELETE FROM users WHERE organization_id = ${org}`;
    await sql`DELETE FROM organizations WHERE id = ${org}`;
  }
  await sql?.end();
  rmSync(storageDir, { recursive: true, force: true });
});

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("STORAGE_DRIVER", "local");
  vi.stubEnv("STORAGE_LOCAL_DIR", storageDir);
});

function signIn(id: string | null, org = ORG) {
  currentUser.value = id
    ? {
        id,
        organizationId: org,
        role: "member",
        email: "x@example.com.au",
        organization: { id: org, region: "au" },
      }
    : null;
}

async function upload(body: Buffer | null, name = "logo.png", type = "image/png") {
  const { POST } = await import("@/app/api/branding/logo/route");
  const form = new FormData();
  if (body) form.append("file", new Blob([new Uint8Array(body)], { type }), name);
  const res = await POST(
    new Request("http://localhost/api/branding/logo", { method: "POST", body: form }),
  );
  return { status: res.status, body: (await res.json()) as { logoUrl?: string; error?: string } };
}

async function serve(orgId: string, file: string) {
  const { GET } = await import("@/app/api/branding/logo/[orgId]/[file]/route");
  return GET(new Request(`http://localhost/api/branding/logo/${orgId}/${file}`), {
    params: Promise.resolve({ orgId, file }),
  });
}

function storedFiles(org: string): string[] {
  const dir = join(storageDir, org, "branding");
  return existsSync(dir) ? readdirSync(dir) : [];
}

describe("POST /api/branding/logo", () => {
  it("an owner uploads a PNG: stored under a random name in the logos bucket, and served back as image/png", async () => {
    signIn(PEOPLE.owner);
    storage.buckets.length = 0;
    const { status, body } = await upload(PNG, "splice.png");
    expect(status).toBe(201);
    const match = /^\/api\/branding\/logo\/([0-9a-f-]{36})\/([0-9a-f-]{36}\.png)$/.exec(
      body.logoUrl ?? "",
    );
    expect(match?.[1]).toBe(ORG);
    const file = match?.[2] ?? "";
    expect(file).not.toContain("splice");
    expect(storedFiles(ORG)).toContain(file);

    const res = await serve(ORG, file);
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'");
    // The stored-files cap, the upload and the serving route: each asks for "logos".
    expect(storage.buckets).toEqual(["logos", "logos", "logos"]);
  });

  it("an admin uploads a JPEG: served as image/jpeg", async () => {
    signIn(PEOPLE.admin);
    const { status, body } = await upload(JPEG, "splice.jpg", "image/jpeg");
    expect(status).toBe(201);
    const file = (body.logoUrl ?? "").split("/").pop() ?? "";
    expect(file).toMatch(/\.jpg$/);
    const res = await serve(ORG, file);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
  });

  it("an analyst or a viewer gets 403, and nothing is stored; signed out gets 401", async () => {
    const before = storedFiles(ORG).length;
    for (const role of ["analyst", "viewer"] as const) {
      signIn(PEOPLE[role]);
      const { status, body } = await upload(PNG);
      expect(status, role).toBe(403);
      expect(body.error).toBe("Only owners and admins can upload a logo");
    }
    signIn(null);
    expect((await upload(PNG)).status).toBe(401);
    expect(storedFiles(ORG).length).toBe(before);
  });

  it("over 2 MB: 413 'File too large'; not a PNG or JPEG by its bytes: 415, whatever it's called", async () => {
    signIn(PEOPLE.owner);
    const before = storedFiles(ORG).length;
    const big = Buffer.alloc(2 * 1024 * 1024 + 1);
    PNG.copy(big);
    expect(await upload(big)).toEqual({ status: 413, body: { error: "File too large" } });
    for (const [bytes, name, type] of [
      [Buffer.from("GIF89a......"), "logo.gif", "image/gif"],
      [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), "logo.svg", "image/svg+xml"],
      [Buffer.from("<html><script>alert(1)</script></html>"), "logo.png", "image/png"],
    ] as const) {
      expect(await upload(bytes, name, type), name).toEqual({
        status: 415,
        body: { error: "Use PNG, JPEG or SVG" },
      });
    }
    expect((await upload(null)).status).toBe(400);
    expect(storedFiles(ORG).length).toBe(before);
  });
});

describe("GET /api/branding/logo/<org>/<file>: 404 for anything that isn't a stored logo", () => {
  const FILE = `${randomUUID()}.png`;
  beforeAll(() => {
    // A report PDF in the workspace's folder, and other files beside the logos.
    mkdirSync(join(storageDir, ORG, "branding"), { recursive: true });
    writeFileSync(join(storageDir, ORG, "report.pdf"), "%PDF-1.4 secret report");
    writeFileSync(join(storageDir, ORG, "branding", FILE), PNG);
  });

  async function expectNotFound(orgId: string, file: string) {
    const res = await serve(orgId, file);
    expect(res.status, `${orgId}/${file}`).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await res.arrayBuffer()).byteLength).toBe(0);
  }

  it("path traversal, in any spelling, never reaches storage", async () => {
    for (const [orgId, file] of [
      [ORG, "../report.pdf"],
      [ORG, "..%2Freport.pdf"],
      [ORG, "%2e%2e%2freport.pdf"],
      [ORG, `../branding/${FILE}`],
      [ORG, `${FILE}/../../report.pdf`],
      ["..", `${ORG}/report.pdf`],
      [`${ORG}/..`, FILE],
      [`${ORG}/branding`, FILE],
      ["../../etc", "passwd"],
    ]) {
      await expectNotFound(orgId, file);
    }
  });

  it("a name that isn't <uuid>.png or .jpg, or bytes that aren't what it says", async () => {
    const id = randomUUID();
    writeFileSync(join(storageDir, ORG, "branding", `${id}.png`), "<svg onload='alert(1)'/>");
    writeFileSync(join(storageDir, ORG, "branding", `${id}.jpg`), PNG);
    writeFileSync(join(storageDir, ORG, "branding", `${id}.pdf`), "%PDF-1.4");
    for (const file of [
      `${id}.png`,
      `${id}.jpg`,
      `${id}.svg`,
      `${id}.gif`,
      `${id}.pdf`,
      "logo.png",
    ]) {
      await expectNotFound(ORG, file);
    }
  });

  it("a missing file, a workspace id that isn't a uuid, and storage failing", async () => {
    await expectNotFound(ORG, `${randomUUID()}.png`);
    await expectNotFound("not-a-workspace", FILE);
    vi.stubEnv("STORAGE_DRIVER", "nowhere");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expectNotFound(ORG, FILE);
    expect(String(error.mock.calls[0]?.[0])).toContain('"event":"logo_read_failed"');
    error.mockRestore();
  });

  it("the real file, for comparison, is served", async () => {
    expect((await serve(ORG, FILE)).status).toBe(200);
  });
});

describe("POST /api/brands saves the brand's own uploaded logo, and only that", () => {
  async function createBrand(logoUrl: unknown) {
    const { inngest } = await import("@/lib/inngest/client");
    const send = vi.spyOn(inngest, "send").mockResolvedValue({ ids: ["x"] });
    const { POST } = await import("@/app/api/brands/route");
    try {
      const res = await POST(
        new Request("http://localhost/api/brands", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Splice Marketing",
            domain: `splice-${randomUUID().slice(0, 8)}.example.com.au`,
            vertical: "tradies",
            locationMode: "online_only",
            logoUrl,
          }),
        }),
      );
      return {
        status: res.status,
        body: (await res.json()) as { brand?: { id: string }; error?: string },
      };
    } finally {
      send.mockRestore();
    }
  }

  it("a logo this workspace uploaded is saved on the brand", async () => {
    signIn(PEOPLE.owner);
    const { body: uploaded } = await upload(PNG);
    const { status, body } = await createBrand(uploaded.logoUrl);
    expect(status).toBe(201);
    const [row] = await sql<{ logo_url: string | null }[]>`
      SELECT logo_url FROM brands WHERE id = ${body.brand?.id ?? ""}
    `;
    expect(row.logo_url).toBe(uploaded.logoUrl);
  });

  it("another workspace's logo, or a web address, is refused", async () => {
    signIn(OTHER_OWNER, OTHER_ORG);
    const { body: theirs } = await upload(PNG);
    signIn(PEOPLE.owner);
    for (const logoUrl of [theirs.logoUrl, "https://example.com/logo.png", "/etc/passwd"]) {
      const { status, body } = await createBrand(logoUrl);
      expect(status, String(logoUrl)).toBe(400);
      expect(body.error).toBe("logoUrl: upload the logo first");
    }
  });
});
