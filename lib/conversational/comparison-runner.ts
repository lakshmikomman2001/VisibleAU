import { getLLMService } from "@/lib/llm";
import { selectModel } from "@/lib/llm/model-selector";
import type { Engine } from "@/lib/llm/interface";

export interface ComparisonInput {
  brandName: string;
  brandDomain: string;
  competitorDomain: string;
  engine: Engine;
  tier: string;
}

export interface ComparisonResult {
  brandWon: boolean | null;
  brandMentioned: boolean;
  competitorMentioned: boolean;
  verdictSnippet: string;
  prompt: string;
}

export async function runComparison(input: ComparisonInput): Promise<ComparisonResult> {
  const { brandName, brandDomain, competitorDomain, engine, tier } = input;

  const prompt = `Compare ${brandDomain} vs ${competitorDomain}. Which is better for customers looking for their services? Provide a brief verdict.`;

  const model = selectModel(
    tier as "free" | "starter" | "growth" | "agency" | "agency_pro" | "enterprise",
    engine,
    "brand_mention",
  );
  const llm = getLLMService(engine);
  const output = await llm.complete({
    engine,
    prompt,
    task: "brand_mention",
    model,
  });

  const response = output.response;
  const responseLower = response.toLowerCase();
  const brandMentioned = responseLower.includes(brandName.toLowerCase()) || responseLower.includes(brandDomain.toLowerCase());
  const competitorMentioned = responseLower.includes(competitorDomain.toLowerCase());

  let brandWon: boolean | null = null;
  if (brandMentioned && competitorMentioned) {
    const brandIdx = responseLower.indexOf(brandName.toLowerCase());
    const compIdx = responseLower.indexOf(competitorDomain.toLowerCase());
    if (/recommend|better|prefer|winner|superior/i.test(response)) {
      brandWon = brandIdx < compIdx;
    }
  } else if (brandMentioned && !competitorMentioned) {
    brandWon = true;
  } else if (!brandMentioned && competitorMentioned) {
    brandWon = false;
  }

  const verdictSnippet = response.slice(0, 300);

  return {
    brandWon,
    brandMentioned,
    competitorMentioned,
    verdictSnippet,
    prompt,
  };
}
