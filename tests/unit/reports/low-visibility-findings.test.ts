/**
 * S01 part 3 (LLD 8.1.5, T5): finding rules g-j for low or zero visibility, on a fixture shaped like TechCore IT's
 * audit #52 (0 of 40 everyday answers; the answers themselves are production data, not in the repo, so the shape is
 * rebuilt as S00 did: four engines, ten everyday questions each, three questions that name the business). Hero-like
 * data (named in a third of answers, ABN verified, Google Business Profile linked) gets none of them, and rule h never
 * reads an answer to an everyday question.
 */
import { describe, expect, it } from "vitest";
import {
  countLowVisibilityEvidence,
  type LowVisibilityAnswer,
  type LowVisibilityData,
  type LowVisibilityEvidence,
  lowVisibilityFindings,
  otherBusinessSite,
} from "@/lib/reports/low-visibility-findings";
import type { FindingsData, ReportEngineRow } from "@/lib/reports/report-data";
import { reportFindings } from "@/lib/reports/report-findings";

const ENGINES: Array<[string, string]> = [
  ["chatgpt", "ChatGPT"],
  ["claude", "Claude"],
  ["gemini", "Gemini"],
  ["perplexity", "Perplexity"],
];
const src = (url: string) => ({ domain: new URL(url).hostname.replace(/^www\./, ""), url });

/** #52's shape: 40 everyday answers; other IT providers' own sites cited in 24 of them; three branded questions. */
function techCoreAnswers(): LowVisibilityAnswer[] {
  const answers: LowVisibilityAnswer[] = [];
  for (const [engine, engineName] of ENGINES) {
    for (let q = 0; q < 10; q += 1) {
      const sources = [src("https://www.localbusinessguide.com.au/nsw/it-support")];
      if (q < 9 && engine !== "perplexity")
        sources.push(src(`https://kangaroo-it.com.au/managed-it-${q}`));
      if (q < 6 && engine === "chatgpt")
        sources.push(src("https://www.crystaltec.com.au/services"));
      if (q < 5 && engine === "claude") sources.push(src("https://suretech.com.au/"));
      if (q === 0 && engine === "chatgpt")
        sources.push(src("https://abr.business.gov.au/ABN/View?abn=17701710947"));
      if (q === 1)
        sources.push(
          src("https://www.facebook.com/someprovider"),
          src("https://www.google.com/maps/place/x"),
        );
      if (q === 2) sources.push(src("https://www.techcoreit.com.au/"));
      answers.push({
        engine,
        engineName,
        prompt: `Best managed IT services provider in Western Sydney? (${q})`,
        organic: true,
        citedSources: sources,
        // An everyday answer that happens to contain a C1 phrase: rule h must ignore it.
        responseText:
          q === 3
            ? "You may be referring to managed services in general."
            : "Here are some providers.",
      });
    }
  }
  answers.push(
    {
      engine: "claude",
      engineName: "Claude",
      prompt: "Is TechCore IT a good choice for managed IT services in Riverstone, NSW?",
      organic: false,
      citedSources: [],
      responseText:
        "I need to be upfront with you. I was unable to find any verified information about a company specifically called TechCoreIT in Riverstone. Ask for references.",
    },
    {
      engine: "chatgpt",
      engineName: "ChatGPT",
      prompt: "What do customers say about TechCore IT?",
      organic: false,
      citedSources: [src("https://abr.business.gov.au/ABN/View?abn=17701710947")],
      responseText: "TechCore IT is listed on the ABR as a business name of Astorio Group Pty Ltd.",
    },
  );
  return answers;
}

const engineRow = (engine: string, name: string, mentioned: number): ReportEngineRow => ({
  engine,
  name,
  sampleCount: 10,
  mentionedCount: mentioned,
  failedEverydayCount: 0,
  failedCount: 0,
  fullyFailed: false,
  failureReason: null,
  models: [],
});

const dirRow = (name: string, citedCount: number, relevantToBrand: boolean, linked = false) => ({
  key: name.toLowerCase().replace(/\s+/g, "_"),
  name,
  citedCount,
  ownerProfileLinked: linked,
  ownerProfileCitedCount: 0,
  ownerStatus: null,
  suggestedProfileUrl: null,
  kind: "general" as const,
  relevantToBrand,
});

