/**
 * 16 Nov, part 7 -- marketing claims are true. The landing page said "60 / 55 / 50 prompt templates" (matching
 * nothing in the product), the pack pages "8 sub-verticals" on every pack and checks that don't exist (licence and
 * AHPRA verification, an ASIC NAP check, HealthEngine and HotDoc presence, Xero/MYOB, STP, G2 and Capterra), the FAQ
 * "optimised for professional services. More verticals added regularly.", and the sample audit offered Professional
 * Services and Real Estate, which have no question pack. Every count now comes from the product's own data
 * (lib/marketing/vertical-facts.ts), and the guard below keeps written-in counts and those claims out of the copy.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { VerticalsSupported } from "@/components/domain/landing/verticals-supported";
import {
  answersPerAudit,
  exampleQuestion,
  INDUSTRIES_ANSWER,
  templateCount,
  verticalFacts,
  verticalTypes,
} from "@/lib/marketing/vertical-facts";
import { CATEGORY_TEMPLATES } from "@/lib/prompts/templates";
import { SAMPLE_AUDIT_VERTICALS } from "@/lib/sample-audit/verticals";
import { listFiles, readSourcesBeforeAll, sourceText } from "@/tests/helpers/source-files";

vi.mock("@/lib/sample-audit/rate-limit", () => ({
  checkSampleAuditRateLimit: vi.fn(async () => ({
    allowed: true,
    remaining: 5,
    retryAfterSeconds: 0,
  })),
}));

/** The copy that describes what the product does: the public site, the landing page, the pack library. */
const COPY_ROOTS = [
  "app/(marketing)",
  "components/domain/landing",
  "app/(auth)/verticals",
  "components/domain/vertical",
] as const;
const CODE = /\.(ts|tsx)$/;
const COUNT_IN_COPY = /\b\d+\+?\s*(prompt|question|template|answer)s?\b/i;
const COUNT_PROPERTY = /^(prompts|templates|questions|answers|subVerticals)$/;
const UNVERIFIED_CHECKS =
  /licen[cs]e verification|AHPRA|HealthEngine|HotDoc|ASIC|\bSTP\b|Capterra|\bG2\b|NDIS provider status|Medicare\/bulk-billing|More verticals added/i;
/** Written-in numbers that are an illustration, not a claim about the product, each with why. */
const ALLOWED = [
  {
    file: "app/(marketing)/methodology/page.tsx",
    text: "12 questions × 4 engines = 48",
    why: "explains how to read an audit's label, with example numbers",
  },
];

readSourcesBeforeAll(COPY_ROOTS, CODE);

