/**
 * Google AI surfaces, Phase 1, part 3 -- the landing page's "Coming soon" line said "Google AI Overviews
 * (Q3 2026)", a date that has passed. It names no date now, and Google isn't claimed as available: it runs
 * only for workspaces Sri switches on.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EnginesSupported } from "@/components/domain/landing/engines-supported";

const html = () => renderToStaticMarkup(<EnginesSupported />).replace(/<!-- -->/g, "");

describe("the landing page's engines", () => {
  it("names Google only as coming soon, with no date", () => {
    const comingSoon = html().match(/data-engines-coming-soon="">([^<]*)</)?.[1] ?? "";
    expect(comingSoon).toBe(
      "Coming soon: Microsoft Copilot, Google AI Overviews and Google AI Mode",
    );
    expect(html()).not.toMatch(/\bQ[1-4]\s+20\d\d\b/);
    expect(html()).not.toMatch(/\b20\d\d\b/);
  });

  it("the engines it says it audits are the four that run for everyone, not Google's", () => {
    const audited = [...html().matchAll(/<span class="text-sm font-medium">([^<]+)<\/span>/g)].map(
      (m) => m[1],
    );
    expect(audited).toEqual(["ChatGPT", "Claude", "Gemini", "Perplexity"]);
  });
});
