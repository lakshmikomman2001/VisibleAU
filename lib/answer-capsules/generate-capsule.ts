import { getLLMService } from "@/lib/llm";

/** What the capsule may not invent: it's published on the business's own site, under its name. */
export const CAPSULE_CLAIMS_RULE =
  "Never state a licence, registration, insurance, accreditation, award, guarantee or government scheme (such as Medicare, bulk billing or the NDIS) unless the content above says it; where one belongs, write it as a bracketed fill-in the owner completes, e.g. [your licence number].";

export async function generateAnswerCapsule(
  question: string,
  existingContent: string,
): Promise<string> {
  const llm = getLLMService("claude");

  const contextPart = existingContent
    ? ` The following content appears below it: '${existingContent.slice(0, 200)}'.`
    : "";
  // 17 Nov, part 2: the capsule goes on the business's own site, so it never claims what we haven't seen -- a
  // licence, registration, insurance, accreditation, award or government scheme -- unless the content says so; where
  // one belongs, it leaves a bracketed fill-in for the owner (CAPSULE_CLAIMS_RULE).
  const prompt = `The heading '${question}' currently lacks a 20-25 word direct answer capsule.${contextPart} Write a single direct-answer sentence (20-25 words) that answers the question. Start with the answer, not a preamble. Focus on what the customer gets, not who the brand is. ${CAPSULE_CLAIMS_RULE}`;

  const result = await llm.complete({
    engine: "claude",
    prompt,
    task: "brand_mention",
  });

  return result.response.trim();
}
