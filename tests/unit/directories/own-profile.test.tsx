// @vitest-environment jsdom
/**
 * 13 Nov (Sri's walk-through, part 9): the AI cited Hero Home Services' own Localsearch page
 * (localsearch.com.au/profile/hero-home-services/...) while the audit said "Your profile: Not linked yet".
 * A cited page that is very likely the brand's own profile is offered ("This looks like your profile — link
 * it?"), linked only when the owner clicks, and the recommendation names it. A different business sharing
 * a word is never offered.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/hooks/use-safe-poll", () => ({
  pageNavigation: { reload: vi.fn(), assign: vi.fn() },
}));

import { DirectoriesCitedPanel } from "@/components/domain/audit/directories-cited-panel";
import { likelyOwnProfileUrl } from "@/lib/directories/own-profile";
import { findDirectoryByDomain } from "@/lib/directories/registry";
import { reportFindings } from "@/lib/reports/report-findings";
import { reportDataFixture } from "../../helpers/report-data-fixture";

const HERO = {
  name: "herohomeservices",
  domain: "herohomeservices.com.au",
  suburb: "Yennora",
  state: "NSW",
  postcode: "2161",
};
const LOCALSEARCH_PROFILE =
  "https://www.localsearch.com.au/profile/hero-home-services/yennora-nsw/hot-water-systems/1234567?utm_source=openai";
const localsearch = () => {
  const d = findDirectoryByDomain("localsearch.com.au");
  if (!d) throw new Error("no localsearch in the registry");
  return d;
};

describe("likelyOwnProfileUrl", () => {
  it("Hero's cited Localsearch page, without the tracking tag", () => {
    expect(likelyOwnProfileUrl(localsearch().profileUrlPattern, [LOCALSEARCH_PROFILE], HERO)).toBe(
      "https://www.localsearch.com.au/profile/hero-home-services/yennora-nsw/hot-water-systems/1234567",
    );
  });

  it.each([
    [
      "the name then its suburb",
      "https://www.localsearch.com.au/profile/hero-home-services-yennora",
    ],
    ["the name then its postcode", "https://www.localsearch.com.au/profile/herohomeservices_2161"],
    ["the stored name's own spacing", "https://www.localsearch.com.au/profile/HeroHomeServices"],
  ])("%s", (_how, url) => {
    expect(likelyOwnProfileUrl(localsearch().profileUrlPattern, [url], HERO)).not.toBeNull();
  });

  it.each([
    [
      "another business sharing a word",
      "https://www.localsearch.com.au/profile/hero-plumbing/yennora-nsw",
    ],
    [
      "a longer name containing it",
      "https://www.localsearch.com.au/profile/superhero-home-services",
    ],
    [
      "the name then another word",
      "https://www.localsearch.com.au/profile/hero-home-services-group/fairfield-nsw",
    ],
    ["another directory's page", "https://www.hipages.com.au/connect/hero-home-services"],
  ])("not offered: %s", (_how, url) => {
    expect(likelyOwnProfileUrl(localsearch().profileUrlPattern, [url], HERO)).toBeNull();
  });

  it("Omega Services isn't offered Gosford's 'Omega Plumbing', nor 'Omega' alone", () => {
    const omega = {
      name: "Omega Services",
      domain: "omegaservices.com.au",
      suburb: "Norwest",
      state: "NSW",
    };
    expect(
      likelyOwnProfileUrl(
        localsearch().profileUrlPattern,
        ["https://www.localsearch.com.au/profile/omega-plumbing/gosford-nsw"],
        omega,
      ),
    ).toBeNull();
    expect(
      likelyOwnProfileUrl(
        localsearch().profileUrlPattern,
        ["https://www.localsearch.com.au/profile/omega/norwest-nsw"],
        omega,
      ),
    ).toBeNull();
  });
});

describe("the audit page offers it, and links it only when the owner clicks", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const row = {
    key: "localsearch",
    name: "Localsearch",
    citedCount: 3,
    citedUrls: [
      {
        url: LOCALSEARCH_PROFILE,
        displayUrl:
          "localsearch.com.au/profile/hero-home-services/yennora-nsw/hot-water-systems/1234567",
      },
    ],
    ownerProfileLinked: false,
    ownerProfileCitedCount: 0,
    suggestedProfileUrl:
      "https://www.localsearch.com.au/profile/hero-home-services/yennora-nsw/hot-water-systems/1234567",
  };

  it("'This looks like your profile — link it?'; the click stores it through the listings check", async () => {
    render(<DirectoriesCitedPanel rows={[row]} totalAnswers={12} brandId="brand-1" />);
    expect(document.querySelector("[data-suggested-profile=localsearch]")).toHaveTextContent(
      "This looks like your profile — localsearch.com.au/profile/hero-home-services/yennora-nsw/hot-water-systems/1234567. Link it?",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Link it as my Localsearch profile" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/brands/brand-1/directory-listings");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      directoryKey: "localsearch",
      status: "listed",
      profileUrl: row.suggestedProfileUrl,
    });
    expect(await screen.findByText("Linked as your Localsearch profile.")).toBeInTheDocument();
  });

  it("not offered once a profile is linked", () => {
    render(
      <DirectoriesCitedPanel
        rows={[{ ...row, ownerProfileLinked: true }]}
        totalAnswers={12}
        brandId="brand-1"
      />,
    );
    expect(document.querySelector("[data-suggested-profile]")).toBeNull();
  });
});

describe("the recommendation names the page", () => {
  it("'Link your … profile' says which cited page looks like the brand's", () => {
    const data = reportDataFixture("39");
    data.directories.rows = data.directories.rows.map((r, i) =>
      i === 0
        ? { ...r, suggestedProfileUrl: "https://www.hipages.com.au/connect/omegaservices" }
        : r,
    );
    const finding = reportFindings(data).find((f) => f.rule === "a");
    expect(finding?.recommendation.detail).toContain(
      `AI cited what looks like yours: hipages.com.au/connect/omegaservices looks like your ${data.directories.rows[0].name} profile.`,
    );
  });
});
