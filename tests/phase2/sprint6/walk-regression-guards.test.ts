import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "../../..");

const RETRIEVAL_PAGES = [
  "app/(auth)/brands/[brandId]/retrieval/page",
  "app/(auth)/brands/[brandId]/retrieval/agent-readiness/page",
  "app/(auth)/brands/[brandId]/retrieval/content-structure/page",
  "app/(auth)/brands/[brandId]/retrieval/crawler-logs/page",
  "app/(auth)/brands/[brandId]/retrieval/entity-home/page",
  "app/(auth)/brands/[brandId]/retrieval/llmstxt/page",
];

const RETRIEVAL_FILES = [
  ...RETRIEVAL_PAGES.map((p) => p + ".tsx"),
  "components/domain/retrieval/agent-readiness-card.tsx",
  "components/domain/retrieval/cdn-block-alert.tsx",
  "components/domain/retrieval/content-structure-card.tsx",
  "components/domain/retrieval/crawler-log-table.tsx",
  "components/domain/retrieval/entity-home-card.tsx",
  "components/domain/retrieval/llmstxt-viewer.tsx",
  "components/domain/retrieval/retrieval-score-summary.tsx",
];

describe("Walk-found regression guards", () => {
  describe("Guard 4 — no hardcoded 'white' in any retrieval file", () => {
    it.each(RETRIEVAL_FILES)("%s has no hardcoded color:'white'", (relPath) => {
      const src = readFileSync(join(ROOT, relPath), "utf-8");
      expect(src).not.toMatch(/color:\s*["']white["']/);
    });

    it("accent-primary buttons use --accent-primary-fg CSS var", () => {
      const arPage = readFileSync(
        join(ROOT, "app/(auth)/brands/[brandId]/retrieval/agent-readiness/page.tsx"),
        "utf-8",
      );
      const llmstxtViewer = readFileSync(
        join(ROOT, "components/domain/retrieval/llmstxt-viewer.tsx"),
        "utf-8",
      );
      expect(arPage).toContain("var(--accent-primary-fg)");
      expect(llmstxtViewer).toContain("var(--accent-primary-fg)");
    });
  });

  describe("Guards 6+7 — retrieval page modules load + export default component (compile-break catcher)", () => {
    for (const p of RETRIEVAL_PAGES) {
      it(`imports ${p} and its default export is a function`, async () => {
        const mod = await import(`@/${p}`);
        expect(typeof mod.default).toBe("function");
      });
    }
  });
});
