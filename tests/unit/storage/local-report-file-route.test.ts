/**
 * Regression follow-ups (9 Nov), part 4 -- GET /api/reports/file/[...path], the local storage driver's PDFs.
 * Its path was joined from the environment and the request, which made Turbopack trace the whole project
 * into the route (a build warning); it's built with ignore comments now. And it served any path whose text
 * started with the workspace's id: a decoded ".." stepped into another workspace's folder.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sourceText } from "../../helpers/source-files";

const ORG = "0f9d8c7b-6a5e-4d3c-8b2a-1f0e9d8c7b6a";
const OTHER = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const user = vi.hoisted(() => ({ current: null as { organizationId: string } | null }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: async () => user.current }));

const dir = mkdtempSync(join(tmpdir(), "reports-"));

beforeAll(async () => {
  mkdirSync(join(dir, ORG), { recursive: true });
  mkdirSync(join(dir, OTHER), { recursive: true });
  writeFileSync(join(dir, ORG, "r1.pdf"), "%PDF-ours");
  writeFileSync(join(dir, OTHER, "r2.pdf"), "%PDF-theirs");
  await import("@/app/api/reports/file/[...path]/route");
}, 30_000);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

beforeEach(() => {
  vi.stubEnv("STORAGE_DRIVER", "local");
  vi.stubEnv("STORAGE_LOCAL_DIR", dir);
  user.current = { organizationId: ORG };
});

async function get(...path: string[]) {
  const { GET } = await import("@/app/api/reports/file/[...path]/route");
  return GET(new Request("http://localhost/api/reports/file"), {
    params: Promise.resolve({ path }),
  });
}

describe("GET /api/reports/file/[...path]", () => {
  it("serves the workspace's own PDF", async () => {
    const res = await get(ORG, "r1.pdf");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(await res.text()).toBe("%PDF-ours");
  });

  it("refuses another workspace's PDF, by its path or by a '..' out of its own folder", async () => {
    expect((await get(OTHER, "r2.pdf")).status).toBe(403);
    expect((await get(ORG, "..", OTHER, "r2.pdf")).status).toBe(403);
    expect((await get(`${ORG}x`, "r1.pdf")).status).toBe(403);
    expect((await get(ORG)).status).toBe(403);
  });

  it("answers 404 for a file that isn't there, 401 signed out, and 404 off the local driver", async () => {
    expect((await get(ORG, "missing.pdf")).status).toBe(404);
    user.current = null;
    expect((await get(ORG, "r1.pdf")).status).toBe(401);
    user.current = { organizationId: ORG };
    vi.stubEnv("STORAGE_DRIVER", "supabase");
    expect((await get(ORG, "r1.pdf")).status).toBe(404);
  });

  it("builds every file path out of Turbopack's tracing", () => {
    const code = sourceText("app/api/reports/file/[...path]/route.ts");
    const pathCalls = code.match(/\b(resolve|join|stat|readFile)\(/g) ?? [];
    const ignored =
      code.match(/\b(resolve|join|stat|readFile)\(\s*\/\*turbopackIgnore: true\*\//g) ?? [];
    expect(pathCalls.length).toBeGreaterThan(0);
    expect(ignored).toHaveLength(pathCalls.length);
  });
});
