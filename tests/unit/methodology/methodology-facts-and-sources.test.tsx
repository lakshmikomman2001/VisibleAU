/**
 * 19 Nov (Sri's review of /methodology: "facts must match their sources"). Each source was re-opened that day
 * (lib/methodology/verified-citations.ts says what each one says):
 * - the spaces after bold labels and around {expressions}: production read "robots.txt.For", "outsidewithout",
 *   "(v2.2).Gemini" and "(v2.1).We". The cause: Next 16.2.6's SWC drops the leading space of a JSX text run that
 *   follows an element or an {expression}, runs onto another line and contains an HTML entity; vitest's compiler
 *   keeps it, so no test saw it. Checked here through Next's own SWC, over every page, and by the exact rule;
 * - the Gemini line says which model answers, with Google's date and its page; answer length in plain words;
 * - Ahrefs named as its post is, the study's engines said on the cards it backs, every source linked, the front-load
 *   figure as its primary source measured it, the intro's method count, no dimension tags;
 * - AI Crawler Access: Google-Extended a robots.txt setting, never a crawler, and the search and answer agents each
 *   company documents read alongside the training crawlers -- in the checker, CDN Shield and its tasks too;
 * - AI Discovery: the three /ai/ files are optional, read by no AI engine we know of, and lower no score;
 * - Google: an online-only business isn't checked, with the reason the audit shows.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GoogleAiMethodology } from "@/components/domain/google-ai/google-ai-methodology";
import { joinCrawlerAccess } from "@/lib/agent-analytics/cdn-shield-join";
import {
  AI_DISCOVERY_MAX,
  AI_DISCOVERY_WEIGHTS,
  AI_DISCOVERY_WEIGHTS_BY_VERSION,
  checkAiDiscovery,
  OPTIONAL_AI_FILES_LABEL,
} from "@/lib/ai-discovery/endpoints";
import { resolveGoogleLocation } from "@/lib/google-surfaces/location";
import { GOOGLE_ONLINE_ONLY_REASON, type PublicGoogleAi } from "@/lib/marketing/google-ai";
import { CITABILITY_METHODS, getMethodsData } from "@/lib/methodology/methods";
import { VERIFIED_CITATIONS } from "@/lib/methodology/verified-citations";
import { AI_CRAWLERS_CHECKED, VISITING_AI_CRAWLERS } from "@/lib/robots-txt/evaluate";
import { compositeMaxFor, TECHNICAL_AUDIT_MAX_SCORE } from "@/lib/technical-audit/score-aggregator";
import { listFiles } from "@/tests/helpers/source-files";

vi.mock("@/components/domain/google-ai/load-google-ai-claim", () => ({
  loadGoogleAiClaim: async () => null,
}));

const ON: PublicGoogleAi = {
  surfaces: ["google_ai_overviews", "google_ai_mode"],
  fromTier: "growth",
  fromPlan: "Growth",
  countedInScore: false,
  device: "desktop",
  queueMode: "standard",
};
const PUBLIC_ROOTS = [
  "app/(marketing)",
  "components/domain/landing",
  "components/domain/pricing",
  "components/domain/google-ai",
];

// Tags removed without a space: the spaces between words are the page's own, which is what's being checked.
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, "")
    .replace(/<\/(p|li|h[1-6]|div|section|ul)>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

let page = "";
beforeAll(async () => {
  const Page = (await import("@/app/(marketing)/methodology/page")).default;
  page = text(renderToStaticMarkup(await Page()));
}, 60_000);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("no word runs into the next on the page, as production compiles it", () => {
  /** A JSX text run that follows an element or {expression}, starts with a space, spans lines and has an entity. */
  function riskyRuns(file: string): string[] {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const hits: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
        const kids = node.children;
        for (let i = 1; i < kids.length; i++) {
          const child = kids[i];
          const prev = kids[i - 1];
          if (!child || !prev || !ts.isJsxText(child) || ts.isJsxText(prev)) continue;
          const raw = child.getFullText(sf);
          if (
            /^[ \t]+\S/.test(raw) &&
            raw.includes("\n") &&
            /&[a-zA-Z]+;|&#x?[0-9a-fA-F]+;/.test(raw)
          ) {
            hits.push(`${file}:${sf.getLineAndCharacterOfPosition(child.getStart(sf)).line + 1}`);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return hits;
  }

  it("no JSX text run anywhere in the app loses its space to SWC (the exact rule)", () => {
    const files = listFiles(["app", "components"]).filter(
      (f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"),
    );
    expect(files.length).toBeGreaterThan(100);
    expect(files.flatMap(riskyRuns)).toEqual([]);
  });

  it("the public pages, compiled by Next's own SWC, keep every space before a text run", async () => {
    const require = createRequire(join(process.cwd(), "package.json"));
    const swc = require("next/dist/build/swc") as {
      loadBindings: () => Promise<unknown>;
      transform: (code: string, options: Record<string, unknown>) => Promise<{ code: string }>;
    };
    await swc.loadBindings();
    const joins: string[] = [];
    for (const file of listFiles(PUBLIC_ROOTS).filter(
      (f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"),
    )) {
      const { code } = await swc.transform(readFileSync(join(process.cwd(), file), "utf8"), {
        filename: file,
        jsc: {
          parser: { syntax: "typescript", tsx: true },
          transform: { react: { runtime: "automatic" } },
          target: "es2022",
        },
      });
      // An element, then a text child starting with a letter; or text, an expression, then lowercase text.
      for (const m of code.matchAll(/\}\),\s*"([A-Za-z][^"]{0,30})/g))
        joins.push(`${file}: ${m[1]}`);
      for (const m of code.matchAll(
        /(?:"[^"]*",|\[)\s*[A-Za-z_][\w.]*(?:\([^()]*\))?,\s*"([a-z][^"]{0,30})/g,
      )) {
        joins.push(`${file}: ${m[1]}`);
      }
    }
    expect(joins).toEqual([]);
  }, 120_000);

  it("the four joins Sri saw read with their spaces", () => {
    expect(page).toContain("(v2.2). Gemini's answers");
    expect(page).toContain("(v2.1). We now find");
    expect(page).toContain("robots.txt. For each AI crawler");
    expect(page).toContain("can't be tested from outside without pretending to be it");
    expect(page).not.toMatch(/\.(Gemini|We now|For each)|outsidewithout/);
  });
});

