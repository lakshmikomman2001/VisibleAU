import { getLLMService } from "@/lib/llm";

export async function generateAnswerCapsule(
  question: string,
  existingContent: string,
): Promise<string> {
  const llm = getLLMService("claude");

  const prompt = `The heading '${question}' currently lacks a 20-25 word direct answer capsule. The following content appears below it: '${existingContent.slice(0, 200)}'. Write a single direct-answer sentence (20-25 words) that answers the question. Start with the answer, not a preamble. Focus on what the customer gets, not who the brand is.`;

  const result = await llm.complete({
    engine: "claude",
    prompt,
    task: "brand_mention",
    model: "claude-haiku-4-5",
  });

  return result.response.trim();
}
