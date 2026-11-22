/**
 * S00B part 3, classification's home-page read (lib/brands/classify-brand.ts: the title, description and first h1
 * it sends with the brand, read through crawlSite, one page, 8 s) on the guarded fetcher.
 *
 * Parity: on the recorded sites, the classification prompt and result are what they were before S00B (golden
 * written with UPDATE_GOLDEN=1 on the code before the crawler moved). Refusal: a home page that redirects to an
 * internal address gives no home-page signals (the existing "couldn't read the site" path: confidence lowered),
 * where before S00B the internal page's title and heading went into the prompt.
 */
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureFetch, golden } from "../../helpers/fetch-fixtures";
import { FIXTURE_DOMAINS, SITES, startInternalServer } from "../../helpers/fixture-sites";

const { completeMock } = vi.hoisted(() => ({ completeMock: vi.fn() }));
vi.mock("@/lib/llm", () => ({
  getLLMService: vi.fn(() => ({ complete: completeMock })),
}));

const { classifyBrand } = await import("@/lib/brands/classify-brand");

const realFetch = globalThis.fetch.bind(globalThis);
const GOLDEN = resolve(__dirname, "__golden__/classification.json");
const LLM_ANSWER = JSON.stringify({
  category: "trades_plumbing",
  buyerType: "smb",
  audience: "households",
  confidence: 0.9,
  auRelevance: "high",
  competitors: ["Other Plumbing"],
  intentSignals: ["emergency plumber Sydney"],
  service: "plumbing",
});

let internal: Awaited<ReturnType<typeof startInternalServer>>;
const originalMode = process.env.LLM_MODE;

beforeAll(async () => {
  internal = await startInternalServer();
});

afterAll(async () => {
  process.env.LLM_MODE = originalMode;
  await internal.close();
});

beforeEach(() => {
  vi.restoreAllMocks();
  completeMock.mockReset();
  completeMock.mockResolvedValue({ response: LLM_ANSWER });
  process.env.LLM_MODE = "real";
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("parity: the classification input from recorded sites is as before S00B", () => {
  it("the prompt sent and the classification, for four sites", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(fixtureFetch(SITES));
    const outputs: Record<string, unknown> = {};
    for (const domain of FIXTURE_DOMAINS) {
      completeMock.mockClear();
      const classification = await classifyBrand("Fixture Business", domain, "tradies");
      outputs[domain] = { prompt: completeMock.mock.calls[0][0].prompt, classification };
    }
    const { expected, actual } = golden(GOLDEN, outputs);
    expect(actual).toBe(expected);
  });
});

describe("refusal: an internal page never reaches the classification prompt", () => {
  it("a home page that redirects to an internal address: classified from the name and domain alone", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      fixtureFetch(
        {
          "https://fixture-redirect.com.au/robots.txt": { status: 404, body: "" },
          "https://fixture-redirect.com.au/": {
            redirect: 302,
            location: `http://127.0.0.1:${internal.port}/admin`,
          },
        },
        { passThrough: realFetch },
      ),
    );
    const classification = await classifyBrand("Redirect Co", "fixture-redirect.com.au");
    const prompt: string = completeMock.mock.calls[0][0].prompt;
    expect(prompt).not.toContain("Internal admin");
    expect(prompt).not.toMatch(/homepage title:/);
    // The existing path for a home page that couldn't be read: confidence at most 0.5.
    expect(classification.confidence).toBeLessThanOrEqual(0.5);
    expect(internal.hits).toEqual([]);
  });
});
