/**
 * 16 Nov, part 3 -- no tradie wording outside the trades. A café or an accountant was told to quote "Master Plumbers
 * AU", cite "WaterNSW, ABS building permits", post in "r/homeimprovement" and answer "What is your call-out fee?";
 * the PDF's glossary said "e.g. hipages" to everyone; the brand header said "tradies"; the wizard previewed plumber
 * questions; and the llms.txt preview fell back to the tradie template. Guard: none of that copy says a trade word for
 * a business that isn't a trade.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { generateLlmsTxt } from "@/app/(auth)/brands/[brandId]/llms-txt-generator/llms-txt-preview";
import { brandBusinessLabel } from "@/lib/brands/business-label";
import { ReportDocument } from "@/lib/communication/pdf-builder";
import { CATEGORY_KEYS } from "@/lib/prompts/templates";
import { wizardPreviewQuestions } from "@/lib/prompts/wizard-preview";
import { businessExamples } from "@/lib/recommendations/business-examples";
import { ENTITY_PROFILES_TITLE } from "@/lib/recommendations/entity-profiles";
import { universalRuleCopy } from "@/lib/recommendations/triggers";
import type { TriggerContext } from "@/lib/recommendations/types";
import { collectPdfPages } from "@/tests/helpers/pdf-text";
import { reportDataFixture } from "@/tests/helpers/report-data-fixture";

const TRADE_WORDS =
  /plumb|electrician|tradie|call-?out|hipages|serviceseeking|oneflare|airtasker|master (plumbers|builders|electricians)|\bHIA\b|waternsw|building (permits|approvals)|homeimprovement|ausrenovation|trade (directories|publication)/i;
const TRADES = ["trades_plumbing", "trades_electrical", "trades_building", "trades_general"];
const NOT_TRADES = CATEGORY_KEYS.filter((k) => !TRADES.includes(k));

function ctx(categories: string[], vertical = "tradies"): TriggerContext {
  return {
    scoreFrequency: "10",
    scoreSentimentNumeric: null,
    scoreContextNumeric: "10",
    scoreComposite: "10",
    confidenceIntervals: null,
    vertical,
    categories,
    mentionDetail: null,
  };
}

describe("recommendations give examples for the brand's own business type", () => {
  it.each(NOT_TRADES)("%s: no rule's title or advice says a trade word", (category) => {
    // Even a brand whose vertical says tradies: its confirmed type decides.
    for (const rule of universalRuleCopy(ctx([category]))) {
      expect(`${rule.title} ${rule.action}`, `${category} / ${rule.key}`).not.toMatch(TRADE_WORDS);
    }
  });

  it("the trades keep theirs: a plumber's industry body is Master Plumbers, its FAQ the call-out fee", () => {
    const copy = universalRuleCopy(ctx(["trades_plumbing"]));
    const by = (key: string) => copy.find((r) => r.key === key)?.action ?? "";
    expect(by("expert-quotes")).toContain("Master Plumbers");
    expect(by("faq-content")).toContain("call-out fee");
    expect(by("reddit-absence")).toContain("r/AusRenovation");
  });

  it("names a real peak body for each new local type, and none it can't name", () => {
    expect(businessExamples(["cafe"]).industryBody).toBe("Restaurant & Catering Australia");
    expect(businessExamples(["fitness_gym"]).industryBody).toBe("AUSactive");
    expect(businessExamples(["retail_shop"]).industryBody).toBe(
      "the Australian Retailers Association",
    );
    expect(businessExamples(["accounting_practice"]).industryBody).toBe("CPA Australia or CA ANZ");
    expect(businessExamples(["accounting_practice"]).subreddits).toContain("r/AusFinance");
    expect(businessExamples(["general"]).industryBody).toBe("your industry's peak body");
    expect(businessExamples(["cafe"]).faq).toContain("opening hours");
  });

  it("an unconfirmed brand goes by its vertical, and an unknown one gets no trade example", () => {
    expect(businessExamples([], "tradies").industryBody).toContain("Master Builders");
    expect(JSON.stringify(businessExamples([], "local_business"))).not.toMatch(TRADE_WORDS);
  });

  it("the profiles recommendation says directories, not trade directories", () => {
    expect(ENTITY_PROFILES_TITLE).not.toMatch(TRADE_WORDS);
  });
});

describe("the brand header says the confirmed business type", () => {
  it("'Café', not the vertical; and before confirmation, the vertical in words", () => {
    const at = "2026-11-16T00:00:00.000Z";
    expect(
      brandBusinessLabel({ vertical: "tradies", categories: ["cafe"], categoryConfirmedAt: at }),
    ).toBe("Café");
    expect(
      brandBusinessLabel({
        vertical: "tradies",
        categories: ["cafe", "retail_shop"],
        categoryConfirmedAt: at,
      }),
    ).toBe("Café · Local shop");
    expect(
      brandBusinessLabel({ vertical: "allied_health", categories: [], categoryConfirmedAt: null }),
    ).toBe("Allied health");
    expect(
      brandBusinessLabel({ vertical: "tradies", categories: ["cafe"], categoryConfirmedAt: null }),
    ).toBe("Tradies");
  });
});

describe("the wizard previews questions for what the owner picked", () => {
  it("never a plumber's for another vertical, and the owner's suburb once it's in", () => {
    for (const vertical of ["allied_health", "saas", "professional_services", "real_estate"]) {
      const questions = wizardPreviewQuestions(vertical, "NSW:Parramatta");
      expect(questions.length, vertical).toBeGreaterThan(0);
      for (const q of questions) expect(q, `${vertical}: ${q}`).not.toMatch(TRADE_WORDS);
    }
    const allied = wizardPreviewQuestions("allied_health", "NSW:Parramatta");
    expect(allied.some((q) => q.includes("Parramatta"))).toBe(true);
    expect(wizardPreviewQuestions("allied_health", "").join(" ")).toContain("your suburb");
    expect(wizardPreviewQuestions("allied_health", "").join(" ")).not.toContain("Sydney CBD");
    expect(wizardPreviewQuestions("unknown", "NSW:Parramatta")).toEqual([]);
  });
});

describe("the PDF's glossary", () => {
  it("gives one of the brand's own directories as its example, and none when it has no list", () => {
    const base = reportDataFixture("39");
    const glossary = (rows: typeof base.directories.rows) =>
      collectPdfPages(
        ReportDocument({ data: { ...base, directories: { ...base.directories, rows } } }),
      )
        .flat()
        .join("\n");
    const local = base.directories.rows.filter((r) => r.key !== "hipages");
    expect(glossary(local)).toContain("(e.g. Word of Mouth)");
    expect(glossary(local)).not.toMatch(/hipages/);
    expect(glossary([])).toContain("An answer that links a directory page.");
  });
});

describe("the llms.txt preview", () => {
  it("gives a non-trade business no tradie template", () => {
    for (const vertical of ["professional_services", "real_estate", "local_business"]) {
      expect(
        generateLlmsTxt("Harbour Bean", "harbourbean.com.au", vertical, "Parramatta"),
      ).not.toMatch(TRADE_WORDS);
    }
  });
});

describe("guard: copy every business sees holds no trade word", () => {
  /** The PDF, the report's text, the recommendation rules and profiles advice, the emails, the wizard preview. */
  const UNIVERSAL_COPY = [
    "lib/reports/pdf/report-document.tsx",
    "lib/reports/report-format.ts",
    "lib/reports/report-findings.ts",
    "lib/recommendations/triggers.ts",
    "lib/recommendations/entity-profiles.ts",
    "lib/email/templates/layout.ts",
    "lib/email/templates/audit-complete.ts",
    "components/domain/vertical/prompt-preview.tsx",
    "lib/prompts/wizard-preview.ts",
  ];
  // (lib/brands/business-label.ts names "Tradies" -- the tradies vertical's own label; its test is above.)

  it.each(UNIVERSAL_COPY)("%s: no string literal names a trade", (file) => {
    const code = readFileSync(join(process.cwd(), file), "utf-8");
    const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const found: string[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node) ||
        ts.isJsxText(node)
      ) {
        if (TRADE_WORDS.test(node.text)) found.push(node.text.trim().slice(0, 100));
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect(found).toEqual([]);
  });
});
