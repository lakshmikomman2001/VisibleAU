/**
 * ⚠️ FFF — ai.txt is checked at either standard location
 * (/.well-known/ai.txt, the June 2026 IETF draft, or root /ai.txt, the
 * older Spawning convention) -- task EEE found the detector only ever
 * checked /.well-known/ while the on-screen copy told customers to create
 * root /ai.txt, so a customer following the UI's own instructions would
 * re-audit and still score 0. Score stays binary: either location present
 * -> the full 3 points, neither -> 0.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_DISCOVERY_WEIGHTS, AI_TXT_PATHS, checkAiDiscovery } from "@/lib/ai-discovery/endpoints";

function mockFetch(responder: (url: string) => { status: number; contentType?: string; body?: string }) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    const { status, contentType, body = "x".repeat(200) } = responder(url);
    return new Response(status >= 200 && status < 300 ? body : "", {
      status,
      headers: contentType ? { "content-type": contentType } : {},
    });
  });
}

const JSON_404 = () => ({ status: 404 });

describe("⚠️ FFF — checkAiDiscovery: ai.txt accepts either standard location", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("AI_TXT_PATHS is the single source of truth: both standard locations", () => {
    expect(AI_TXT_PATHS).toEqual(["/.well-known/ai.txt", "/ai.txt"]);
  });

  it("present at /.well-known/ai.txt only -> full 3 points", async () => {
    mockFetch((url) => {
      if (url.endsWith("/.well-known/ai.txt")) return { status: 200, contentType: "text/plain" };
      return JSON_404();
    });
    const result = await checkAiDiscovery("example.com.au");
    expect(result.findings.aiTxtPresent).toBe(true);
    expect(result.score).toBe(AI_DISCOVERY_WEIGHTS.aiTxt);
  });

  it("present at root /ai.txt only -> full 3 points (the previously-missed case)", async () => {
    mockFetch((url) => {
      if (url.endsWith("/ai.txt") && !url.includes(".well-known")) {
        return { status: 200, contentType: "text/plain" };
      }
      return JSON_404();
    });
    const result = await checkAiDiscovery("example.com.au");
    expect(result.findings.aiTxtPresent).toBe(true);
    expect(result.score).toBe(AI_DISCOVERY_WEIGHTS.aiTxt);
  });

  it("present at BOTH locations -> still exactly 3 points, not double-counted", async () => {
    mockFetch((url) => {
      if (url.includes("ai.txt")) return { status: 200, contentType: "text/plain" };
      return JSON_404();
    });
    const result = await checkAiDiscovery("example.com.au");
    expect(result.findings.aiTxtPresent).toBe(true);
    expect(result.score).toBe(AI_DISCOVERY_WEIGHTS.aiTxt);
  });

  it("absent at both locations -> 0, honest (the real Bondi shape)", async () => {
    mockFetch(() => JSON_404());
    const result = await checkAiDiscovery("bondiplumbing.com.au");
    expect(result.findings.aiTxtPresent).toBe(false);
    expect(result.findings.aiSummaryPresent).toBe(false);
    expect(result.findings.aiFaqPresent).toBe(false);
    expect(result.findings.aiServicePresent).toBe(false);
    expect(result.score).toBe(0);
  });

  it("a thrown fetch error still resolves to false, not an unhandled rejection", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));
    const result = await checkAiDiscovery("example.com.au");
    expect(result.score).toBe(0);
    expect(result.findings.aiTxtPresent).toBe(false);
  });
});
