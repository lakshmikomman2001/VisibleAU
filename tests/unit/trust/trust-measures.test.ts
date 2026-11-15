/**
 * 17 Nov, part 3 -- the Trust figures are what was measured, by the audit page's definitions.
 * - Citation Sources "Covered": a mention counts only as the audit counts it (brand_mentioned AND
 *   mention_verification IS DISTINCT FROM 'unverified'); the page's view is the latest complete audit's own
 *   everyday answers, named by audit.
 * - YouTube: a "not_found" check has no presence score and stays out of the Overall Trust Score; a count the
 *   channel hides is null (never 0), left out of the score, never "Only 0 subscribers".
 * - Explainability: no "top tier" claim (nothing benchmarks a score against other brands).
 * - Overall Trust Score notes: when each check ran, and why one isn't in the score.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DbClient } from "@/db/client";
import { ExplainabilityService } from "@/lib/platform/explainability";
import {
  computeCitationSourceGroups,
  getLatestAuditCitationSources,
  isCountedMention,
} from "@/lib/trust/citation-intelligence";
import { trustScoreNotes } from "@/lib/trust/trust-notes";
import { scoreYoutubePresenceFromChannel } from "@/lib/trust/youtube-auditor";
import { checkYoutubePresence, parseYoutubeCount } from "@/lib/trust/youtube-channel-lookup";
import { buildYoutubePresenceAuditRow } from "@/lib/trust/youtube-presence-check";

const HIPAGES = [{ domain: "hipages.com.au", url: "https://hipages.com.au/connect/bondiplumbing" }];

describe("isCountedMention -- the audit page's mention (EXCLUDE_UNVERIFIED)", () => {
  it("a verified mention and a legacy row (no verification recorded) count; an unverified name match doesn't", () => {
    expect(
      isCountedMention({ brandMentioned: true, mentionVerification: "verified_location" }),
    ).toBe(true);
    expect(isCountedMention({ brandMentioned: true, mentionVerification: null })).toBe(true);
    expect(isCountedMention({ brandMentioned: true, mentionVerification: "unverified" })).toBe(
      false,
    );
    expect(
      isCountedMention({ brandMentioned: false, mentionVerification: "verified_domain" }),
    ).toBe(false);
  });
});

describe("computeCitationSourceGroups -- 'Covered' only for a mention the audit counts", () => {
  it("an unverified name match in an answer citing hipages leaves hipages a gap, not 'Covered'", () => {
    const [group] = computeCitationSourceGroups(
      [
        {
          engine: "chatgpt",
          citedSources: HIPAGES,
          brandMentioned: true,
          mentionVerification: "unverified",
        },
      ],
      "bondiplumbing.com.au",
      "audit-50",
    );
    expect(group.sourceType).toBe("au_directory");
    expect(group.brandPresentInSource).toBe(false);
    expect(group.gapSeverity).toBe("critical"); // 100% of this engine's citations, brand not present
  });

  it("the same answer with a verified mention is 'Covered'", () => {
    const [group] = computeCitationSourceGroups(
      [
        {
          engine: "chatgpt",
          citedSources: HIPAGES,
          brandMentioned: true,
          mentionVerification: "verified_location",
        },
      ],
      "bondiplumbing.com.au",
      "audit-50",
    );
    expect(group.brandPresentInSource).toBe(true);
    expect(group.gapSeverity).toBe("covered");
  });
});

interface Chain extends Promise<unknown[]> {
  from(): Chain;
  where(): Chain;
  orderBy(): Chain;
  limit(): Promise<unknown[]>;
}

/** A transaction whose selects answer `results` in order (the audit, the brand, the citations). */
function txAnswering(results: unknown[][]): DbClient {
  let call = 0;
  const select = () => {
    const result = results[call++] ?? [];
    const chain: Chain = Object.assign(Promise.resolve(result), {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => Promise.resolve(result),
    });
    return chain;
  };
  return { select } as unknown as DbClient;
}

describe("getLatestAuditCitationSources -- the latest complete audit's own answers, named", () => {
  it("no complete audit: nothing to show, and no stored rows read", async () => {
    const result = await getLatestAuditCitationSources(txAnswering([[]]), "brand-1");
    expect(result).toEqual({ audit: null, categories: [], enginesWithoutCitations: [] });
  });

  it("names the audit, groups its answers by the audit's mention rule, and lists engines that cited nothing", async () => {
    const completedAt = new Date("2026-11-14T23:30:00Z");
    const result = await getLatestAuditCitationSources(
      txAnswering([
        [{ id: "audit-50", auditNumber: 50, completedAt }],
        [{ domain: "bondiplumbing.com.au" }],
        [
          {
            engine: "chatgpt",
            citedSources: HIPAGES,
            brandMentioned: true,
            mentionVerification: "unverified",
          },
          { engine: "gemini", citedSources: [], brandMentioned: false, mentionVerification: null },
        ],
      ]),
      "brand-1",
    );
    expect(result.audit).toEqual({ id: "audit-50", auditNumber: 50, completedAt });
    expect(result.categories).toHaveLength(1);
    expect(result.categories[0]).toMatchObject({
      id: "chatgpt::au_directory",
      sourceType: "au_directory",
      citationCount: 1,
      citationShare: 100,
      brandPresentInSource: false,
    });
    expect(result.enginesWithoutCitations).toEqual([
      { id: "gemini::__no_citations__", engine: "gemini", answerCount: 1 },
    ]);
  });
});

