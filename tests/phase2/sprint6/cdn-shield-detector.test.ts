import { describe, expect, it } from "vitest";
import { CdnShieldDetector } from "@/lib/crawler/cdn-shield-detector";

// Stale since the af8de42..d1eb5a1 follow-ups (part 2): the request this reads is sent as us now, not as GPTBot,
// so a block code says the site refused our checker (checkerRefused, was isBlockedByCDN), never that it blocks
// AI crawlers; and a 200 says nothing about AI crawlers (it said "No active AI-crawler block detected").
describe("CdnShieldDetector.analyzeHeaders — honest-data discipline", () => {
  it("200 behind Cloudflare is NOT a block", () => {
    const result = CdnShieldDetector.analyzeHeaders(200, {
      "cf-ray": "abc123",
      server: "cloudflare",
    });
    expect(result.checkerRefused).toBe(false);
    expect(result.detectedFirewall).toBe("Cloudflare");
    // Nothing was tested for AI crawlers, so nothing is claimed about them.
    expect(result.remediationSnippet).toBeNull();
  });

  it("403 + Cloudflare = blocked", () => {
    const result = CdnShieldDetector.analyzeHeaders(403, {
      "cf-ray": "abc123",
      server: "cloudflare",
    });
    expect(result.checkerRefused).toBe(true);
    expect(result.detectedFirewall).toBe("Cloudflare");
    expect(result.remediationSnippet).toContain("Cloudflare");
    expect(result.remediationSnippet).toContain("GPTBot");
    // About our checker, and the fix as a condition: it isn't known to refuse AI crawlers.
    expect(result.remediationSnippet).toContain("refused our site checker");
    expect(result.remediationSnippet).toContain("If it refuses AI search crawlers");
    expect(result.remediationSnippet).not.toMatch(/is blocking AI/);
  });

  it("429 + Vercel = blocked", () => {
    const result = CdnShieldDetector.analyzeHeaders(429, {
      "x-vercel-id": "sfo1::abc",
    });
    expect(result.checkerRefused).toBe(true);
    expect(result.detectedFirewall).toBe("Vercel");
    expect(result.remediationSnippet).toContain("Vercel");
  });

  it("503 + Akamai = blocked", () => {
    const result = CdnShieldDetector.analyzeHeaders(503, {
      server: "Akamai Ghost",
    });
    expect(result.checkerRefused).toBe(true);
    expect(result.detectedFirewall).toBe("Akamai");
    expect(result.remediationSnippet).toContain("Akamai");
  });

  it("403 + no CDN headers = Unknown block", () => {
    const result = CdnShieldDetector.analyzeHeaders(403, {
      server: "nginx",
    });
    expect(result.checkerRefused).toBe(true);
    expect(result.detectedFirewall).toBe("Unknown");
    expect(result.remediationSnippet).toContain("edge security layer");
  });

  it("200 + no CDN = None, not blocked", () => {
    const result = CdnShieldDetector.analyzeHeaders(200, {
      server: "nginx",
    });
    expect(result.checkerRefused).toBe(false);
    expect(result.detectedFirewall).toBe("None");
  });

  it("case-insensitive header matching", () => {
    const result = CdnShieldDetector.analyzeHeaders(403, {
      "CF-Ray": "abc123",
      Server: "Cloudflare",
    });
    expect(result.checkerRefused).toBe(true);
    expect(result.detectedFirewall).toBe("Cloudflare");
  });

  it("x-akamai-* headers trigger Akamai detection", () => {
    const result = CdnShieldDetector.analyzeHeaders(403, {
      "x-akamai-request-id": "123",
    });
    expect(result.checkerRefused).toBe(true);
    expect(result.detectedFirewall).toBe("Akamai");
  });

  it("snippet contains AI user-agent allowlist", () => {
    const result = CdnShieldDetector.analyzeHeaders(403, {
      "cf-ray": "abc",
    });
    expect(result.remediationSnippet).toContain("GPTBot");
    expect(result.remediationSnippet).toContain("ChatGPT-User");
    expect(result.remediationSnippet).toContain("ClaudeBot");
    expect(result.remediationSnippet).toContain("PerplexityBot");
  });

  it("404 is NOT treated as a block", () => {
    const result = CdnShieldDetector.analyzeHeaders(404, {
      "cf-ray": "abc",
    });
    expect(result.checkerRefused).toBe(false);
  });

  it("500 is NOT treated as a block", () => {
    const result = CdnShieldDetector.analyzeHeaders(500, {
      "cf-ray": "abc",
    });
    expect(result.checkerRefused).toBe(false);
  });
});
