/**
 * 17 Nov, part 3 -- the schema audit page. Its "Hallucinated" KPI counted every FAQPage that had questions
 * (lib/schema-audit/validate-blocks.ts marked them "danger"), but nothing compares a block with the page's text;
 * the header said "Reality-checked against your actual website content", which nothing does; and "Total
 * schemas" counted one block per crawled page, so a sitewide Organization block counted up to 20 times.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { schemaKpis } from "@/app/(auth)/brands/[brandId]/schema-audit/page";
import type { SchemaBlock } from "@/lib/schema-audit/extract";
import {
  distinctSchemaBlocks,
  validateDistinctSchemaBlocks,
  validateSchemaBlocks,
} from "@/lib/schema-audit/validate-blocks";

const ORG: SchemaBlock = {
  type: "Organization",
  attributes: { "@type": "Organization", name: "Acme Plumbing", url: "https://acme.com.au" },
  attributeCount: 2,
  hasEntityLinking: true,
};

const FAQ: SchemaBlock = {
  type: "FAQPage",
  attributes: {
    "@type": "FAQPage",
    mainEntity: [
      { "@type": "Question", name: "Do you do emergencies?" },
      { "@type": "Question", name: "Are you licensed?" },
    ],
  },
  attributeCount: 1,
  hasEntityLinking: false,
};

describe("validate-blocks: an FAQ block is a reminder to check, not a 'hallucination'", () => {
  it("marks it a warning (never danger) and says nothing compares it with the page", () => {
    const [faq] = validateSchemaBlocks([FAQ]);
    expect(faq.status).toBe("warning");
    expect(faq.issues.join(" ")).toContain("2 FAQ questions in the schema.");
    expect(faq.issues.join(" ")).toContain("We don't compare them with your page's text");
    expect(faq.issues.join(" ")).not.toMatch(/hallucination/i);
  });
});

describe("distinct blocks: a sitewide block is one block, with the pages it's on", () => {
  it("the same Organization block on 3 pages is 1 block on 3 pages", () => {
    const found = ["/", "/about", "/contact"].map((p) => ({
      block: ORG,
      pageUrl: `https://acme.com.au${p}`,
    }));
    expect(distinctSchemaBlocks(found)).toEqual([{ block: ORG, pageCount: 3 }]);
    const [validated] = validateDistinctSchemaBlocks([
      ...found,
      { block: FAQ, pageUrl: "https://acme.com.au/faq" },
    ]);
    expect(validated.pageCount).toBe(3);
  });

  it("the same block twice on one page counts that page once", () => {
    const found = [
      { block: ORG, pageUrl: "https://acme.com.au/" },
      { block: ORG, pageUrl: "https://acme.com.au/" },
    ];
    expect(distinctSchemaBlocks(found)[0].pageCount).toBe(1);
  });
});

describe("the schema page's counts (schemaKpis)", () => {
  it("an audit that stored distinct blocks: 'Distinct schema blocks', and the FAQ reminder is 'to review'", () => {
    const blocks = validateDistinctSchemaBlocks([
      { block: ORG, pageUrl: "https://acme.com.au/" },
      { block: ORG, pageUrl: "https://acme.com.au/about" },
      { block: FAQ, pageUrl: "https://acme.com.au/faq" },
    ]);
    const kpis = schemaKpis({
      typesFound: ["Organization", "FAQPage"],
      richness: 4,
      realityCheck: {},
      blocks,
    });
    expect(kpis.blocksLabel).toBe("Distinct schema blocks");
    expect(kpis.blocks).toBe(2);
    expect(kpis.toReview).toBe(2); // ORG has < 5 attributes; FAQ is the check reminder
    expect(kpis.typesFound).toBe(2);
  });

  it("an older audit (one block per page, 'danger' FAQ): labelled as counted per page, danger counted as to review", () => {
    const legacyBlocks = [
      { ...validateSchemaBlocks([ORG])[0] },
      { ...validateSchemaBlocks([ORG])[0] },
      { ...validateSchemaBlocks([FAQ])[0], status: "danger" as const },
    ];
    const kpis = schemaKpis({
      typesFound: ["Organization", "FAQPage"],
      richness: 4,
      realityCheck: {},
      blocks: legacyBlocks,
    });
    expect(kpis.blocksLabel).toBe("Blocks found (counted per page)");
    expect(kpis.blocks).toBe(3);
    expect(kpis.toReview).toBe(3);
  });

  it("an audit with no schema findings: every count is not measured (null), never 0", () => {
    expect(schemaKpis(undefined)).toEqual({
      blocksLabel: "Blocks found (counted per page)",
      blocks: null,
      valid: null,
      toReview: null,
      typesFound: null,
    });
  });
});

describe("the schema page's copy", () => {
  const src = readFileSync("app/(auth)/brands/[brandId]/schema-audit/page.tsx", "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");

  it("has no 'Hallucinated' KPI and no 'Reality-checked against your actual website content'", () => {
    expect(code).not.toMatch(/Hallucinated/);
    expect(code).not.toMatch(/Reality-checked against your actual website/);
    expect(code).toMatch(/We don&apos;t check it against your pages&apos;\s+text/);
  });

  it("a type the audit didn't store is 'Not checked', never a red 'Missing' (it read `?? false`)", () => {
    expect(code).not.toMatch(/\.some\(\(t\) => t\.includes\(type\)\) \?\? false/);
    expect(code).toMatch(/schema: not checked/);
  });
});
