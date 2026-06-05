import { expect, test } from "@playwright/test";

test.describe("F04: Brand Mention Detection (Sprint 2)", () => {
  test("F04-01: Health endpoint confirms Sprint 2 API is running", async ({ request }) => {
    const res = await request.get("http://localhost:3000/api/health");
    expect(res.status()).toBe(200);
  });

  test("F04-02: Mock fixtures exist and are loadable", async () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const scenarios = ["happy_path", "no_mention", "partial_failure", "rate_limited"];
    for (const s of scenarios) {
      const fp = path.join(process.cwd(), "lib/llm/mock-responses/chatgpt", `${s}.json`);
      expect(fs.existsSync(fp), `Fixture ${s}.json must exist`).toBe(true);
      const data = JSON.parse(fs.readFileSync(fp, "utf-8"));
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    }
  });

  test("F04-03: happy_path fixture contains brand name in response", async () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const fp = path.join(process.cwd(), "lib/llm/mock-responses/chatgpt/happy_path.json");
    const data = JSON.parse(fs.readFileSync(fp, "utf-8"));
    const hasPlumber = data.some((d: { response: string }) =>
      d.response.toLowerCase().includes("bondi plumbing"),
    );
    expect(hasPlumber).toBe(true);
  });

  test("F04-04: no_mention fixture does NOT contain Bondi Plumbing", async () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const fp = path.join(process.cwd(), "lib/llm/mock-responses/chatgpt/no_mention.json");
    const data = JSON.parse(fs.readFileSync(fp, "utf-8"));
    const hasBrand = data.some((d: { response: string }) =>
      d.response.toLowerCase().includes("bondi plumbing"),
    );
    expect(hasBrand).toBe(false);
  });
});
