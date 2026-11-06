/**
 * "Mention detection" (6 Nov), part 1 -- the answer text to store, built from the response's own parts.
 *
 * The AI SDK's `result.text` joins every text part with nothing between them (ai's DefaultStepResult.text,
 * `.join("")`). A provider splits one answer into text parts in two different ways:
 *  - within one run of writing, at each citation: Claude's "Based on the search results, " then the cited
 *    sentence. Those pieces are consecutive characters of one text, and join with nothing between them.
 *  - around a tool call: Claude's text before a web search and its text after it are separate runs.
 *    Joined with nothing, "...was born." + "Based on..." became "born.Based" (Anthropic's own documented
 *    response), and "...near Norwest" + "Omega Services..." would become "NorwestOmega Services", which the
 *    brand-name match (lib/brands/normalize.ts) rightly rejects as one word.
 * So parts with no tool call, tool result or reasoning between them form one run, joined as written, and
 * runs are joined with a newline. Sources don't break a run (a citation's source follows its cited text).
 * An answer written in one run comes back byte for byte as the SDK's own text.
 */
export function answerText(content: unknown, sdkText: string): string {
  if (!Array.isArray(content)) return sdkText;
  const runs: string[] = [];
  let run: string | null = null;
  for (const part of content) {
    const type =
      typeof part === "object" && part !== null ? (part as { type?: unknown }).type : undefined;
    if (type === "text") {
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") run = (run ?? "") + text;
    } else if (type !== "source" && run !== null) {
      runs.push(run);
      run = null;
    }
  }
  if (run !== null) runs.push(run);
  const written = runs.filter((r) => r.length > 0);
  return written.length === 0 ? sdkText : written.join("\n");
}
