/**
 * S01 parts 7-8 (LLD 8.1.2, 8.1.7, N14, N15, contract P09): the PDF by tier.
 * - Basic: today's pages (N15). The only allowed difference here is the method page's question mix line.
 * - Standard: Diagnosis becomes "Why, and what to do next" (findings, then the groups); the Over time page loses the
 *   prioritised list; every other page keeps its text and figures (N14: only additions).
 * - Enhanced: Standard plus "Beyond AI answers" (five tiles, the footer sentence) and the method page's checks row.
 * - TechCore-shaped (0%): findings g-j and a non-empty "What to do next".
 * - A Basic or Standard PDF never names another tier, "upgrade", a price or a plan.
 *
 * Fixtures: reportDataFixture("39") stands in for Hero #54 and reportDataFixture("37") for Omega #55 (no production
 * answers are copied into the repo); the TechCore #52 shape is the #39 fixture at 0 of 40 with part 3's evidence.
 */
import { describe, expect, it } from "vitest";
import { ReportDocument } from "@/lib/communication/pdf-builder";
import { type BeyondAiRaw, buildBeyondAiAnswers } from "@/lib/reports/beyond-ai";
import type { WhatToDoNext } from "@/lib/reports/report-contents";
import type { ReportData } from "@/lib/reports/report-data";
import type { ReportDataV2, ReportV2 } from "@/lib/reports/report-snapshot";
import { DEFAULT_TIER_NAMES, pagesForTier, type ReportTier } from "@/lib/reports/report-tiers";
import { collectPdfPages } from "@/tests/helpers/pdf-text";
import { reportDataFixture } from "@/tests/helpers/report-data-fixture";

const NEXT: WhatToDoNext = {
  measured: [
    {
      key: "finding:a",
      actionItemId: "11111111-1111-4111-8111-111111111111",
      title: "Link your hipages and Localsearch profiles",
      evidence: "hipages cited in 9 of 40 answers · audit #39",
      priority: "high",
      status: "open",
      included: true,
      note: "We'll set these up this week.",
    },
    {
      key: "finding:hidden",
      actionItemId: "22222222-2222-4222-8222-222222222222",
      title: "A hidden action",
      evidence: "x · audit #39",
      priority: "medium",
      status: "open",
      included: false,
      note: null,
    },
  ],
  agencyActions: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      title: "Ask five clients for reviews",
      detail: null,
      priority: "high",
      status: "open",
      position: 0,
    },
  ],
  doneSinceLast: [
    { title: "Claim your Google Business Profile", doneAt: "2026-10-28T00:00:00.000Z" },
  ],
  generalAdvice: [{ title: "Post on LinkedIn", evidence: "LinkedIn was cited in 9 of 40 answers" }],
  includeGeneralAdvice: true,
  includeDoneSinceLast: true,
  curated: true,
};

const BEYOND_RAW: BeyondAiRaw = {
  brand: { abn: "17701710947", youtubeChannelUrl: null, domain: "omega.example.com.au" },
  entity: {
    abnVerified: true,
    abnNumber: "17701710947",
    abnEntityName: "ASTORIO GROUP PTY LTD",
    abnStatus: "Active",
    wikipediaAuPresent: false,
    auTldDomains: ["omega.example.com.au"],
    checkedAt: new Date("2026-10-30T00:00:00Z"),
  },
  youtube: null,
  youtubeGateOn: true,
  technical: {
    scoreComposite: "40.00",
    findings: {
      scoringVersion: 4,
      robots: {
        aiBotsAllowed: ["OAI-SearchBot", "Claude-SearchBot", "PerplexityBot", "Googlebot"],
        aiBotsBlocked: [],
      },
    },
    createdAt: new Date("2026-10-31T00:00:00Z"),
    dims: { scoreSchema: "4.00", scoreMeta: "6.00" },
  },
  visits: [],
  directories: {
    basisAuditId: "a39",
    linked: 1,
    cited: 2,
    items: [
      { name: "hipages", linked: false, citedIn: 9 },
      { name: "Yellow Pages", linked: true, citedIn: 5 },
    ],
  },
};

