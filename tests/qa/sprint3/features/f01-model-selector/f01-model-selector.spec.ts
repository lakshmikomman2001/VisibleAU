import path from "node:path";
import { expect, test } from "@playwright/test";

function loadModule(relativePath: string) {
  return require(path.join(process.cwd(), relativePath));
}

test.describe("F01: Model Selector (Sprint 3)", () => {
  test("F01-01: Health check confirms Sprint 3 API running", async ({ request }) => {
    const res = await request.get("http://localhost:3000/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.db).toBe("ok");
  });

  test("F01-02: Model selector exports selectModel function", async () => {
    const { selectModel } = loadModule("lib/llm/model-selector");
    expect(typeof selectModel).toBe("function");
    expect(selectModel("free", "chatgpt", "brand_mention")).toBe("gpt-4o-mini");
    expect(selectModel("agency", "chatgpt", "brand_mention")).toBe("gpt-4o");
    expect(selectModel("agency_pro", "chatgpt", "sentiment")).toBe("gpt-4o-mini");
  });

  test("F01-03: Tier engines exports correct engine counts", async () => {
    const { enginesForTier } = loadModule("lib/llm/tier-engines");
    expect(enginesForTier("free")).toHaveLength(2);
    expect(enginesForTier("starter")).toHaveLength(4);
    expect(enginesForTier("agency_pro")).toHaveLength(4);
  });
});
