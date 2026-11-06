// @vitest-environment jsdom
/**
 * "Record costs from what each provider actually reports" (6 Nov), item 3 -- the public pages state
 * only counts the code runs on: the FAQ's sample sentence is built from lib/sample-audit/config.ts,
 * a full audit's length isn't promised in minutes, and the plan, privacy, pricing and sample-result
 * lines say what tiers.ts, tier-limits.ts and the stored audits say.
 */
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FaqSection } from "@/components/domain/landing/faq-section";
import PricingTableClient from "@/components/domain/pricing/pricing-table-client";
import { PROMPTS_PER_AUDIT, RUNS_PER_PROMPT, TIER_ENGINES } from "@/lib/llm/tier-engines";
import { getTierDefinition } from "@/lib/pricing/tiers";
import { SAMPLE_AUDIT_CONFIG } from "@/lib/sample-audit/config";
import { TIER_AUDIT_LIMITS } from "@/lib/scheduling/tier-limits";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

// A cold first render can outlast a test's 5 s on this machine; pay for it here.
beforeAll(() => {
  render(createElement(FaqSection));
  renderToStaticMarkup(
    createElement(PricingTableClient, { showFreeTier: true, defaultGstInclusive: true }),
  );
  cleanup();
}, 60_000);

afterEach(() => {
  cleanup();
  vi.doUnmock("@/lib/sample-audit/config");
  vi.resetModules();
});

/** Opens one FAQ question and returns its answer's text. */
function answerTo(question: string): string {
  const button = screen.getByRole("button", {
    name: new RegExp(`^${question.replace(/\?/g, "\\?")}`),
  });
  fireEvent.click(button);
  return button.parentElement?.querySelector("p")?.textContent ?? "";
}

describe("the FAQ's counts come from the code", () => {
  it("the sample sentence is the sample's own questions x engines = answers", () => {
    render(createElement(FaqSection));
    const { promptsCount, engines, runsPerPrompt } = SAMPLE_AUDIT_CONFIG;

    const answer = answerTo("How long does an audit take?");

    expect(answer).toContain(
      `The free sample asks ${promptsCount} questions across ${engines.length} AI engines (${promptsCount * engines.length * runsPerPrompt} answers).`,
    );
    expect(answer).toContain("The free sample asks 6 questions across 2 AI engines (12 answers).");
  });

  it("follows the config when it changes -- the sentence isn't a copy of today's numbers", async () => {
    vi.doMock("@/lib/sample-audit/config", () => ({
      SAMPLE_AUDIT_CONFIG: {
        engines: ["chatgpt", "claude", "perplexity"],
        promptsCount: 7,
        runsPerPrompt: 1,
      },
    }));
    const { FaqSection: Fresh } = await import("@/components/domain/landing/faq-section");
    render(createElement(Fresh));

    expect(answerTo("How long does an audit take?")).toContain(
      "The free sample asks 7 questions across 3 AI engines (21 answers).",
    );
  });

  it("a full audit's length is never a fixed number of minutes or seconds", () => {
    render(createElement(FaqSection));

    const answer = answerTo("How long does an audit take?");

    expect(answer).toContain(
      "A full audit usually takes several minutes. You'll see live progress while it runs.",
    );
    expect(answer).not.toMatch(/\d\s*(–|-|to)?\s*\d*\s*(minutes?|mins?|seconds?|secs?)\b/i);
    expect(answer).not.toMatch(/~\s*\d/);
  });

  it("the free plan is tiers.ts's and the server's: one audit a month, two engines", () => {
    render(createElement(FaqSection));
    const free = getTierDefinition("free");
    const starter = getTierDefinition("starter");

    const answer = answerTo("How much does it cost?");

    expect(TIER_AUDIT_LIMITS.free.auditsPerMonth).toBe(1);
    expect(free?.frequency).toBe("1 audit/month");
    expect(answer).toContain(`Free plan: ${free?.frequency} across ${free?.engines} AI engines.`);
    expect(answer).toContain(
      `Starter from A$${(starter?.monthlyPriceCentsIncGst ?? 0) / 100}/mo inc. GST.`,
    );
    expect(answer).not.toContain("3 audits");
  });

  it("never says the questions are deleted after 24 hours -- every audit keeps them", () => {
    render(createElement(FaqSection));

    const answer = answerTo("Is my data safe?");

    expect(answer).not.toMatch(/24 hours/);
    expect(answer).toContain(
      "The questions we send and the answers we get back are saved with your audit results.",
    );
  });
});

describe("the other public counts say what the code runs", () => {
  it("the pricing page's one-off audit: every paid engine, 10+ questions, each asked once per engine", () => {
    const html = renderToStaticMarkup(
      createElement(PricingTableClient, { showFreeTier: true, defaultGstInclusive: true }),
    );

    expect(RUNS_PER_PROMPT).toBe(1);
    expect(html).toContain(
      `${TIER_ENGINES.starter.length} AI engines, ${PROMPTS_PER_AUDIT}+ questions, each asked once per engine`,
    );
    expect(html).not.toContain("5 runs per prompt");
  });

  it("the privacy policy, the sample result page and the FAQ drop the counts the code contradicts", () => {
    // Whitespace folded, so a re-wrapped line doesn't matter.
    const read = (file: string) =>
      readFileSync(join(process.cwd(), file), "utf8").replace(/\s+/g, " ");
    const privacy = read("app/(marketing)/privacy/page.tsx");
    const sampleResult = read("app/(marketing)/sample-audit/result/[id]/sample-result-view.tsx");
    const faq = read("components/domain/landing/faq-section.tsx");

    expect(privacy).not.toContain("not stored beyond 24 hours");
    expect(privacy).toContain(
      "The questions we send to LLM providers, and their answers, are saved with your audit results.",
    );
    expect(sampleResult).not.toMatch(/up to 50 prompts/);
    expect(sampleResult).toContain(
      "Full audits ask {PROMPTS_PER_AUDIT}+ questions across {TIER_ENGINES.starter.length} AI engines.",
    );
    expect(faq).not.toContain("~90 seconds");
    expect(faq).not.toContain("2–5 minutes");
  });
});
