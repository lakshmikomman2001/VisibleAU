/**
 * Mock-gate follow-ups (Sri, 2 Nov), part 1 -- the mock LLM already refused production (mock-in-production.test.ts);
 * the other mock shortcuts didn't: brand classification returned a canned classification, the entity check
 * counted any stored ABN as verified, and ABN_LOOKUP_BYPASS=mock-verified checked NODE_ENV only. All of them now
 * go through lib/mock-mode.ts (the only reader of LLM_MODE): in production (NODE_ENV or VERCEL_ENV) they refuse,
 * and an ABN is never "verified" unless it was checked. Local development and vitest behave as before.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DbClient } from "@/db/client";
import { lookupAbn } from "@/lib/brand-entity/abn-lookup";
import { classifyBrand } from "@/lib/brands/classify-brand";
import { MockInProductionError } from "@/lib/llm/mock-impl";
import { refreshEntityScore } from "@/lib/trust/entity-checker";
import { NON_TEST_ROOTS, sourceFiles } from "../../helpers/source-files";

const ABN = "51824753556";

function fakeTx(existing: Record<string, unknown>) {
  const writes: Record<string, unknown>[] = [];
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: async () => [existing],
    set: (values: Record<string, unknown>) => {
      writes.push(values);
      return chain;
    },
  };
  return { tx: { select: () => chain, update: () => chain } as unknown as DbClient, writes };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("in production every mock shortcut refuses", () => {
  it("LLM_MODE=mock with NODE_ENV=production: brand classification throws, never the canned answer", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LLM_MODE", "mock");
    await expect(classifyBrand("Bondi Plumbing", "bondiplumbing.com.au")).rejects.toThrow(
      MockInProductionError,
    );
  });

  it("the same under Vercel's VERCEL_ENV=production, whatever NODE_ENV says", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("LLM_MODE", "mock");
    await expect(classifyBrand("Bondi Plumbing", "bondiplumbing.com.au")).rejects.toThrow(
      MockInProductionError,
    );
  });

  it("the entity check throws before writing anything: a stored ABN is never counted as verified", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LLM_MODE", "mock");
    const { tx, writes } = fakeTx({ id: "row-1", abnVerified: false, abnNumber: ABN });
    await expect(refreshEntityScore(tx, "brand-1", "org-1", "AU_EN")).rejects.toThrow(
      MockInProductionError,
    );
    expect(writes).toEqual([]);
  });

  it("ABN_LOOKUP_BYPASS=mock-verified: the ABN is reported unchecked, never verified (NODE_ENV or VERCEL_ENV)", async () => {
    vi.stubEnv("ABN_LOOKUP_BYPASS", "mock-verified");
    vi.stubEnv("LLM_MODE", "mock");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    for (const [nodeEnv, vercelEnv] of [
      ["production", ""],
      ["test", "production"],
    ] as const) {
      vi.stubEnv("NODE_ENV", nodeEnv);
      vi.stubEnv("VERCEL_ENV", vercelEnv);
      const result = await lookupAbn("51 824 753 556");
      expect(result.abnVerified).toBe(false);
      expect(result.abnStatus).toBe("check_skipped");
      expect(result.abnEntityName).toBeNull();
    }
  });
});

describe("demo mode is a local switch too", () => {
  it("DEMO_MODE=true: /api/demo is a 404 under VERCEL_ENV=production as well as NODE_ENV, and answers locally", async () => {
    const { GET } = await import("@/app/api/demo/route");
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await GET()).status).toBe(404);
    vi.stubEnv("VERCEL_ENV", "");
    expect((await GET()).status).toBe(200);
  });
});

describe("in local development (and under vitest) they behave as before", () => {
  it("LLM_MODE=mock in next dev: the canned classification, the stored ABN counted, the bypass verified", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("LLM_MODE", "mock");
    vi.stubEnv("ABN_LOOKUP_BYPASS", "mock-verified");
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const classification = await classifyBrand("Bondi Plumbing", "bondiplumbing.com.au");
    expect(classification.category).toBe("saas_design_tools");

    const { tx } = fakeTx({ id: "row-1", abnVerified: false, abnNumber: ABN });
    const entity = await refreshEntityScore(tx, "brand-1", "org-1", "AU_EN");
    expect(entity.localRegVerified).toBe(true);

    const abn = await lookupAbn("51 824 753 556");
    expect(abn.abnVerified).toBe(true);
    expect(abn.abnEntityName).toBe("MOCK — ABN check bypassed");
  });
});

describe("one reader of LLM_MODE", () => {
  it("no non-test file reads LLM_MODE directly except lib/mock-mode.ts", () => {
    const READS_LLM_MODE =
      /process\.env\.LLM_MODE\b|process\.env\[\s*["'`]LLM_MODE["'`]\s*\]|\benv\.LLM_MODE\b|\{[^}]*\bLLM_MODE\b[^}]*\}\s*=\s*process\.env/;
    const offenders = sourceFiles(NON_TEST_ROOTS)
      .filter((file) => file.path !== "lib/mock-mode.ts")
      .filter((file) => READS_LLM_MODE.test(file.text))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });
});