function findingsData(mentioned: number, rows: ReturnType<typeof dirRow>[]): FindingsData {
  return {
    basis: { auditNumber: 52 },
    engines: ENGINES.map(([e, n]) => engineRow(e, n, mentioned)),
    coverage: { enginesPlanned: 4, enginesAnswered: 4, label: "4 of 4 engines", note: null },
    questions: { everyday: 10, branded: 3, perEngine: 13 },
    directories: { totalAnswers: 40, rows },
    sources: { totalAnswers: 40, reddit: 0 },
    sampleCount: 40,
    mentionedCount: mentioned * 4,
    rankedCount: 0,
    medianPosition: null,
    sourcedCount: 0,
    competitors: { rows: [] },
  } as unknown as FindingsData;
}

const TECHCORE_DIRECTORIES = [
  dirRow("Local Business Guide", 40, false),
  dirRow("Cylex", 2, false),
  dirRow("LinkedIn", 2, false),
  dirRow("Directso", 1, false),
  dirRow("Whereis", 1, false),
  dirRow("Yellow Pages", 0, true),
];

function techCore(): LowVisibilityData {
  const counted = countLowVisibilityEvidence(techCoreAnswers(), "techcoreit.com.au");
  const lowVisibility: LowVisibilityEvidence = {
    brandName: "TechCore IT",
    everydayAnswers: counted.everydayAnswers,
    answersCitingOtherBusinesses: counted.answersCitingOtherBusinesses,
    businessSites: counted.businessSites,
    couldNotFind: counted.couldNotFind,
    identity: {
      abn: null,
      abnVerified: false,
      abnStatus: null,
      checkedAt: null,
      gbpLinked: false,
      abrCitedBy: counted.abrCitedBy,
    },
  };
  return { ...findingsData(0, TECHCORE_DIRECTORIES), lowVisibility };
}

describe("the evidence rules g-j read", () => {
  it("counts other businesses' own sites by answer, the couldn't-find quotes and who cited the ABR", () => {
    const counted = countLowVisibilityEvidence(techCoreAnswers(), "techcoreit.com.au");
    expect(counted.everydayAnswers).toBe(40);
    expect(counted.answersCitingOtherBusinesses).toBe(27);
    expect(counted.businessSites.slice(0, 3)).toEqual([
      { domain: "kangaroo-it.com.au", answers: 27 },
      { domain: "crystaltec.com.au", answers: 6 },
      { domain: "suretech.com.au", answers: 5 },
    ]);
    expect(counted.couldNotFind).toEqual([
      {
        engine: "claude",
        engineName: "Claude",
        question: "Is TechCore IT a good choice for managed IT services in Riverstone, NSW?",
        quote:
          "I was unable to find any verified information about a company specifically called TechCoreIT in Riverstone.",
      },
    ]);
    expect(counted.abrCitedBy).toEqual(["ChatGPT"]);
  });

  it("a business site is never the brand's own, a directory, social, maps, Reddit, a government site or a redirect", () => {
    const own = "techcoreit.com.au";
    expect(otherBusinessSite("kangaroo-it.com.au", "https://kangaroo-it.com.au/x", own)).toBe(
      "kangaroo-it.com.au",
    );
    for (const url of [
      "https://www.techcoreit.com.au/about",
      "https://www.yellowpages.com.au/nsw/x",
      "https://www.localbusinessguide.com.au/x",
      "https://www.linkedin.com/company/techcore-it",
      "https://www.facebook.com/x",
      "https://www.instagram.com/x",
      "https://www.google.com/maps/place/x",
      "https://www.reddit.com/r/sydney/x",
      "https://abr.business.gov.au/ABN/View?abn=1",
      "https://www.service.nsw.gov.au/x",
      "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc",
      "https://en.wikipedia.org/wiki/IT",
    ]) {
      expect(otherBusinessSite(new URL(url).hostname, url, own), url).toBeNull();
    }
  });
});

