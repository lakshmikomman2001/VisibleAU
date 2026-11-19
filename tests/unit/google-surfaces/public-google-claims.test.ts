/**
 * 16 Nov (Sri: Google AI Overviews and AI Mode on for every Growth, Agency and Agency Pro workspace, and said so on the
 * public pages -- "claim only what the product does today"). The guard:
 * - a public page mentions Google's AI answers only through the setting-aware component: its words are
 *   lib/marketing/google-ai.ts's, rendered from what components/domain/google-ai/load-google-ai-claim.ts loaded for
 *   the request (lib/governance/google-surfaces.ts publicGoogleAi: the settings an audit resolves);
 * - Starter (and Free) never list it, and the plans that do are the ones the audit's gate runs it for.
 * The two public mentions that aren't a product claim are named below, each with why.
 * tests/integration/public-google-claims.integration.test.tsx renders the pages with the setting on and off.
 */
import { describe, expect, it } from "vitest";
import { GOOGLE_SURFACES_MIN_TIER } from "@/lib/governance/google-surfaces";
import { googleAiPlanLine, type PublicGoogleAi } from "@/lib/marketing/google-ai";
import {
  COMPARISON_ROWS,
  cardFeatures,
  comparisonIncludes,
  comparisonRows,
  GOOGLE_AI_FROM_TIER,
  TIER_DEFINITIONS,
  tierRank,
} from "@/lib/pricing/tiers";
import { readSourcesBeforeAll, sourcePaths, sourceText } from "@/tests/helpers/source-files";

/** Every source a visitor's page is built from (the signed-out site). */
const PUBLIC_ROOTS = [
  "app/(marketing)",
  "components/domain/landing",
  "components/domain/pricing",
  "lib/seo",
];
/** Where the words and the setting-aware rendering live. */
const CLAIM_DIR = "components/domain/google-ai/";
const WORDING = "lib/marketing/google-ai.ts";
const LOADER = "components/domain/google-ai/load-google-ai-claim.ts";

