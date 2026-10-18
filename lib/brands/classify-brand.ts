import * as cheerio from "cheerio";
import { crawlSite } from "@/lib/crawler";
import { getLLMService } from "@/lib/llm";
import { CATEGORY_KEYS, resolveCategory } from "@/lib/prompts/templates";
import type { Audience, BrandClassification } from "@/lib/types/brand";
import { sanitizeIntentSignals } from "./intent-signals";

const MOCK_CLASSIFICATION: BrandClassification = {
  category: "saas_design_tools",
  buyerType: "smb",
  audience: "businesses",
  intentSignals: ["graphic design software", "social media templates", "presentation maker"],
  competitors: ["Adobe Express", "Figma", "Microsoft Designer"],
  auRelevance: "au_founded",
  confidence: 0.95,
};

const AUDIENCE_VALUES: readonly Audience[] = ["households", "businesses", "both"];

interface HomepageSignals {
  title: string;
  metaDescription: string;
  h1: string;
}

/**
 * Vunnara Build 1, Part C.3: the homepage's <title>/meta description/
 * first <h1> via the existing SSRF-safe crawler, capped at 1 page (we
 * only need the homepage, not a full site crawl) with its own timeout.
 * Nothing from this is stored beyond feeding the classification prompt
 * -- returns null on any failure so the caller can classify from name/
 * domain alone and lower its confidence accordingly.
 */
async function fetchHomepageSignals(domain: string): Promise<HomepageSignals | null> {
  try {
    const result = await crawlSite(domain, { maxPages: 1, timeoutMs: 8000 });
    const page = result.pages[0];
    if (!page) return null;

    const $ = cheerio.load(page.html);
    const h1 = $("h1").first().text().trim();

    return { title: page.title, metaDescription: page.excerpt, h1 };
  } catch {
    return null;
  }
}

function classificationPrompt(
  brandName: string,
  domain: string,
  userVertical: string | undefined,
  homepage: HomepageSignals | null,
): string {
  const signals = [
    `domain: ${domain}`,
    userVertical ? `user-selected vertical: ${userVertical}` : "",
    homepage?.title ? `homepage title: ${homepage.title}` : "",
    homepage?.metaDescription ? `homepage meta description: ${homepage.metaDescription}` : "",
    homepage?.h1 ? `homepage main heading: ${homepage.h1}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `You are classifying an Australian business for AI visibility auditing.
Respond with VALID JSON ONLY — no markdown, no explanation, no preamble.

Brand name: ${brandName}
${signals}

Classify this brand and return exactly this JSON structure:
{
  "category": "<EXACTLY one of: ${CATEGORY_KEYS.join(" | ")}>",
  "buyerType": "<one of: smb | enterprise | consumer | freelancer | agency | mixed>",
  "audience": "<one of: households | businesses | both -- who actually PAYS this business? e.g. a plumber serving homeowners is 'households', one serving only commercial clients is 'businesses', most trades are 'both'>",
  "intentSignals": ["<phrase 1>", "<phrase 2>", "<phrase 3>"],
  "competitors": ["<competitor 1>", "<competitor 2>", "<competitor 3>"],
  "auRelevance": "<one of: au_founded | au_strong | au_present | au_limited>",
  "confidence": <number 0.0–1.0>
}

Rules:
- category MUST be one of the exact values listed above -- do not invent a new one. If none fit well, use "general".
- audience answers "who pays this business?", not what it sells -- a B2B software company selling to small businesses is audience "businesses" even though its own buyerType is "smb".
- intentSignals = the phrases real users type when looking for this TYPE of product/service. Never include location-dependent phrasing like "near me", "nearby", "in my area" or "close to me" -- our system has no real user location to match that against.
- competitors = direct competitors the brand competes with (by name)
- auRelevance: au_founded = HQ in Australia; au_strong = major AU presence; au_present = available in AU; au_limited = minimal AU presence
- If you cannot determine with confidence > 0.5, set confidence to your actual estimate`;
}

function coerceAudience(raw: unknown, buyerType: BrandClassification["buyerType"]): Audience {
  if (typeof raw === "string" && (AUDIENCE_VALUES as readonly string[]).includes(raw)) {
    return raw as Audience;
  }
  // Mirrors lib/brands/audience.ts's deriveAudienceFromBuyerType --
  // duplicated inline rather than imported to avoid this module
  // depending on a function whose whole point is READING legacy rows
  // that predate this classifier even asking for audience.
  if (buyerType === "consumer") return "households";
  if (buyerType === "mixed") return "both";
  return "businesses";
}

export async function classifyBrand(
  brandName: string,
  domain: string,
  userVertical?: string,
): Promise<BrandClassification> {
  if (process.env.LLM_MODE === "mock") {
    return { ...MOCK_CLASSIFICATION };
  }

  const homepage = await fetchHomepageSignals(domain);

  const llm = getLLMService("claude");

  const result = await llm.complete({
    engine: "claude",
    prompt: classificationPrompt(brandName, domain, userVertical, homepage),
    task: "brand_mention",
  });

  try {
    let raw = result.response.trim();
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) raw = fenceMatch[1].trim();
    const parsed = JSON.parse(raw) as Partial<BrandClassification> & { audience?: unknown };

    if (!parsed.category || !parsed.buyerType || !Array.isArray(parsed.intentSignals)) {
      throw new Error("Missing required fields");
    }

    const category = resolveCategory(parsed.category);
    const confidence = Math.max(0, Math.min(1, parsed.confidence ?? 0.5));

    return {
      category,
      buyerType: parsed.buyerType,
      audience: coerceAudience(parsed.audience, parsed.buyerType),
      intentSignals: sanitizeIntentSignals(parsed.intentSignals),
      competitors: Array.isArray(parsed.competitors) ? parsed.competitors : [],
      auRelevance: parsed.auRelevance ?? "au_present",
      // Homepage signals failed to fetch -- classifying from name/domain
      // alone is a real, honest classification, just a less-informed
      // one, so it's never marked "complete" with the same confidence
      // a signal-backed classification would earn.
      confidence: homepage ? confidence : Math.min(confidence, 0.5),
    };
  } catch {
    console.error("[classifyBrand] JSON parse failed, using fallback", {
      brandName,
      domain,
    });
    return {
      category: resolveCategory(userVertical ?? "general"),
      buyerType: "smb",
      audience: "both",
      intentSignals: sanitizeIntentSignals([
        `${brandName} Australia`,
        `best ${userVertical ?? "business"} Australia`,
      ]),
      competitors: [],
      auRelevance: "au_present",
      confidence: 0.3,
    };
  }
}
