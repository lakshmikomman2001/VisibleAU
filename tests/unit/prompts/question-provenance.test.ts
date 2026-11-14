/**
 * 14 Nov, part 1 (Sri's review of audit #48): Hero Home Services (General trades, Yennora) had "What Australian tech
 * companies are leading in their space in 2025?" as Q11, counted as an everyday question. It came from
 * buildEnrichedPrompts (lib/prompts/build-prompt-pack.ts), which added it for every Australian-founded brand
 * (auRelevance "au_founded") whatever its vertical, though it names no brand.
 *
 * The rule for every question set, across every category, buyer type, audience and auRelevance:
 * - an everyday question (one that doesn't name the brand) comes from the brand's confirmed categories' own
 *   question pool (buildCandidatePoolsByCategory: its templates and the intent signals filed under it);
 * - every other question names the brand (isBrandedPrompt, the audit's own test for "branded");
 * - a trade, health, legal, property or hospitality business is never asked about software or tech companies.
 * The fallback for a brand that isn't ready (lib/audit/get-audit-prompts.ts) reads only its own vertical's pack.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { isBrandedPrompt } from "@/lib/audit/flag-branded-prompts";
import {
  buildCandidatePoolsByCategory,
  buildPromptPack,
  buildTaggedOrganicPrompts,
} from "@/lib/prompts/build-prompt-pack";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import { type BuyerType, CATEGORY_KEYS } from "@/lib/prompts/templates";
import type { Audience, BrandClassification } from "@/lib/types/brand";

const BRAND = { name: "Zephyr Example Co", domain: "zephyrexample.com.au" };
const REGION = "Yennora, NSW";
const BUYERS: BuyerType[] = ["smb", "enterprise", "consumer", "freelancer", "agency", "mixed"];
const AUDIENCES: Audience[] = ["households", "businesses", "both"];
const RELEVANCE: BrandClassification["auRelevance"][] = [
  "au_founded",
  "au_strong",
  "au_present",
  "au_limited",
];
/** Categories whose businesses aren't software or tech: their questions never are. */
const NOT_TECH =
  /^(trades_|allied_health_|legal_services$|real_estate_agency$|hospitality_restaurant$)/;
const TECH_WORDS = /\bsoftware\b|\bSaaS\b|tech compan|\bapps?\b/i;

let warn: ReturnType<typeof vi.spyOn>;
beforeAll(() => {
  // The builder warns about templates it rejects; that's not what this checks.
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterAll(() => warn.mockRestore());

function classification(
  category: string,
  buyerType: BuyerType,
  auRelevance: BrandClassification["auRelevance"],
): BrandClassification {
  return { category, buyerType, auRelevance, intentSignals: [], competitors: [], confidence: 0.9 };
}

describe("every question in a brand's set is its own: its categories' questions, or about the brand", () => {
  it("across every category, buyer type, audience and Australian relevance", () => {
    const problems: string[] = [];
    let packs = 0;
    for (const category of CATEGORY_KEYS) {
      for (const buyerType of BUYERS) {
        for (const audience of AUDIENCES) {
          for (const auRelevance of RELEVANCE) {
            const c = classification(category, buyerType, auRelevance);
            const confirmed = { categories: [category], competitors: ["Rival One"], audience };
            const pack = buildPromptPack(
              c,
              BRAND.name,
              BRAND.domain,
              confirmed,
              REGION,
              10,
              "seed",
            );
            packs++;
            const pool = new Set(
              buildCandidatePoolsByCategory(c, [category], buyerType, audience, REGION).get(
                category,
              ),
            );
            const everyday = buildTaggedOrganicPrompts(c, [category], audience, REGION, 10, "seed");
            const everydayText = new Set(everyday.map((t) => t.text));
            for (const t of everyday) {
              if (!pool.has(t.text))
                problems.push(`${category}: everyday question not from its pool: ${t.text}`);
            }
            for (const q of pack) {
              if (!everydayText.has(q) && !isBrandedPrompt(q, BRAND)) {
                problems.push(
                  `${category}/${buyerType}/${audience}/${auRelevance}: not its own: ${q}`,
                );
              }
              if (NOT_TECH.test(category) && TECH_WORDS.test(q)) {
                problems.push(`${category}/${buyerType}/${audience}: about tech: ${q}`);
              }
            }
          }
        }
      }
    }
    expect(packs).toBe(CATEGORY_KEYS.length * BUYERS.length * AUDIENCES.length * RELEVANCE.length);
    expect([...new Set(problems)]).toEqual([]);
  });

  it("Hero's shape (General trades, households, Australian-founded): no tech question", () => {
    const pack = buildPromptPack(
      classification("trades_general", "consumer", "au_founded"),
      "Hero Home Services",
      "herohomeservices.com.au",
      { categories: ["trades_general"], competitors: [], audience: "households" },
      REGION,
      10,
      "hero",
    );
    expect(pack.filter((q) => /tech compan/i.test(q))).toEqual([]);
    expect(
      pack.filter(
        (q) =>
          !isBrandedPrompt(q, { name: "Hero Home Services", domain: "herohomeservices.com.au" }),
      ),
    ).toHaveLength(10);
  });

  it("saved question sets rebuild without it on their next audit: the generator moved past 3", () => {
    expect(PROMPT_GENERATOR_VERSION).toBe(4);
  });
});