function copyOf(file: string): Array<{ text: string; kind: "string" | "count-property" }> {
  const source = ts.createSourceFile(
    file,
    sourceText(file),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const out: Array<{ text: string; kind: "string" | "count-property" }> = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      out.push({ text: node.text.replace(/\s+/g, " "), kind: "string" });
    }
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      COUNT_PROPERTY.test(node.name.text) &&
      ts.isNumericLiteral(node.initializer)
    ) {
      out.push({ text: `${node.name.text}: ${node.initializer.text}`, kind: "count-property" });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

describe("guard: no written-in count or unverified check in the copy", () => {
  it("no copy names a number of prompts, questions, templates or answers, nor a count property", () => {
    const files = listFiles(COPY_ROOTS).filter((f) => CODE.test(f));
    expect(files.length).toBeGreaterThan(10);
    const found: string[] = [];
    for (const file of files) {
      for (const c of copyOf(file)) {
        const counted = c.kind === "count-property" || COUNT_IN_COPY.test(c.text);
        const allowed = ALLOWED.some((a) => a.file === file && c.text.includes(a.text));
        if (counted && !allowed) found.push(`${file}: ${c.text.trim().slice(0, 100)}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("no copy claims a check the product doesn't do", () => {
    const found: string[] = [];
    for (const file of listFiles(COPY_ROOTS).filter((f) => CODE.test(f))) {
      for (const c of copyOf(file))
        if (UNVERIFIED_CHECKS.test(c.text)) found.push(`${file}: ${c.text.trim().slice(0, 100)}`);
    }
    expect(found).toEqual([]);
    expect(INDUSTRIES_ANSWER).not.toMatch(UNVERIFIED_CHECKS);
  });

  it("the allowed numbers are still there, each with a reason", () => {
    for (const a of ALLOWED) {
      expect(a.why.length).toBeGreaterThan(20);
      expect(readFileSync(join(process.cwd(), a.file), "utf-8")).toContain(a.text);
    }
  });
});

describe("what the copy says comes from the product", () => {
  it("each landing card's template count is its types' real count, and its example a real template", () => {
    const html = renderToStaticMarkup(<VerticalsSupported />);
    for (const vertical of ["tradies", "allied_health", "local_business"]) {
      const count = templateCount(verticalTypes(vertical));
      expect(count, vertical).toBeGreaterThan(0);
      expect(html).toContain(`data-vertical-card="${vertical}"`);
      expect(html).toContain(`${count} question templates`);
    }
    // Every example is a template of its type, with a real place in it.
    const allTemplates = Object.values(CATEGORY_TEMPLATES).flatMap((m) => Object.values(m).flat());
    for (const [type, place] of [
      ["trades_plumbing", "Bondi"],
      ["allied_health_physio", "Fitzroy"],
      ["cafe", "Parramatta"],
    ] as const) {
      const example = exampleQuestion(type, place);
      expect(html).toContain(example.replace(/'/g, "&#x27;"));
      expect(
        allTemplates.some((t) => t.replace("{region}", place) === example),
        example,
      ).toBe(true);
    }
    expect(html).not.toMatch(/\b(60|55|50) (prompt|question) templates/);
  });

  it("the pack page's facts are computed: types, templates, local or national, and the directory list", () => {
    const tradies = verticalFacts("tradies").join(" ");
    expect(tradies).toContain("Plumbing");
    expect(tradies).toContain(
      `${templateCount(verticalTypes("tradies"))} everyday question templates`,
    );
    expect(tradies).toContain("suburb");
    expect(tradies).toContain("hipages");
    const saas = verticalFacts("saas").join(" ");
    expect(saas).toContain("national");
    expect(saas).toContain("No directory list");
    expect(verticalFacts("unknown")).toEqual([]);
  });

  it("the answer counts come from each plan's engines", () => {
    const a = answersPerAudit();
    expect(a.paidAnswers).toBe(a.paidEngines * 10);
    expect(a.freeAnswers).toBe(a.freeEngines * 10);
  });
});

describe("the sample audit offers only verticals with a question pack", () => {
  const SEEDED: Record<string, string> = {
    tradies: "db/seed/verticals/au-tradies.ts",
    allied_health: "db/seed/verticals/au-allied-health.ts",
    saas: "db/seed/verticals/au-saas.ts",
  };

  it("each offered vertical has a seeded pack; Professional Services and Real Estate (none) aren't offered", () => {
    for (const v of SAMPLE_AUDIT_VERTICALS) {
      const seed = SEEDED[v.value];
      expect(seed, v.value).toBeDefined();
      expect(readFileSync(join(process.cwd(), seed), "utf-8")).toMatch(/promptTemplate:/);
    }
    const offered = SAMPLE_AUDIT_VERTICALS.map((v) => v.value as string);
    expect(offered).not.toContain("professional_services");
    expect(offered).not.toContain("real_estate");
    const page = readFileSync(
      join(process.cwd(), "app/(marketing)/sample-audit/page.tsx"),
      "utf-8",
    );
    expect(page).not.toMatch(/value: "(professional_services|real_estate)"/);
  });

  it("POST /api/sample-audit refuses a vertical without a pack, before running anything", async () => {
    const { POST } = await import("@/app/api/sample-audit/route");
    const res = await POST(
      new Request("http://localhost/api/sample-audit", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
        body: JSON.stringify({
          domain: "example.com.au",
          vertical: "real_estate",
          location: { kind: "curated", value: "NSW:Parramatta" },
        }),
      }),
    );
    expect(res.status).toBe(400);
  }, 60_000);
});
