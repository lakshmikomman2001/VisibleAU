import { describe, it, expect } from "vitest";
import {
  computeTechScore,
  computeEntityClarityScore,
  computeVerifyScore,
  computeAuthorityScore,
  computeTaskScore,
  computeTotalScore,
} from "@/lib/retrieval/agent-readiness";

describe("computeTechScore — /20", () => {
  it("returns 0 when all false", () => {
    expect(computeTechScore({
      llmstxtPresent: false, llmstxtValid: false,
      robotsAllowsCrawlers: false, ssrPasses: false,
      aiDiscoveryEndpoints: false, pageLoadFast: false,
      mcpEndpointPresent: false, mcpEndpointValid: false,
      mcpToolsCount: 0,
    })).toBe(0);
  });

  it("returns 20 when all true", () => {
    expect(computeTechScore({
      llmstxtPresent: true, llmstxtValid: true,
      robotsAllowsCrawlers: true, ssrPasses: true,
      aiDiscoveryEndpoints: true, pageLoadFast: true,
      mcpEndpointPresent: true, mcpEndpointValid: true,
      mcpToolsCount: 5,
    })).toBe(20);
  });

  it("llmstxt present+valid = 6", () => {
    expect(computeTechScore({
      llmstxtPresent: true, llmstxtValid: true,
      robotsAllowsCrawlers: false, ssrPasses: false,
      aiDiscoveryEndpoints: false, pageLoadFast: false,
      mcpEndpointPresent: false, mcpEndpointValid: false,
      mcpToolsCount: 0,
    })).toBe(6);
  });
});

describe("computeEntityClarityScore — /20", () => {
  it("returns 0 when all false", () => {
    expect(computeEntityClarityScore({
      orgSchemaPresent: false, localBusinessSchema: false,
      localRegInSchema: false, nameConsistent: false,
      serviceReadable: false,
    })).toBe(0);
  });

  it("returns 20 when all true", () => {
    expect(computeEntityClarityScore({
      orgSchemaPresent: true, localBusinessSchema: true,
      localRegInSchema: true, nameConsistent: true,
      serviceReadable: true,
    })).toBe(20);
  });
});

describe("computeVerifyScore — /20", () => {
  it("abn + wikipedia = 10", () => {
    expect(computeVerifyScore({
      abnConfirmed: true, wikipediaAu: true,
      auDirectories: 0, reviewCitations: 0,
      expertQuotes: false,
    })).toBe(10);
  });

  it("caps auDirectories at 4", () => {
    expect(computeVerifyScore({
      abnConfirmed: false, wikipediaAu: false,
      auDirectories: 10, reviewCitations: 0,
      expertQuotes: false,
    })).toBe(4);
  });
});

describe("computeAuthorityScore — /20", () => {
  it("returns capped at 20", () => {
    expect(computeAuthorityScore({
      topicalCoverage: 100, citationRate: 5, citationDiversity: 10,
    })).toBe(20);
  });
});

describe("computeTaskScore — /20", () => {
  it("all present + 5 FAQ = 20", () => {
    expect(computeTaskScore({
      bookingAccessible: true, pricingVisible: true,
      serviceAreaDefined: true, faqDirectAnswers: 5,
    })).toBe(20);
  });

  it("faq caps at 5", () => {
    expect(computeTaskScore({
      bookingAccessible: false, pricingVisible: false,
      serviceAreaDefined: false, faqDirectAnswers: 20,
    })).toBe(5);
  });
});

describe("computeTotalScore", () => {
  it("sums all dimensions", () => {
    expect(computeTotalScore(15, 12, 10, 8, 5)).toBe(50);
  });

  it("perfect score = 100", () => {
    expect(computeTotalScore(20, 20, 20, 20, 20)).toBe(100);
  });
});

describe("§8.4a re-break assertions", () => {
  it("pricingVisible:true adds +5 vs prose (false)", () => {
    const with_ = computeTaskScore({ bookingAccessible: false, pricingVisible: true, serviceAreaDefined: false, faqDirectAnswers: 0 });
    const without = computeTaskScore({ bookingAccessible: false, pricingVisible: false, serviceAreaDefined: false, faqDirectAnswers: 0 });
    expect(with_ - without).toBe(5);
  });

  it("bookingAccessible:true adds +5 vs auth-gated (false)", () => {
    const with_ = computeTaskScore({ bookingAccessible: true, pricingVisible: false, serviceAreaDefined: false, faqDirectAnswers: 0 });
    const without = computeTaskScore({ bookingAccessible: false, pricingVisible: false, serviceAreaDefined: false, faqDirectAnswers: 0 });
    expect(with_ - without).toBe(5);
  });

  it("CDN-blocked (3 crawl bools false) drops techScore by 8", () => {
    const normal = computeTechScore({
      llmstxtPresent: true, llmstxtValid: true,
      robotsAllowsCrawlers: true, ssrPasses: true,
      aiDiscoveryEndpoints: false, pageLoadFast: true,
      mcpEndpointPresent: false, mcpEndpointValid: false, mcpToolsCount: 0,
    });
    const blocked = computeTechScore({
      llmstxtPresent: true, llmstxtValid: true,
      robotsAllowsCrawlers: false, ssrPasses: false,
      aiDiscoveryEndpoints: false, pageLoadFast: false,
      mcpEndpointPresent: false, mcpEndpointValid: false, mcpToolsCount: 0,
    });
    expect(normal - blocked).toBe(8);
  });

  it("entity_clarity uses only schema inputs, not score_of_10", () => {
    const score = computeEntityClarityScore({
      orgSchemaPresent: true, localBusinessSchema: true,
      localRegInSchema: false, nameConsistent: true, serviceReadable: true,
    });
    expect(score).toBe(16);
    expect(computeEntityClarityScore.length).toBe(1);
  });
});
