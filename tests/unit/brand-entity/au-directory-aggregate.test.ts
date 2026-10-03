/**
 * ⚠️ KK — a directory check must distinguish "blocked" (403/401/429/
 * network error/timeout) from "not listed" (404, or a 200 page that
 * genuinely doesn't mention the brand). Task JJ found the old
 * implementation treated ANY successful page load (200/301/302) as
 * "present", with no check that the brand was actually on the page --
 * and on live data, Yellow Pages AU and Word of Mouth 403'd Bondi
 * Plumbing's check, which would have been silently scored "not listed"
 * even though we have zero evidence either way.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AU_DIRECTORIES,
  checkAuDirectories,
  checkDirectory,
} from "@/lib/brand-entity/au-directory-aggregate";

const HIPAGES = AU_DIRECTORIES[0];

function mockFetchOnce(status: number, body = "") {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(body, { status }));
}

describe("⚠️ KK — checkDirectory: three states, not two", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("403 -> unverifiable, 'blocked the check', never 'not listed'", async () => {
    mockFetchOnce(403);
    const result = await checkDirectory(HIPAGES, "Bondi Plumbing");
    expect(result.status).toBe("unverifiable");
    expect(result.present).toBe(false);
    expect(result.finding).toMatch(/couldn't verify/i);
    expect(result.finding).toMatch(/blocked the check/i);
    expect(result.finding.toLowerCase()).not.toContain("not found");
  });

  it("401 and 429 are also unverifiable, not not-listed", async () => {
    for (const status of [401, 429]) {
      mockFetchOnce(status);
      const result = await checkDirectory(HIPAGES, "Bondi Plumbing");
      expect(result.status).toBe("unverifiable");
      expect(result.present).toBe(false);
    }
  });

  it("a genuine 404 -> not_listed, honest 'not found' text", async () => {
    mockFetchOnce(404);
    const result = await checkDirectory(HIPAGES, "Bondi Plumbing");
    expect(result.status).toBe("not_listed");
    expect(result.present).toBe(false);
    expect(result.finding).toMatch(/not found/i);
  });

  it("200 with the brand's name in the body -> listed, present=true", async () => {
    mockFetchOnce(200, "<html>Results for Bondi Plumbing: 5 reviews</html>");
    const result = await checkDirectory(HIPAGES, "Bondi Plumbing");
    expect(result.status).toBe("listed");
    expect(result.present).toBe(true);
    expect(result.url).toBeTruthy();
  });

  it("200 but the brand's name is NOT in the body (a 'no results' page) -> not_listed", async () => {
    mockFetchOnce(200, "<html>No results found for your search.</html>");
    const result = await checkDirectory(HIPAGES, "Bondi Plumbing");
    expect(result.status).toBe("not_listed");
    expect(result.present).toBe(false);
  });

  it("a thrown error (network failure / timeout) -> unverifiable, not not-listed", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network error"));
    const result = await checkDirectory(HIPAGES, "Bondi Plumbing");
    expect(result.status).toBe("unverifiable");
    expect(result.present).toBe(false);
    expect(result.finding.toLowerCase()).not.toContain("not found");
  });

  it("uses a realistic browser User-Agent, not a bot-identifying one", async () => {
    mockFetchOnce(200, "Bondi Plumbing");
    await checkDirectory(HIPAGES, "Bondi Plumbing");
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls[0];
    const ua = (init as RequestInit).headers as Record<string, string>;
    expect(ua["User-Agent"]).toMatch(/Mozilla.*Chrome/);
    expect(ua["User-Agent"]).not.toMatch(/bot/i);
  });
});

describe("⚠️ KK — checkAuDirectories: unverifiable contributes 0, same as not-listed", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("REGRESSION — Bondi's real mix (two 403s, two 404s) -> auDirectoryCount 0, same as before; only finding text changes", async () => {
    let call = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      call++;
      // Mirrors task JJ's live findings: Hipages 404, Yellow Pages 403,
      // ServiceSeeking 404, Word of Mouth 403.
      const statuses = [404, 403, 404, 403];
      return new Response("", { status: statuses[(call - 1) % 4] });
    });

    const result = await checkAuDirectories("Bondi Plumbing");

    expect(result.auDirectoryCount).toBe(0); // byte-identical to pre-fix
    const statuses = result.auDirectoryPresence.map((p) => p.status);
    expect(statuses).toContain("not_listed");
    expect(statuses).toContain("unverifiable");
    // The 403 entries must never claim "not listed".
    const blockedEntries = result.auDirectoryPresence.filter((p) => p.status === "unverifiable");
    for (const entry of blockedEntries) {
      expect(entry.finding.toLowerCase()).not.toContain("not found");
      expect(entry.finding.toLowerCase()).toContain("blocked");
    }
  });
});