function withTier(data: ReportData, tier: ReportTier, next: WhatToDoNext = NEXT): ReportDataV2 {
  const v2: ReportV2 = {
    tier,
    tierLabel: DEFAULT_TIER_NAMES[tier],
    coverTierName: null,
    sections: pagesForTier(tier),
    whatToDoNext: tier === "basic" ? null : next,
    beyondAi:
      tier === "enhanced" ? buildBeyondAiAnswers(BEYOND_RAW, new Date(data.generatedAt)) : null,
    agencyName: "Splice Marketing",
    questionMix: {
      everyday: data.questions.everyday,
      branded: data.questions.branded,
      bySource: { original: data.questions.everyday },
    },
  };
  return { ...data, v2 };
}

const pages = (data: ReportData) => collectPdfPages(<ReportDocument data={data} />);
const text = (data: ReportData) => pages(data).flat().join("\n");
const MIX = (d: ReportData) =>
  `${d.questions.everyday + d.questions.branded} questions: ${d.questions.everyday} everyday (${d.questions.everyday} AI-suggested) and ${d.questions.branded} that name the business.`;

function techCore(): ReportData {
  const d = reportDataFixture("39");
  return {
    ...d,
    brand: { ...d.brand, name: "TechCore IT" },
    mentionedCount: 0,
    directories: {
      ...d.directories,
      rows: [
        ...d.directories.rows,
        {
          key: "local_business_guide",
          name: "Local Business Guide",
          citedCount: 14,
          ownerProfileLinked: false,
          ownerProfileCitedCount: 0,
          ownerStatus: null,
          kind: "general",
          relevantToBrand: false,
        },
      ],
    },
    lowVisibility: {
      brandName: "TechCore IT",
      everydayAnswers: 40,
      answersCitingOtherBusinesses: 27,
      businessSites: [
        { domain: "kangaroo-it.com.au", answers: 27 },
        { domain: "crystaltec.com.au", answers: 6 },
        { domain: "suretech.com.au", answers: 5 },
      ],
      couldNotFind: [
        {
          engine: "claude",
          engineName: "Claude",
          question: "Is TechCore IT a good choice for managed IT services in Riverstone, NSW?",
          quote:
            "I was unable to find any verified information about a company specifically called TechCoreIT in Riverstone.",
        },
      ],
      identity: {
        abn: null,
        abnVerified: false,
        abnStatus: null,
        checkedAt: null,
        gbpLinked: false,
        abrCitedBy: ["ChatGPT"],
      },
    },
  } as ReportData;
}

describe.each([
  ["Hero #54 (fixture #39)", "39"],
  ["Omega #55 (fixture #37)", "37"],
] as const)("N15: a Basic report is today's report -- %s", (_name, basis) => {
  it("every page's text is today's; the method page adds only the question mix line", () => {
    const today = pages(reportDataFixture(basis));
    const basic = pages(withTier(reportDataFixture(basis), "basic"));
    expect(basic.length).toBe(today.length);
    const mix = MIX(reportDataFixture(basis));
    basic.forEach((page, i) => {
      const added = page.filter((line) => !today[i].includes(line));
      const removed = today[i].filter((line) => !page.includes(line));
      expect(removed, `page ${i + 1}`).toEqual([]);
      expect(
        added.filter((l) => l !== "Questions asked" && l !== mix),
        `page ${i + 1}`,
      ).toEqual([]);
    });
    expect(basic.flat()).toContain(mix);
  });
});

