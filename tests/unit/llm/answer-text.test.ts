/**
 * "Mention detection" (6 Nov), part 1 -- the stored answer is the response's text parts with a newline
 * between separate runs of writing, never glued together as the AI SDK's own `text` glues them.
 * diag-0122 found no glued sentences in Omega's #37-#40, so this is preventive; these tests pin the rule.
 */
import { describe, expect, it } from "vitest";
import { answerText } from "@/lib/llm/answer-text";

const text = (t: string) => ({ type: "text", text: t });
const source = { type: "source", sourceType: "url", id: "s", url: "https://a.com.au/" };
const toolCall = {
  type: "tool-call",
  toolCallId: "t",
  toolName: "web_search",
  input: "{}",
  providerExecuted: true,
};
const toolResult = {
  type: "tool-result",
  toolCallId: "t",
  toolName: "web_search",
  output: [],
  providerExecuted: true,
};

describe("answerText", () => {
  it("one text part comes back byte for byte", () => {
    const only = "Line one.\n\n**Omega Services** is great.  ";
    expect(answerText([text(only)], only)).toBe(only);
  });

  it("a run split at citations joins with nothing between the pieces", () => {
    const content = [
      text("Based on the search results, "),
      text("Omega Services is rated 4.9"),
      source,
      text("."),
    ];
    expect(answerText(content, "")).toBe(
      "Based on the search results, Omega Services is rated 4.9.",
    );
  });

  it("text before and after a search are separate runs, joined with a newline", () => {
    const content = [
      text("I'll search for plumbers near Norwest"),
      toolCall,
      toolResult,
      source,
      text("Omega Services is near."),
    ];
    expect(answerText(content, "")).toBe(
      "I'll search for plumbers near Norwest\nOmega Services is near.",
    );
  });

  it("reasoning between two runs separates them; reasoning before the answer adds nothing", () => {
    const reasoning = { type: "reasoning", text: "thinking" };
    expect(answerText([reasoning, text("A."), reasoning, text("B.")], "")).toBe("A.\nB.");
  });

  it("no text parts at all falls back to the SDK's text; so does content that isn't an array", () => {
    expect(answerText([toolCall, toolResult], "ChatGPT answered.")).toBe("ChatGPT answered.");
    expect(answerText(undefined, "fallback")).toBe("fallback");
  });
});
