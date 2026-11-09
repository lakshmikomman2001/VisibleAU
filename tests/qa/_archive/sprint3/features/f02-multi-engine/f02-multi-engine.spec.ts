import { expect, test } from "@playwright/test";

test.describe("F02: Multi-Engine Support (Sprint 3)", () => {
  test("F02-01: Mock fixtures exist for all 4 engines", async () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const engines = ["chatgpt", "claude", "gemini", "perplexity"];
    const scenarios = ["happy_path", "no_mention", "partial_failure", "rate_limited"];
    for (const engine of engines) {
      for (const scenario of scenarios) {
        const fp = path.join(process.cwd(), "lib/llm/mock-responses", engine, `${scenario}.json`);
        expect(fs.existsSync(fp), `${engine}/${scenario}.json must exist`).toBe(true);
      }
    }
  });

  test("F02-02: Total fixture count = 16 (4 engines x 4 scenarios)", async () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const dir = path.join(process.cwd(), "lib/llm/mock-responses");
    let count = 0;
    for (const engine of fs.readdirSync(dir)) {
      const engineDir = path.join(dir, engine);
      if (fs.statSync(engineDir).isDirectory()) {
        count += fs.readdirSync(engineDir).filter((f: string) => f.endsWith(".json")).length;
      }
    }
    expect(count).toBe(16);
  });

  test("F02-03: Each fixture has valid JSON array structure", async () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const engines = ["chatgpt", "claude", "gemini", "perplexity"];
    for (const engine of engines) {
      const fp = path.join(process.cwd(), "lib/llm/mock-responses", engine, "happy_path.json");
      const data = JSON.parse(fs.readFileSync(fp, "utf-8"));
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
      expect(data[0]).toHaveProperty("response");
      expect(data[0]).toHaveProperty("tokens_used");
    }
  });
});
