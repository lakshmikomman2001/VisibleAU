import { getLLMService } from "@/lib/llm";
import type { Engine } from "@/lib/llm/interface";
import { selectModel } from "@/lib/llm/model-selector";
import { judgeComparison } from "./comparison-verdict";

export {
  type ComparisonParties,
  type ComparisonVerdict,
  judgeComparison,
  LEGACY_VERDICT_SNIPPET_CHARS,
  rejudgeStoredComparison,
} from "./comparison-verdict";

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
  /**
   * The engine's whole answer (17 Nov, part 3). It was its first LEGACY_VERDICT_SNIPPET_CHARS characters,
   * which is all a row written before then keeps; the comparisons page judges each row again from this text
   * (rejudgeStoredComparison, lib/conversational/comparison-verdict.ts), so a verdict is always the current
   * rule's, read from the answer itself.
   */
  verdictSnippet: string;
  prompt: string;
  /** "Inngest: fit within the 5 concurrent steps of the free plan",
   * item 3 -- output.costEstimateUsd was previously read for
   * .response only and discarded; this is the real cost this
   * function's one real LLM call per (competitor, engine) incurs.
   * null when the model has no price (lib/audit/compute-cost.ts). */
  costEstimateUsd: number | null;
  /** Cap-only stand-in for a null costEstimateUsd; never displayed. */
  capReserveUsd: number;
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
  // 17 Nov, part 3: the verdict rule is judgeComparison's (the brand found by its name or website; the verdict
  // read from the answer's verdict sentences). A brand named only by its website was a win by default.
  const verdict = judgeComparison(response, { brandName, brandDomain, competitorDomain });

  return {
    ...verdict,
    // The whole answer, so the page can judge it again (rejudgeStoredComparison).
    verdictSnippet: response,
    prompt,
    costEstimateUsd: output.costEstimateUsd,
    capReserveUsd: output.capReserveUsd ?? 0,
  };
}