describe("YouTube -- not found isn't a measured 0, and a hidden count isn't 0", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("parseYoutubeCount: a numeric string is a count; a missing or odd value is null, never 0", () => {
    expect(parseYoutubeCount("1200")).toBe(1200);
    expect(parseYoutubeCount("0")).toBe(0);
    expect(parseYoutubeCount(undefined)).toBeNull();
    expect(parseYoutubeCount("")).toBeNull();
    expect(parseYoutubeCount("n/a")).toBeNull();
  });

  it("a hidden subscriber count is left out of the score (scaled to what was measured), with no 'Only 0 subscribers'", () => {
    const result = scoreYoutubePresenceFromChannel({
      channelExists: true,
      subscriberCount: null,
      videoCount: 25,
      daysSinceLastUpload: 10,
    });
    // 10 + 30 + 30 = 70 of a possible 70 (exists, videos, recency) -> 100, not 70/100 with audience scored 0.
    expect(result.presenceScore).toBe(100);
    expect(result.gaps.join(" ")).not.toMatch(/Only 0 subscribers/);
    expect(result.gaps).toContain(
      "The channel hides its subscriber count, so audience size isn't part of this score.",
    );
  });

  it("with every count shown the score is exactly as before", () => {
    expect(
      scoreYoutubePresenceFromChannel({
        channelExists: true,
        subscriberCount: 500,
        videoCount: 15,
        daysSinceLastUpload: 30,
      }).presenceScore,
    ).toBe(70);
  });

  it("a channel that hides its subscribers comes back with subscriberCount null", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: "UC_hidden",
                snippet: { title: "Bondi Plumbing", description: "" },
                statistics: { hiddenSubscriberCount: true, videoCount: "12" },
                contentDetails: { relatedPlaylists: { uploads: "UU_hidden" } },
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })));

    const outcome = await checkYoutubePresence(
      "Bondi Plumbing",
      "bondiplumbing.com.au",
      "https://www.youtube.com/channel/UC_hidden",
    );
    expect(outcome.status).toBe("confirmed");
    if (outcome.status !== "confirmed") return;
    expect(outcome.channel.subscriberCount).toBeNull();
    expect(outcome.channel.videoCount).toBe(12);
  });

  it("a not_found check is stored with no presence score (it was 0, averaged in as a measured 0)", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [] })),
    );

    const row = await buildYoutubePresenceAuditRow("Bondi Plumbing", "bondiplumbing.com.au");
    expect(row.checkStatus).toBe("not_found");
    expect(row.presenceScore).toBeNull();
    expect(row.gaps[0]).toMatch(/No YouTube channel found/);
  });
});

describe("ExplainabilityService -- no comparison with other brands nothing measured", () => {
  it("a score of 80+ is strong on what it measures, never 'top tier'", () => {
    const { rationale } = ExplainabilityService.annotate({
      score: 85,
      scoreLabel: "Trust",
      maxScore: 100,
      context: { brandName: "Bondi Plumbing", dimension: "trust" },
    });
    expect(rationale).toBe(
      "Bondi Plumbing's trust score of 85/100 is strong on the signals it measures.",
    );
    expect(rationale).not.toMatch(/top tier/i);
  });
});

describe("trustScoreNotes -- when each check ran, and why one isn't in the score", () => {
  const checked = new Date("2026-11-14T23:30:00Z"); // 15 Nov in Sydney
  const youtubeChecked = new Date("2026-11-03T03:00:00Z"); // 3 Nov in Sydney

  it("a YouTube check that found no channel says so, and that YouTube isn't in the score", () => {
    expect(
      trustScoreNotes({
        entityScore: 25,
        entityCheckedAt: checked,
        youtubePresenceScore: null,
        youtubeCheckStatus: "not_found",
        youtubeCheckedAt: youtubeChecked,
      }),
    ).toEqual([
      "Entity check: 15 Nov 2026.",
      "YouTube check: 3 Nov 2026. It found no channel we could confirm as this business's, so YouTube isn't in the score.",
    ]);
  });

  it("checks never run say where they run from: each audit you start; monthly, or Refresh", () => {
    expect(
      trustScoreNotes({
        entityScore: null,
        entityCheckedAt: null,
        youtubePresenceScore: null,
        youtubeCheckStatus: null,
        youtubeCheckedAt: null,
      }),
    ).toEqual([
      "Entity check: not run yet. It runs with each audit you start.",
      "YouTube check: not run yet. It runs each month, or from Refresh on the YouTube Presence page.",
    ]);
  });

  it("a confirmed YouTube score is just dated", () => {
    expect(
      trustScoreNotes({
        entityScore: 25,
        entityCheckedAt: checked,
        youtubePresenceScore: 70,
        youtubeCheckStatus: "confirmed",
        youtubeCheckedAt: youtubeChecked,
      })[1],
    ).toBe("YouTube check: 3 Nov 2026.");
  });
});
