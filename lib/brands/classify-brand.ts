import { getLLMService } from "@/lib/llm";
import type { BrandClassification } from "@/lib/types/brand";

const MOCK_CLASSIFICATION: BrandClassification = {
  category: "saas_design_tools",
  buyerType: "smb",
  intentSignals: ["graphic design software", "social media templates", "presentation maker"],
  competitors: ["Adobe Express", "Figma", "Microsoft Designer"],
  auRelevance: "au_founded",
  confidence: 0.95,
};

function classificationPrompt(brandName: string, domain: string, signals: string): string {
  return `You are classifying an Australian business for AI visibility auditing.
Respond with VALID JSON ONLY — no markdown, no explanation, no preamble.

Brand name: ${brandName}
Domain: ${domain}
Domain signals: ${signals}

Classify this brand and return exactly this JSON structure:
{
  "category": "<specific underscore_case category e.g. 'trades_plumbing', 'accounting_software', 'allied_health_dental'>",
  "buyerType": "<one of: smb | enterprise | consumer | freelancer | agency | mixed>",
  "intentSignals": ["<phrase 1>", "<phrase 2>", "<phrase 3>"],
  "competitors": ["<competitor 1>", "<competitor 2>", "<competitor 3>"],
  "auRelevance": "<one of: au_founded | au_strong | au_present | au_limited>",
  "confidence": <number 0.0–1.0>
}

Rules:
- category must be specific enough to select the right prompts
- intentSignals = the phrases real users type when looking for this TYPE of product/service
- competitors = direct competitors the brand competes with (by name)
- auRelevance: au_founded = HQ in Australia; au_strong = major AU presence; au_present = available in AU; au_limited = minimal AU presence
- If you cannot determine with confidence > 0.5, set confidence to your actual estimate`;
}

export async function classifyBrand(
  brandName: string,
  domain: string,
  userVertical?: string,
): Promise<BrandClassification> {
  if (process.env.LLM_MODE === "mock") {
    return { ...MOCK_CLASSIFICATION };
  }

  const llm = getLLMService("claude");

  const domainSignals = [
    `domain: ${domain}`,
    userVertical ? `user-selected vertical: ${userVertical}` : "",
  ]
    .filter(Boolean)
    .join(", ");

  const result = await llm.complete({
    engine: "claude",
    prompt: classificationPrompt(brandName, domain, domainSignals),
    task: "brand_mention",
    model: "claude-haiku-4-5",
  });

  try {
    let raw = result.response.trim();
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) raw = fenceMatch[1].trim();
    const parsed = JSON.parse(raw) as BrandClassification;

    if (!parsed.category || !parsed.buyerType || !Array.isArray(parsed.intentSignals)) {
      throw new Error("Missing required fields");
    }

    parsed.confidence = Math.max(0, Math.min(1, parsed.confidence ?? 0.5));
    return parsed;
  } catch {
    console.error("[classifyBrand] JSON parse failed, using fallback", {
      brandName,
      domain,
    });
    return {
      category: userVertical ?? "general",
      buyerType: "smb",
      intentSignals: [`${brandName} Australia`, `best ${userVertical ?? "business"} Australia`],
      competitors: [],
      auRelevance: "au_present",
      confidence: 0.3,
    };
  }
}
