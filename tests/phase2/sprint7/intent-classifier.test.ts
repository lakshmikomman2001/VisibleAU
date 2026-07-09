import { describe, it, expect } from "vitest";
import { classifyIntent } from "@/lib/conversational/intent-classifier";

describe("classifyIntent", () => {
  it("classifies booking/purchase prompts as decision", () => {
    expect(classifyIntent("Should I book them?")).toBe("decision");
    expect(classifyIntent("How do I sign up for their service?")).toBe("decision");
    expect(classifyIntent("Is it worth the price?")).toBe("decision");
  });

  it("classifies comparison prompts as consideration", () => {
    expect(classifyIntent("Compare them with the others")).toBe("consideration");
    expect(classifyIntent("Which one is better than the rest?")).toBe("consideration");
    expect(classifyIntent("What's the pricing like?")).toBe("consideration");
    expect(classifyIntent("Any good alternatives?")).toBe("consideration");
  });

  it("classifies exploratory prompts as awareness (default)", () => {
    expect(classifyIntent("What are the best plumbers in Sydney?")).toBe("awareness");
    expect(classifyIntent("Tell me about their services")).toBe("awareness");
    expect(classifyIntent("Find me a good physio near me")).toBe("awareness");
  });

  it("decision patterns take priority over consideration", () => {
    expect(classifyIntent("Should I switch to an alternative?")).toBe("decision");
  });

  it("returns awareness for empty or generic input", () => {
    expect(classifyIntent("hello")).toBe("awareness");
    expect(classifyIntent("")).toBe("awareness");
  });
});
