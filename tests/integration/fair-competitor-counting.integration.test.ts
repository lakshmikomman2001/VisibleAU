/**
 * Fair competitor counting (7 Nov, Sri's decision 4) -- a competitor's mention counts in share of voice
 * only when it's verified by the same rule as the brand's own (lib/audit/verify-mention.ts): its own
 * website among the sources the answer cited. A competitor with no website can't be verified, so it's
 * left out of the share and named, never counted on a bare name match.
 *
 * The audit's 10 everyday answers: the brand verified in 2. Rivalto Plumbing (website set) is named in
 * 5: with its site cited (counted), with its www. address cited (counted), with only another site cited
 * (not), with its site only in an uncited search result (not), and with nothing cited (not). Commonname
 * Co (no website) is named in 3: never counted. So: 2 of 4 verified mentions, 50%.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type OverviewFixture, seedOverviewFixture } from "@/tests/helpers/overview-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const RIVALTO = "rivalto.example.com.au";
let client: ReturnType<typeof postgres>;
let fx: OverviewFixture;

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  fx = await seedOverviewFixture(client, {
    brands: [
      {
        name: "Alphaline Plumbing",
        competitors: ["Rivalto Plumbing", "Commonname Co"],
        competitorWebsites: { "Rivalto Plumbing": RIVALTO },
        audits: [
          {
            number: 7,
            createdAt: new Date(Date.now() - 60 * 60_000),
            answers: [
              { brand: "verified", names: ["Rivalto Plumbing"], cites: [RIVALTO] },
              { brand: "verified", names: ["Commonname Co"] },
              { names: ["Rivalto Plumbing"], cites: [`www.${RIVALTO}`] },
              { names: ["Rivalto Plumbing"], cites: ["hipages.com.au"] },
              { names: ["Rivalto Plumbing"], searchOnly: [RIVALTO] },
              { names: ["Rivalto Plumbing"] },
              { names: ["Commonname Co"], cites: ["commonname.example.com"] },
              { names: ["Commonname Co"] },
              {},
              {},
            ],
          },
        ],
      },
    ],
  });
}, 120_000);

afterAll(async () => {
  await fx?.cleanup();
  await client.end();
});

async function shareOfVoice() {
  const { db } = await import("@/db/client");
  const { latestCompleteAudit, shareOfVoiceForAudit } = await import(
    "@/lib/visibility/share-of-voice"
  );
  const brandId = fx.brandIds["Alphaline Plumbing"];
  return shareOfVoiceForAudit(
    db,
    {
      id: brandId,
      name: "Alphaline Plumbing",
      competitors: ["Rivalto Plumbing", "Commonname Co"],
      competitorWebsites: { "Rivalto Plumbing": RIVALTO },
    },
    await latestCompleteAudit(db, brandId),
  );
}

describe("fair competitor counting", () => {
  it("a competitor counts only where its own site was cited (www. included)", async () => {
    const sov = await shareOfVoice();
    expect(sov.competitors).toEqual([{ name: "Rivalto Plumbing", mentions: 2, sharePct: 50 }]);
    expect(sov).toMatchObject({
      state: "measured",
      brandMentions: 2,
      totalMentions: 4,
      sharePct: 50,
    });
  }, 120_000);

  it("a competitor with no website can't be verified: left out, and named", async () => {
    const sov = await shareOfVoice();
    expect(sov.unverifiable).toEqual(["Commonname Co"]);
    expect(sov.competitors.map((c) => c.name)).not.toContain("Commonname Co");
    const { sovLine } = await import("@/lib/visibility/share-of-voice");
    expect(sovLine(sov, fx.orgId)).toMatchObject({
      share: "50%",
      detail: "2 of 4 verified mentions",
      note: "1 competitor can't be verified: add its website in brand settings",
    });
  }, 120_000);

  it("with no competitor verifiable, there's no share, and it says how to fix it", async () => {
    const { db } = await import("@/db/client");
    const { latestCompleteAudit, shareOfVoiceForAudit, sovLine } = await import(
      "@/lib/visibility/share-of-voice"
    );
    const brandId = fx.brandIds["Alphaline Plumbing"];
    const sov = await shareOfVoiceForAudit(
      db,
      {
        id: brandId,
        name: "Alphaline Plumbing",
        competitors: ["Rivalto Plumbing", "Commonname Co"],
        competitorWebsites: {},
      },
      await latestCompleteAudit(db, brandId),
    );
    expect(sov).toMatchObject({ state: "no_verifiable_competitors", sharePct: null });
    expect(sovLine(sov, fx.orgId)).toMatchObject({
      share: null,
      detail: "2 competitors can't be verified: add their websites in brand settings",
      note: null,
    });
  }, 120_000);
});

describe("the brand and its competitors use the same rule", () => {
  it("the counter verifies competitors with verifyMention, the function that verifies the brand", () => {
    const counter = readFileSync("lib/audit/competitor-mentions.ts", "utf8");
    expect(counter).toMatch(/import \{ verifyMention \} from "@\/lib\/audit\/verify-mention"/);
    expect(counter).toMatch(/verifyMention\(\{/);
    const runner = readFileSync("lib/audit/run-audit-inline.ts", "utf8");
    expect(runner).toMatch(/verifyMention\(/);
  });

  it("the same evidence gives the same answer for either", async () => {
    const { verifyMention } = await import("@/lib/audit/verify-mention");
    const asOnlineOnly = (domain: string) => ({
      domain,
      suburb: null,
      city: null,
      state: null,
      locationConfirmedAt: null,
      locationMode: "online_only" as const,
    });
    const text = "Try Rivalto Plumbing or Alphaline Plumbing.";
    for (const [cited, expected] of [
      [[{ domain: RIVALTO }], "verified_domain"],
      [[{ domain: "hipages.com.au" }], "unverified"],
      [[{ domain: RIVALTO, cited: false as const }], "unverified"],
    ] as const) {
      expect(
        verifyMention({
          matchIndex: 4,
          responseText: text,
          citedSources: [...cited],
          brand: asOnlineOnly(RIVALTO),
        }),
      ).toBe(expected);
    }
  });
});
