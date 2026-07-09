import { describe, it, expect } from "vitest";
import { CdnShieldDetector } from "@/lib/crawler/cdn-shield-detector";

describe("CdnShieldDetector.analyzeHeaders — honest-data discipline", () => {
  it("200 behind Cloudflare is NOT a block", () => {
    const result = CdnShieldDetector.analyzeHeaders(200, {
      "cf-ray": "abc123",
      server: "cloudflare",
    });
    expect(result.isBlockedByCDN).toBe(false);
    expect(result.detectedFirewall).toBe("Cloudflare");
    expect(result.remediationSnippet).toContain("No active AI-crawler block");
  });

  it("403 + Cloudflare = blocked", () => {
    const result = CdnShieldDetector.analyzeHeaders(403, {
      "cf-ray": "abc123",
      server: "cloudflare",
    });
    expect(result.isBlockedByCDN).toBe(true);
    expect(result.detectedFirewall).toBe("Cloudflare");
    expect(result.remediationSnippet).toContain("Cloudflare");
    expect(result.remediationSnippet).toContain("GPTBot");
  });

  it("429 + Vercel = blocked", () => {
    const result = CdnShieldDetector.analyzeHeaders(429, {
      "x-vercel-id": "sfo1::abc",
    });
    expect(result.isBlockedByCDN).toBe(true);
    expect(result.detectedFirewall).toBe("Vercel");
    expect(result.remediationSnippet).toContain("Vercel");
  });

  it("503 + Akamai = blocked", () => {
    const result = CdnShieldDetector.analyzeHeaders(503, {
      server: "Akamai Ghost",
    });
    expect(result.isBlockedByCDN).toBe(true);
    expect(result.detectedFirewall).toBe("Akamai");
    expect(result.remediationSnippet).toContain("Akamai");
  });

  it("403 + no CDN headers = Unknown block", () => {
    const result = CdnShieldDetector.analyzeHeaders(403, {
      server: "nginx",
    });
    expect(result.isBlockedByCDN).toBe(true);
    expect(result.detectedFirewall).toBe("Unknown");
    expect(result.remediationSnippet).toContain("edge security layer");
  });

  it("200 + no CDN = None, not blocked", () => {
    const result = CdnShieldDetector.analyzeHeaders(200, {
      server: "nginx",
    });
    expect(result.isBlockedByCDN).toBe(false);
    expect(result.detectedFirewall).toBe("None");
  });

  it("case-insensitive header matching", () => {
    const result = CdnShieldDetector.analyzeHeaders(403, {
      "CF-Ray": "abc123",
      Server: "Cloudflare",
    });
    expect(result.isBlockedByCDN).toBe(true);
    expect(result.detectedFirewall).toBe("Cloudflare");
  });

  it("x-akamai-* headers trigger Akamai detection", () => {
    const result = CdnShieldDetector.analyzeHeaders(403, {
      "x-akamai-request-id": "123",
    });
    expect(result.isBlockedByCDN).toBe(true);
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
    expect(result.isBlockedByCDN).toBe(false);
  });

  it("500 is NOT treated as a block", () => {
    const result = CdnShieldDetector.analyzeHeaders(500, {
      "cf-ray": "abc",
    });
    expect(result.isBlockedByCDN).toBe(false);
  });
});