describe("TechCore IT #52's shape: findings g, h, i and j, with their evidence", () => {
  it("lists g, h, i, j in that order", () => {
    expect(lowVisibilityFindings(techCore()).map((f) => f.rule)).toEqual(["g", "h", "i", "j"]);
  });

  it("g: the business sites AI cited most", () => {
    const g = lowVisibilityFindings(techCore()).find((f) => f.rule === "g");
    expect(g?.explanation).toBe(
      "AI named you in 0 of 40 everyday answers, and 27 of 40 cited other businesses' own sites: the sites it cited most were kangaroo-it.com.au (27 answers), crystaltec.com.au (6) and suretech.com.au (5).",
    );
    expect(g?.evidence.map((line) => line.map((p) => p.text).join(""))).toEqual([
      "kangaroo-it.com.au → cited in 27 of 40 answers",
      "crystaltec.com.au → cited in 6 of 40 answers",
      "suretech.com.au → cited in 5 of 40 answers",
    ]);
    expect(g?.recommendation.title).toBe("See why AI recommends other providers");
  });

  it("h: the engine's own sentence, with the question", () => {
    const h = lowVisibilityFindings(techCore()).find((f) => f.rule === "h");
    expect(h?.title).toBe("Claude couldn't find information about TechCore IT");
    expect(h?.evidence[0].map((p) => p.text).join("")).toBe(
      "Claude → “I was unable to find any verified information about a company specifically called TechCoreIT in Riverstone.” · asked “Is TechCore IT a good choice for managed IT services in Riverstone, NSW?”",
    );
  });

  it("i: directories beyond the brand's type, cited twice or more, with 'Your profile: Not linked yet'", () => {
    const i = lowVisibilityFindings(techCore()).find((f) => f.rule === "i");
    expect(i?.evidence.map((line) => line.map((p) => p.text).join(""))).toEqual([
      "Local Business Guide → cited in 40 of 40 answers · your profile: Not linked yet",
      "Cylex → cited in 2 of 40 answers · your profile: Not linked yet",
      "LinkedIn → cited in 2 of 40 answers · your profile: Not linked yet",
    ]);
  });

  it("j: no ABN on file, no Google Business Profile, and the engine that cited the ABR", () => {
    const j = lowVisibilityFindings(techCore()).find((f) => f.rule === "j");
    expect(j?.explanation).toBe(
      "Your ABN isn't verified yet; AI engines read the ABR (ChatGPT cited abr.business.gov.au), and no Google Business Profile is linked.",
    );
    expect(j?.evidence.map((line) => line.map((p) => p.text).join(""))).toEqual([
      "ABN → No ABN on file",
      "Google Business Profile → not linked yet",
      "abr.business.gov.au → cited by ChatGPT",
    ]);
  });

  it("every finding has a recommendation with a reason, and is measured (no agency colours)", () => {
    for (const f of lowVisibilityFindings(techCore())) {
      expect(f.recommendation.title.length).toBeGreaterThan(5);
      expect(f.recommendation.detail.length).toBeGreaterThan(10);
      expect(f.evidence.length).toBeGreaterThan(0);
    }
  });
});

describe("when a rule's condition doesn't hold", () => {
  it("Hero-like data (named in a third, ABN verified, profile linked, no cited-only directory) gets none", () => {
    const counted = countLowVisibilityEvidence(
      techCoreAnswers().filter((a) => a.organic),
      "herohomeservices.com.au",
    );
    const hero: LowVisibilityData = {
      ...findingsData(3, [dirRow("Yellow Pages", 17, true, true), dirRow("Hotfrog", 1, false)]),
      lowVisibility: {
        brandName: "Hero Home Services",
        everydayAnswers: counted.everydayAnswers,
        answersCitingOtherBusinesses: counted.answersCitingOtherBusinesses,
        businessSites: counted.businessSites,
        couldNotFind: counted.couldNotFind,
        identity: {
          abn: "17701710947",
          abnVerified: true,
          abnStatus: "Active",
          checkedAt: "2026-11-20T00:00:00Z",
          gbpLinked: true,
          abrCitedBy: [],
        },
      },
    };
    expect(lowVisibilityFindings(hero)).toEqual([]);
  });

  it("rule h never fires on answers to everyday questions", () => {
    const everydayOnly = techCoreAnswers().map((a) =>
      a.organic
        ? { ...a, responseText: "I could not find any information about this business." }
        : { ...a, responseText: "Fine." },
    );
    expect(countLowVisibilityEvidence(everydayOnly, "techcoreit.com.au").couldNotFind).toEqual([]);
  });

  it("without report_v2's evidence (flag off) there are no g-j findings, and a-f are exactly as before", () => {
    const base = findingsData(0, TECHCORE_DIRECTORIES);
    expect(lowVisibilityFindings(base)).toEqual([]);
    expect(reportFindings(base).map((f) => f.rule)).toEqual(
      reportFindings({ ...base }).map((f) => f.rule),
    );
    expect(reportFindings(base).some((f) => ["g", "h", "i", "j"].includes(f.rule))).toBe(false);
  });
});