describe("Standard and Enhanced (N14: unchanged pages keep their text and figures)", () => {
  it("cover, summary, engines, directories: identical to today's", () => {
    const today = pages(reportDataFixture("39"));
    const enhanced = pages(withTier(reportDataFixture("39"), "enhanced"));
    const diagnosisAt = today.findIndex((p) => p.some((l) => l.includes("· Diagnosis")));
    expect(diagnosisAt).toBeGreaterThan(0);
    // The page count in each footer grows by the added pages; nothing else on these pages changes.
    const footer = (page: string[]) => page.map((l) => l.replace(/^Page (\d+) of \d+$/, "Page $1"));
    for (let i = 0; i < diagnosisAt; i += 1)
      expect(footer(enhanced[i]), `page ${i + 1}`).toEqual(footer(today[i]));
  });

  it("'Why, and what to do next' replaces Diagnosis: findings first, then the groups; hidden actions left out", () => {
    const all = text(withTier(reportDataFixture("39"), "standard"));
    expect(all).not.toContain("· Diagnosis");
    expect(all).toContain("Why, and what to do next");
    expect(all).toContain("What we found, and what to do next");
    expect(all).toContain(
      "Each action shows the evidence from this audit. Notes and actions from Splice Marketing are labelled.",
    );
    expect(all).toContain("MEASURED ACTIONS");
    expect(all).toContain("Link your hipages and Localsearch profiles");
    expect(all).toContain("hipages cited in 9 of 40 answers · audit #39");
    expect(all).toContain("Note from Splice Marketing: We'll set these up this week.");
    expect(all).toContain("RECOMMENDED BY SPLICE MARKETING");
    expect(all).toContain("DONE SINCE THE LAST REPORT");
    expect(all).toContain("GENERAL ADVICE, NOT DRAWN FROM THIS AUDIT");
    expect(all).not.toContain("A hidden action");
    expect(all).not.toContain("No finding rule matched");
  });

  it("the Over time page loses the prioritised list (it moved into What to do next)", () => {
    expect(text(reportDataFixture("39"))).toContain("Prioritised by impact");
    expect(text(withTier(reportDataFixture("39"), "standard"))).not.toContain(
      "Prioritised by impact",
    );
    expect(text(withTier(reportDataFixture("39"), "basic"))).toContain("Prioritised by impact");
  });

  it("Enhanced adds Beyond AI answers after it, with five tiles, own dates and the footer; Standard doesn't", () => {
    const enhanced = pages(withTier(reportDataFixture("39"), "enhanced"));
    const nextAt = enhanced.findIndex((p) => p.some((l) => l.includes("Why, and what to do next")));
    const beyond = enhanced[nextAt + 1].join("\n");
    expect(beyond).toContain("Beyond AI answers");
    expect(beyond).toContain("What AI can read about you elsewhere");
    for (const label of [
      "Business identity",
      "YouTube",
      "AI crawlers",
      "Website technical",
      "Your directory profiles",
    ]) {
      expect(beyond).toContain(label);
    }
    expect(beyond).toContain(
      "These checks are separate from the Visibility score and don't change it.",
    );
    expect(beyond).toContain("Linked 1 of 2 directories AI cites for your questions.");
    expect(beyond).toContain("checked 31 Oct 2026 · v4 scoring");
    expect(text(withTier(reportDataFixture("39"), "standard"))).not.toContain(
      "What AI can read about you elsewhere",
    );
  });

  it("the method page: the mix line in every tier; the checks row only in Enhanced", () => {
    const standard = text(withTier(reportDataFixture("39"), "standard"));
    const enhanced = text(withTier(reportDataFixture("39"), "enhanced"));
    expect(standard).toContain(MIX(reportDataFixture("39")));
    expect(standard).not.toContain("Checks outside AI answers");
    expect(enhanced).toContain("Checks outside AI answers");
    expect(enhanced).toMatch(
      /identity 30 Oct 2026 · YouTube not linked · crawlers 31 Oct 2026 · technical 31 Oct 2026/,
    );
  });

  it("sections are numbered in order with the new pages", () => {
    const all = text(withTier(reportDataFixture("39"), "enhanced"));
    const eyebrows = [...all.matchAll(/^(\d\d) · /gm)].map((m) => m[1]);
    expect(eyebrows).toEqual([...eyebrows].sort());
  });
});

describe("TechCore #52 shape (0 of 40)", () => {
  it("findings g, h, i, j on the page and a non-empty What to do next", () => {
    const all = text(withTier(techCore(), "enhanced"));
    expect(all).toContain("kangaroo-it.com.au (27 answers)");
    expect(all).toContain(
      "I was unable to find any verified information about a company specifically called TechCoreIT",
    );
    expect(all).toContain("Local Business Guide");
    expect(all).toMatch(/identity isn.t verified yet/i);
    expect(all).toContain("MEASURED ACTIONS");
    expect(all).not.toContain("No finding rule matched");
  });
});

describe("no upsell inside a PDF", () => {
  it.each([
    "basic",
    "standard",
  ] as const)("a %s PDF never names another tier, upgrade, a price or a plan", (tier) => {
    const all = text(withTier(reportDataFixture("39"), tier));
    const others = (["basic", "standard", "enhanced"] as const)
      .filter((t) => t !== tier)
      .map((t) => DEFAULT_TIER_NAMES[t]);
    for (const word of [
      ...others,
      "Upgrade",
      "upgrade",
      "Growth plan",
      "Agency plan",
      "Agency Pro",
      "Enterprise",
      "$",
    ]) {
      expect(all, word).not.toContain(word);
    }
  });
});