/** Naming Google's AI answers in page text. */
const MENTION = /\bAI Overviews?\b|\bAI Mode\b|\bGoogle(?:'s|&apos;s)? (?:Search )?AI\b/;

/**
 * Not product claims, each kept as it is:
 * - privacy: the processor disclosure. It must name DataForSEO whenever any workspace's questions can go to it -- a
 *   workspace override included, with the global setting off -- so it follows the env switch and the credentials
 *   (googleSurfacesCanRun), not the global setting.
 * - methodology: a cited study's finding ("no statistically significant lift for ChatGPT or Google AI Mode"), and
 *   (19 Nov) a fact about Google's crawlers in AI Crawler Access: "AI Overviews and AI Mode draw on Googlebot", said to
 *   explain that Google-Extended isn't a crawler -- true whatever the setting says.
 */
const NOT_A_CLAIM: Record<string, RegExp> = {
  "app/(marketing)/privacy/page.tsx": /Google Search AI switched on/,
  "app/(marketing)/methodology/page.tsx":
    /statistically significant lift for ChatGPT or Google AI Mode|AI Overviews and AI Mode draw on Googlebot/,
};

readSourcesBeforeAll([...PUBLIC_ROOTS, "components", "app", "lib"]);

/** Code without comments: an explanation that names Google isn't a claim on the page. */
function code(path: string): string {
  return sourceText(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const ON: PublicGoogleAi = {
  surfaces: ["google_ai_overviews", "google_ai_mode"],
  fromTier: GOOGLE_AI_FROM_TIER,
  fromPlan: "Growth",
  countedInScore: false,
  device: "desktop",
  queueMode: "standard",
};
const LINE = "Google AI Overviews and AI Mode, checked from your postcode";

describe("a public page mentions Google's AI answers only through the setting-aware component", () => {
  it("no public source words them itself (comments aside), but the two that aren't claims", () => {
    const offenders: string[] = [];
    for (const path of sourcePaths(PUBLIC_ROOTS)) {
      const lines = code(path)
        .split("\n")
        .filter((line) => MENTION.test(line))
        .filter((line) => !NOT_A_CLAIM[path]?.test(line));
      for (const line of lines) offenders.push(`${path}: ${line.trim()}`);
    }
    expect(offenders).toEqual([]);
  });

  it("the privacy disclosure follows the env switch and the credentials", () => {
    expect(code("app/(marketing)/privacy/page.tsx")).toMatch(
      /googleSurfacesCanRun\(\) && \(\s*<p className="mt-2" data-privacy-google="">/,
    );
  });

  it("only the loader asks publicGoogleAi for the public pages (billing asks for its own refusal)", () => {
    const callers = sourcePaths(["app", "components", "lib"]).filter(
      (path) =>
        path !== "lib/governance/google-surfaces.ts" && /\bpublicGoogleAi\(/.test(code(path)),
    );
    expect(callers.sort()).toEqual([LOADER, "app/(auth)/settings/billing/page.tsx"].sort());
    expect(code(LOADER)).toMatch(
      /if \(!googleSurfacesCanRun\(\)\) return null;\s*await connection\(\);/,
    );
  });

  it("each public page that loads it renders the claim from it, and only the public pages load it", () => {
    const loaders = sourcePaths(["app", "components", "lib"]).filter(
      (path) => path !== LOADER && /\bloadGoogleAiClaim\(/.test(code(path)),
    );
    expect(loaders.sort()).toEqual(
      [
        "app/(marketing)/page.tsx",
        "app/(marketing)/pricing/page.tsx",
        "app/(marketing)/about/page.tsx",
        "app/(marketing)/methodology/page.tsx",
      ].sort(),
    );
    for (const page of loaders) {
      const text = code(page);
      expect(text, page).toContain("const googleAi = await loadGoogleAiClaim();");
      // Whatever it renders about Google takes that, and nothing else: the loaded value itself, or GoogleAiClaim's
      // own argument inside it.
      const uses: string[] = text.match(/googleAi=\{[^}]*\}/g) ?? [];
      expect(uses.length, page).toBeGreaterThan(0);
      for (const use of uses) expect(["googleAi={googleAi}", "googleAi={g}"], page).toContain(use);
      if (uses.includes("googleAi={g}")) {
        expect(text, page).toMatch(/<GoogleAiClaim googleAi=\{googleAi\}>\s*\{\(g\) =>/);
      }
    }
  });

  it("every public component that words them takes the loaded value as its `googleAi` prop", () => {
    const wordingUsers = sourcePaths(PUBLIC_ROOTS).filter((path) =>
      /from "@\/lib\/marketing\/google-ai"|from "@\/components\/domain\/google-ai\//.test(
        code(path),
      ),
    );
    for (const path of wordingUsers) {
      const text = code(path);
      if (path.endsWith("/page.tsx")) {
        expect(text, path).toContain("await loadGoogleAiClaim()");
      } else {
        expect(text, path).toMatch(/googleAi(\?)?: PublicGoogleAi \| null/);
      }
    }
    // The setting-aware component's own files: the claim renders nothing without the loaded value, and every other
    // file there takes it as a required prop.
    expect(code(`${CLAIM_DIR}google-ai-claim.tsx`)).toContain("if (!googleAi) return null;");
    for (const path of sourcePaths(["components/domain/google-ai"])) {
      if (path === LOADER || path.endsWith("google-ai-claim.tsx")) continue;
      expect(code(path), path).toContain("{ googleAi: PublicGoogleAi }");
    }
    expect(sourcePaths(["lib/marketing"])).toContain(WORDING);
  });
});

describe("the plans that list it are the ones the audit runs it for; never Starter", () => {
  it("the gate and the plans share one starting plan: Growth", () => {
    expect(GOOGLE_SURFACES_MIN_TIER).toBe(GOOGLE_AI_FROM_TIER);
    expect(GOOGLE_AI_FROM_TIER).toBe("growth");
  });

  it("Growth, Agency and Agency Pro list it; Enterprise has it through Agency Pro; Free and Starter never", () => {
    const listing = TIER_DEFINITIONS.filter((t) => t.googleAi).map((t) => t.key);
    expect(listing).toEqual(["growth", "agency", "agency_pro"]);
    for (const tier of TIER_DEFINITIONS) {
      const lines = cardFeatures(tier, ON);
      const below = tierRank(tier.key) < tierRank(GOOGLE_AI_FROM_TIER);
      if (below) expect(lines, tier.key).not.toContain(LINE);
      if (tier.googleAi) expect(lines, tier.key).toContain(LINE);
    }
    expect(
      cardFeatures(TIER_DEFINITIONS.find((t) => t.key === "enterprise") ?? TIER_DEFINITIONS[0], ON),
    ).toContain("Everything in Agency Pro");
    // Every plan the gate runs it for is one that lists it or has everything in one that does.
    for (const tier of TIER_DEFINITIONS.filter(
      (t) => tierRank(t.key) >= tierRank(GOOGLE_AI_FROM_TIER),
    )) {
      const inherited = tier.everythingIn
        ? TIER_DEFINITIONS.find((t) => t.key === tier.everythingIn)?.googleAi
        : false;
      expect(tier.googleAi === true || inherited === true, tier.key).toBe(true);
    }
  });

  it("with the setting off, no card and no comparison row says it", () => {
    for (const tier of TIER_DEFINITIONS) {
      expect(cardFeatures(tier).join(" | "), tier.key).not.toMatch(MENTION);
      expect(cardFeatures(tier, null).join(" | "), tier.key).not.toMatch(MENTION);
    }
    expect(comparisonRows(null)).toBe(COMPARISON_ROWS);
  });

  it("with it on: one comparison row after the Growth rows, ticked from Growth up", () => {
    const rows = comparisonRows(ON);
    const google = rows.filter((r) => "label" in r && r.label === LINE);
    expect(google).toHaveLength(1);
    expect(rows).toHaveLength(COMPARISON_ROWS.length + 1);
    const at = rows.indexOf(google[0]);
    expect(rows[at - 1]).toEqual({ label: "PDF export", from: "growth" });
    for (const tier of TIER_DEFINITIONS) {
      expect(comparisonIncludes(google[0], tier.key), tier.key).toBe(
        tierRank(tier.key) >= tierRank("growth"),
      );
    }
  });

  it("only the surfaces that are on are named", () => {
    expect(googleAiPlanLine(["google_ai_overviews"])).toBe(
      "Google AI Overviews, checked from your postcode",
    );
    expect(googleAiPlanLine(["google_ai_mode"])).toBe("Google AI Mode, checked from your postcode");
    const growth = TIER_DEFINITIONS.find((t) => t.key === "growth") ?? TIER_DEFINITIONS[0];
    expect(
      cardFeatures(growth, { ...ON, surfaces: ["google_ai_overviews"] }).join(" | "),
    ).not.toMatch(/AI Mode/);
  });
});