describe("the Gemini line and the answer length", () => {
  it("says which model answers now, Google's date only with its page", () => {
    expect(page).toContain("Gemini's answers now come from Gemini 3.5 Flash-Lite");
    expect(page).toContain(
      "(Google lists 1 December 2026 as Gemini 2.5 Flash's shutdown date on its deprecations page)",
    );
    const source = readFileSync(
      join(process.cwd(), "app/(marketing)/methodology/page.tsx"),
      "utf8",
    );
    expect(source).toContain('"https://ai.google.dev/gemini-api/docs/deprecations"');
    expect(page).not.toContain("the replacement Google names for Gemini 2.5 Flash");
  });

  it("answer length in plain words, no token count", () => {
    expect(page).toContain("Answers aren't cut short");
    expect(page).not.toMatch(/8,192|tokens/);
  });
});

describe("the research: named as published, linked, and only what it measured", () => {
  it("Ahrefs' 75,000-brand study: its date and engines, never 'Q1-2026 AI Search Benchmark'", () => {
    expect(VERIFIED_CITATIONS.ahrefsBenchmark.name).toBe(
      "Ahrefs, 75,000 brands (Dec 2025; ChatGPT, AI Mode and AI Overviews)",
    );
    expect(page).toContain(VERIFIED_CITATIONS.ahrefsBenchmark.name);
    const shipped = listFiles(["app", "components", "lib", "db/seed"]).filter((f) =>
      /\.tsx?$/.test(f),
    );
    const stale = shipped.filter((f) =>
      /Q1-2026 AI Search Benchmark|75K brands/.test(readFileSync(join(process.cwd(), f), "utf8")),
    );
    expect(stale).toEqual([]);
  });

  it("the YouTube and branded-mentions cards say the study covered ChatGPT and Google, not the other three", () => {
    for (const id of ["youtube-presence", "brand-web-mentions"]) {
      const method = CITABILITY_METHODS.find((m) => m.id === id);
      expect(method?.description, id).toContain("not Claude, Gemini or Perplexity");
      expect(method?.description, id).toContain("ChatGPT and Google's AI answers");
    }
  });

  it("every Research Citations entry links to its source, and lists every source a method cites", () => {
    const listed = [...page.matchAll(/Research Citations(.*)$/g)][0]?.[1] ?? "";
    for (const c of Object.values(VERIFIED_CITATIONS)) {
      expect(listed, c.name).toContain(c.name);
      expect(c.url, c.name).toMatch(/^https:\/\//);
    }
    for (const m of CITABILITY_METHODS.filter((m) => m.citationUrl)) {
      expect(
        Object.values(VERIFIED_CITATIONS).map((c) => c.url),
        m.id,
      ).toContain(m.citationUrl);
    }
    expect(page).not.toMatch(/Zyppy|Leapd|businesswire/i);
  });

  it("the front-load card: what Kevin Indig's study measured (ChatGPT), never 'all LLM citations'", () => {
    const front = CITABILITY_METHODS.find((m) => m.id === "front-load-answers");
    expect(front?.description).toContain(
      "In 18,012 verified ChatGPT citations, 44.2% came from the first 30% of the cited page's text.",
    );
    expect(front?.description).not.toMatch(/all LLM/);
    expect(front?.effectSizeDelta).toBe("44.2% of ChatGPT citations");
    expect(front?.citationUrl).toBe(VERIFIED_CITATIONS.indigFrontLoad.url);
  });

  it("the intro counts the methods as they are, with how strong each one's evidence is", () => {
    const { top10, total } = getMethodsData();
    expect(page).toContain(
      `Below are ${top10.length} of our ${total} methods, each with how strong its evidence is`,
    );
    expect(page).not.toContain("highest-impact methods");
  });

  it("no method carries a dimension tag (four said 'Context', which is 'Not scored')", () => {
    for (const m of CITABILITY_METHODS) expect(Object.keys(m), m.id).not.toContain("dimension");
    expect(page).not.toMatch(/\bContext\b(?! aren't scored)/);
  });
});

describe("AI crawler access: Google-Extended is a setting, and each company's agents are read", () => {
  it("the agents each company documents, beside the training crawlers; Google-Extended a control token", () => {
    expect(AI_CRAWLERS_CHECKED.map((c) => c.crawler)).toEqual([
      "GPTBot",
      "OAI-SearchBot",
      "ChatGPT-User",
      "ClaudeBot",
      "Claude-SearchBot",
      "Claude-User",
      "Googlebot",
      "Google-Extended",
      "PerplexityBot",
      "Perplexity-User",
      // 20 Nov (part 2): Common Crawl's, from its own page.
      "CCBot",
    ]);
    expect(AI_CRAWLERS_CHECKED.find((c) => c.crawler === "Google-Extended")?.role).toBe("control");
    expect(VISITING_AI_CRAWLERS.map((c) => c.crawler)).not.toContain("Google-Extended");
  });

  it("the page never calls Google-Extended a crawler that visits, or a way into AI Overviews", () => {
    expect(page).toContain("Google-Extended isn't a crawler that visits");
    expect(page).toContain("AI Overviews and AI Mode draw on Googlebot");
    expect(page).toContain(
      `For each AI crawler and agent (${VISITING_AI_CRAWLERS.map((c) => c.crawler).join(", ")})`,
    );
    expect(page).not.toContain("(GPTBot, ClaudeBot, Google-Extended, PerplexityBot)");
  });

  it("CDN Shield: a Google-Extended block beside Googlebot's visits is no violation, and visits are each crawler's own", () => {
    const robots = "User-agent: Google-Extended\nDisallow: /\n\nUser-agent: GPTBot\nDisallow: /\n";
    const rows = joinCrawlerAccess(
      { status: "found", text: robots },
      [
        { vendor: "google", crawlerName: "Googlebot", visits: 40 },
        { vendor: "openai", crawlerName: "ChatGPT-User", visits: 3 },
      ],
      true,
    );
    const by = Object.fromEntries(rows.map((r) => [r.crawlerName, r]));
    expect(by["Google-Extended"]?.verdict).toBe("control_token");
    expect(by["Google-Extended"]?.verifiedVisits).toBe(0);
    expect(by["Google-Extended"]?.sentence).toContain("isn't a crawler that visits");
    expect(by.Googlebot?.verdict).toBe("healthy");
    expect(by.Googlebot?.verifiedVisits).toBe(40);
    expect(by.GPTBot?.verdict).toBe("training_blocked");
    expect(by.GPTBot?.verifiedVisits).toBe(0);
    expect(by["ChatGPT-User"]?.verdict).toBe("healthy");
    expect(rows.filter((r) => r.verdict === "robots_violation")).toEqual([]);
  });
});

describe("AI Discovery: the three /ai/ files are optional and lower no score", () => {
  const respond = (found: string[]) =>
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const hit = found.find((path) => url.endsWith(path));
      if (!hit) return new Response("", { status: 404 });
      const type = hit.endsWith(".json") ? "application/json" : "text/plain";
      return new Response("x".repeat(200), { status: 200, headers: { "content-type": type } });
    });

  // 20 Nov: ai.txt weighs 0 too (tests/unit/technical-audit/scoring-version.test.ts); a 19 Nov audit keeps its 95.
  it("weights 0, the maximum 0 for a new audit, and the composite's own maximum for each older one", () => {
    expect(AI_DISCOVERY_WEIGHTS).toEqual({ aiTxt: 0, aiSummary: 0, aiFaq: 0, aiService: 0 });
    expect(AI_DISCOVERY_WEIGHTS_BY_VERSION[3]).toEqual({
      aiTxt: 3,
      aiSummary: 0,
      aiFaq: 0,
      aiService: 0,
    });
    expect(AI_DISCOVERY_MAX).toBe(0);
    expect(TECHNICAL_AUDIT_MAX_SCORE).toBe(74);
    const at = (createdAt: string, findings: unknown) => compositeMaxFor({ createdAt, findings });
    expect(at("2026-11-20T00:00:00Z", { scoringVersion: 4 })).toBe(74);
    expect(at("2026-11-19T12:00:00Z", { aiDiscovery: { optionalFilesScored: false } })).toBe(95);
    expect(at("2026-11-10T00:00:00Z", {})).toBe(98);
    expect(at("2026-10-01T00:00:00Z", {})).toBe(100);
  });

  it("with or without the /ai/ files, the same score; an unfetchable optional file leaves it measured", async () => {
    respond(["/.well-known/ai.txt"]);
    const without = await checkAiDiscovery("example.com.au");
    vi.restoreAllMocks();
    respond(["/.well-known/ai.txt", "/ai/summary.json", "/ai/faq.json", "/ai/service.json"]);
    const withAll = await checkAiDiscovery("example.com.au");
    expect(without.score).toBe(0);
    expect(withAll.score).toBe(0);
    expect(withAll.findings.aiSummaryPresent).toBe(true);
    expect(without.findings.optionalFilesScored).toBe(false);
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/ai/faq.json")) throw new Error("ECONNRESET");
      if (url.endsWith("/.well-known/ai.txt"))
        return new Response("x".repeat(200), {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      return new Response("", { status: 404 });
    });
    const flaky = await checkAiDiscovery("example.com.au");
    expect(flaky.score).toBe(0);
    expect(flaky.measured).toBe(true);
  });

  it("the methodology labels them optional, keeps the IETF draft's real name, and says what llms.txt is", () => {
    expect(OPTIONAL_AI_FILES_LABEL).toBe("Optional, not read by any AI engine we know of");
    expect(page).toContain(`${OPTIONAL_AI_FILES_LABEL}: Vunnara's own format`);
    expect(page).toContain("they don't count toward any score, and no task asks you to add them");
    expect(page).toContain("draft-car-ai-txt-wellknown-00 (not endorsed by the IETF)");
    expect(page).not.toMatch(/grounded in an external standard|Emerging standard/);
    expect(page).toContain("No AI provider has said its engine reads it");
  });
});

describe("Google: an online-only business, with the reason the audit shows", () => {
  it("the methodology quotes the resolver's own reason", () => {
    const result = resolveGoogleLocation({
      postcode: null,
      suburb: null,
      city: null,
      state: null,
      locationMode: "online_only",
    });
    expect(result).toEqual({ ok: false, reason: GOOGLE_ONLINE_ONLY_REASON });
    const section = text(
      renderToStaticMarkup(createElement(GoogleAiMethodology, { googleAi: ON })),
    );
    expect(section).toContain(
      `A business with no fixed location (online-only) isn't checked on Google; its audit says: "${GOOGLE_ONLINE_ONLY_REASON}"`,
    );
  });
});
