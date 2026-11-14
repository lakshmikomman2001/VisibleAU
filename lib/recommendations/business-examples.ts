/**
 * 16 Nov, part 3 -- the examples a recommendation gives, chosen for the brand's own business type. They were a
 * plumber's for everyone: "quotes from industry bodies (e.g. Master Plumbers AU)", "statistics (e.g. WaterNSW, ABS
 * building permits)", "subreddits (r/sydney, r/ausfinance, r/homeimprovement)", "What is your call-out fee?", "an AU
 * trade publication" -- a café or an accountant was told to quote Master Plumbers. Trade wording now reaches the
 * trades only (tests/unit/recommendations/business-examples.test.ts guards it). Every body named here is a real
 * Australian peak body for that business; a type with none we can name says "your industry's peak body".
 */
import { type CategoryKey, resolveCategory } from "@/lib/prompts/templates";

export type BusinessFamily = "trades" | "venue" | "service" | "software";

const TRADES: readonly CategoryKey[] = [
  "trades_plumbing",
  "trades_electrical",
  "trades_building",
  "trades_general",
];
/** Customers walk in: hours and location matter more than a service area. */
const VENUES: readonly CategoryKey[] = [
  "hospitality_restaurant",
  "cafe",
  "fitness_gym",
  "beauty_salon",
  "retail_shop",
];
const LOCAL_SERVICES: readonly CategoryKey[] = [
  "allied_health_dental",
  "allied_health_physio",
  "allied_health_mental",
  "allied_health_general",
  "legal_services",
  "real_estate_agency",
  "accounting_practice",
  "general",
];

const INDUSTRY_BODY: Partial<Record<CategoryKey, string>> = {
  trades_plumbing: "Master Plumbers",
  trades_electrical: "Master Electricians Australia",
  trades_building: "Master Builders Australia or the HIA",
  trades_general: "Master Builders Australia or the HIA",
  allied_health_dental: "the Australian Dental Association",
  allied_health_physio: "the Australian Physiotherapy Association",
  allied_health_mental: "the Australian Psychological Society",
  allied_health_general: "Allied Health Professions Australia",
  legal_services: "your state's Law Society",
  real_estate_agency: "your state's Real Estate Institute",
  hospitality_restaurant: "Restaurant & Catering Australia",
  cafe: "Restaurant & Catering Australia",
  fitness_gym: "AUSactive",
  beauty_salon: "the Australian Hairdressing Council",
  retail_shop: "the Australian Retailers Association",
  accounting_practice: "CPA Australia or CA ANZ",
};

/** The brand's business type: its first confirmed one, else what its vertical implies, else none. */
function primaryCategory(categories: readonly string[], vertical?: string): CategoryKey | null {
  if (categories.length > 0) return resolveCategory(categories[0]);
  if (vertical === "tradies") return "trades_general";
  if (vertical === "allied_health") return "allied_health_general";
  if (vertical === "saas") return "saas_design_tools";
  return null;
}

export function businessFamily(categories: readonly string[], vertical?: string): BusinessFamily {
  const category = primaryCategory(categories, vertical);
  if (category === null) return "service";
  if (TRADES.includes(category)) return "trades";
  if (VENUES.includes(category)) return "venue";
  if (LOCAL_SERVICES.includes(category)) return "service";
  return "software";
}

export interface BusinessExamples {
  /** "Master Plumbers", "CPA Australia or CA ANZ", or "your industry's peak body". */
  industryBody: string;
  /** Where verifiable figures come from. */
  statSource: string;
  /** Subreddits worth answering in. */
  subreddits: string;
  /** Two questions an FAQ block answers. */
  faq: string;
  /** The kind of publication to pitch, beside a local news outlet. */
  publication: string;
}

export function businessExamples(
  categories: readonly string[],
  vertical?: string,
): BusinessExamples {
  const category = primaryCategory(categories, vertical);
  const family = businessFamily(categories, vertical);
  const industryBody = (category && INDUSTRY_BODY[category]) || "your industry's peak body";
  switch (family) {
    case "trades":
      return {
        industryBody,
        statSource: "ABS building approvals",
        subreddits: "your city's subreddit and r/AusRenovation",
        faq: '"What suburbs do you service?" and "What is your call-out fee?"',
        publication: "one AU trade publication",
      };
    case "venue":
      return {
        industryBody,
        statSource: "the ABS or your industry body",
        subreddits: "your city's subreddit and r/australia",
        faq: '"What are your opening hours?" and "Where are you located?"',
        publication: "one industry publication",
      };
    case "software":
      return {
        industryBody,
        statSource: "the ABS or independent industry research",
        subreddits: "the subreddits where your customers ask for recommendations, e.g. r/australia",
        faq: '"Who is it for?" and "How much does it cost?"',
        publication: "one industry publication",
      };
    default:
      return {
        industryBody,
        statSource: "the ABS or your industry body",
        subreddits:
          category === "accounting_practice"
            ? "your city's subreddit and r/AusFinance"
            : "your city's subreddit and r/australia",
        faq: '"What areas do you service?" and "How do I book?"',
        publication: "one industry publication",
      };
  }
}
