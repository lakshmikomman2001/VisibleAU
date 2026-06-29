import { describe, expect, it } from "vitest";
import { AU_EN_PROVIDERS } from "@/db/seed/provider-market-capabilities";
import { AU_EN_QUALITY_GATES } from "@/db/seed/metric-quality-gates";

describe("Seed data LLD compliance", () => {
  describe("provider_market_capabilities seed", () => {
    it("has exactly 4 AU_EN providers", () => {
      expect(AU_EN_PROVIDERS).toHaveLength(4);
    });

    it("all providers target AU_EN / en-AU", () => {
      for (const p of AU_EN_PROVIDERS) {
        expect(p.marketCode).toBe("AU_EN");
        expect(p.locale).toBe("en-AU");
      }
    });

    it("all providers are enabled at seed time", () => {
      for (const p of AU_EN_PROVIDERS) {
        expect(p.isEnabled).toBe(true);
      }
    });

    it("anthropic supports_citations is FALSE (the one boolean trap)", () => {
      const anthropic = AU_EN_PROVIDERS.find((p) => p.providerKey === "anthropic");
      expect(anthropic).toBeDefined();
      expect(anthropic!.supportsCitations).toBe(false);
      expect(anthropic!.modelKey).toBe("claude-3-5-sonnet");
    });

    it("perplexity supports_query_fan_out is FALSE", () => {
      const pplx = AU_EN_PROVIDERS.find((p) => p.providerKey === "perplexity");
      expect(pplx).toBeDefined();
      expect(pplx!.supportsQueryFanOut).toBe(false);
      expect(pplx!.maxFanOutSubQueries).toBe(8);
    });

    it("openai and google have max_fan_out=12", () => {
      const openai = AU_EN_PROVIDERS.find((p) => p.providerKey === "openai");
      const google = AU_EN_PROVIDERS.find((p) => p.providerKey === "google");
      expect(openai!.maxFanOutSubQueries).toBe(12);
      expect(google!.maxFanOutSubQueries).toBe(12);
    });

    it("anthropic has max_fan_out=10", () => {
      const anthropic = AU_EN_PROVIDERS.find((p) => p.providerKey === "anthropic");
      expect(anthropic!.maxFanOutSubQueries).toBe(10);
    });

    it("all providers except anthropic support citations", () => {
      for (const p of AU_EN_PROVIDERS) {
        if (p.providerKey === "anthropic") {
          expect(p.supportsCitations).toBe(false);
        } else {
          expect(p.supportsCitations).toBe(true);
        }
      }
    });

    it("all providers support web retrieval and location context", () => {
      for (const p of AU_EN_PROVIDERS) {
        expect(p.supportsWebRetrieval).toBe(true);
        expect(p.supportsLocationContext).toBe(true);
      }
    });

    it("all providers except perplexity support query fan out", () => {
      for (const p of AU_EN_PROVIDERS) {
        if (p.providerKey === "perplexity") {
          expect(p.supportsQueryFanOut).toBe(false);
        } else {
          expect(p.supportsQueryFanOut).toBe(true);
        }
      }
    });
  });

  describe("metric_quality_gates seed", () => {
    it("has exactly 7 AU_EN rows", () => {
      expect(AU_EN_QUALITY_GATES).toHaveLength(7);
    });

    it("all gates target AU_EN market", () => {
      for (const g of AU_EN_QUALITY_GATES) {
        expect(g.marketCode).toBe("AU_EN");
      }
    });

    it("has the correct 7 metric keys", () => {
      const keys = AU_EN_QUALITY_GATES.map((g) => g.metricKey);
      expect(keys).toContain("frequency");
      expect(keys).toContain("sentiment");
      expect(keys).toContain("accuracy");
      expect(keys).toContain("position");
      expect(keys).toContain("context");
      expect(keys).toContain("composite");
      expect(keys).toContain("citation_source");
    });

    it("matches LLD minimum_samples values: frequency(10), sentiment(10), accuracy(5), position(10), context(10), composite(3), citation_source(5)", () => {
      const expected: Record<string, number> = {
        frequency: 10,
        sentiment: 10,
        accuracy: 5,
        position: 10,
        context: 10,
        composite: 3,
        citation_source: 5,
      };
      for (const g of AU_EN_QUALITY_GATES) {
        expect(g.minimumSamples).toBe(expected[g.metricKey]);
      }
    });

    it("all gates have minimum_provider_count=2", () => {
      for (const g of AU_EN_QUALITY_GATES) {
        expect(g.minimumProviderCount).toBe(2);
      }
    });
  });
});
