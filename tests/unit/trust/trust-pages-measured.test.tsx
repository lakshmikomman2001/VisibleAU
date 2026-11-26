// @vitest-environment jsdom
/**
 * 17 Nov, part 3 -- the Trust pages show only what was measured, say when, and say so when they couldn't load.
 * - Evidence Archive: no "Sentiment: +N%" (from citations.sentiment_score, which nothing writes); not
 *   "Immutable snapshots" (nothing makes them immutable); answers to questions that named the business are
 *   marked; a failed load says so instead of "No AI responses have been recorded".
 * - Citation Sources: names the audit its figures come from; a failed load says so.
 * - Entity Score: a skipped ABN lookup is "Not checked", not a red "Not verified"; a Wikipedia lookup that
 *   didn't complete is "Couldn't check"; the page says when the facts were checked.
 * - YouTube: a count the channel doesn't show is "Not shown", never 0.
 * - Overall Trust Score: says when each check ran and why one isn't in the score.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PlanTierProvider } from "@/components/domain/plan-tier-context";
import { EntityAuthorityGrid } from "@/components/domain/trust/entity-authority-grid";
import { EvidenceSnapshotRow } from "@/components/domain/trust/evidence-snapshot-row";
import { TrustScoreCard } from "@/components/domain/trust/trust-score-card";
import { YoutubePresenceScorecard } from "@/components/domain/trust/youtube-presence-scorecard";

const BRAND = "22222222-2222-4222-8222-222222222222";
const API = `/api/brands/${BRAND}`;

vi.mock("next/navigation", () => ({
  useParams: () => ({ brandId: BRAND }),
  usePathname: () => `/brands/${BRAND}/trust`,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function stubFetch(answer: (url: string) => Response | undefined) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (input: RequestInfo | URL) =>
        answer(String(input)) ?? Response.json({ error: "Database unavailable" }, { status: 500 }),
    ),
  );
}

const onAgencyPlan = (node: ReactNode) =>
  render(<PlanTierProvider tier="agency">{node}</PlanTierProvider>);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeAll(async () => {
  await Promise.all([
    import("@/app/(auth)/brands/[brandId]/trust/evidence/page"),
    import("@/app/(auth)/brands/[brandId]/trust/citation-sources/page"),
    import("@/app/(auth)/brands/[brandId]/trust/entity-score/page"),
  ]);
}, 120_000);

// An archived answer as the evidence route sends it (evidence_snapshots + the citations match).
const SNAPSHOT = {
  id: "s1",
  engine: "chatgpt",
  prompt: "Is Galah Plumbing reputable?",
  rawResponse: "Galah Plumbing has good reviews on Google and hipages.",
  capturedAt: "2026-11-14T23:30:00.000Z",
  askedByName: true,
};

describe("Evidence Archive", () => {
  it("an archived answer shows no sentiment figure, and is marked when the question named the business", () => {
    render(<EvidenceSnapshotRow snapshot={SNAPSHOT} />);
    expect(screen.queryByText(/Sentiment/)).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(screen.getByText("Question named the business")).toBeInTheDocument();
    expect(screen.getByText("15 Nov 2026")).toBeInTheDocument();
  });

  it("an everyday question's answer has no mark", () => {
    render(<EvidenceSnapshotRow snapshot={{ ...SNAPSHOT, askedByName: false }} />);
    expect(screen.queryByText("Question named the business")).not.toBeInTheDocument();
  });

  it("a failed load says so, never 'No AI responses have been recorded'", async () => {
    stubFetch(() => undefined);
    const { default: Page } = await import("@/app/(auth)/brands/[brandId]/trust/evidence/page");
    onAgencyPlan(<Page />);
    expect(await screen.findByText("Couldn't load your evidence archive.")).toBeInTheDocument();
    expect(screen.getByText("Database unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/No AI responses have been recorded/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Not enough AI coverage/)).not.toBeInTheDocument();
  });

  it("says what the archive keeps, never 'immutable'", async () => {
    stubFetch((url) =>
      url === `${API}/evidence` ? Response.json({ snapshots: [], citationCount: 12 }) : undefined,
    );
    const { default: Page } = await import("@/app/(auth)/brands/[brandId]/trust/evidence/page");
    onAgencyPlan(<Page />);
    expect(await screen.findByText("No answers archived yet")).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/For each audit we keep the first 500 characters/);
    expect(document.body.textContent).not.toMatch(/immutable/i);
  });
});

describe("Citation Sources", () => {
  it("names the audit its figures come from", async () => {
    stubFetch((url) =>
      url === `${API}/citation-sources`
        ? Response.json({
            audit: { auditNumber: 50, completedAt: "2026-11-14T23:30:00.000Z" },
            categories: [],
            enginesWithoutCitations: [
              { id: "gemini::__no_citations__", engine: "gemini", answerCount: 10 },
            ],
            citationCount: 40,
          })
        : undefined,
    );
    const { default: Page } = await import(
      "@/app/(auth)/brands/[brandId]/trust/citation-sources/page"
    );
    onAgencyPlan(<Page />);
    expect(await screen.findByText("From audit #50, completed 15 Nov 2026.")).toBeInTheDocument();
    expect(screen.getByText("Gemini cited no sources in 10 answers.")).toBeInTheDocument();
  });

  it("a failed load says so, never 'No AI responses have been recorded'", async () => {
    stubFetch(() => undefined);
    const { default: Page } = await import(
      "@/app/(auth)/brands/[brandId]/trust/citation-sources/page"
    );
    onAgencyPlan(<Page />);
    expect(await screen.findByText("Couldn't load your citation sources.")).toBeInTheDocument();
    expect(screen.queryByText(/No AI responses have been recorded/)).not.toBeInTheDocument();
  });
});

describe("Entity Score", () => {
  const ROW = {
    abnVerified: false,
    abnNumber: "51824753556",
    abnEntityName: null,
    abnStatus: "check_skipped",
    wikipediaAuPresent: false,
    wikipediaAuUrl: null,
    wikipediaAuStatus: null,
  };
  const signal = (label: string) => screen.getByText(label).closest("div")?.parentElement;

  it("a skipped ABN lookup is a neutral 'Not checked', never a red 'Not verified'", () => {
    render(<EntityAuthorityGrid data={ROW} />);
    expect(screen.getByText("Not checked")).toHaveAttribute("data-signal-ok", "neutral");
    expect(screen.queryByText("Not verified")).not.toBeInTheDocument();
  });

  it("an ABN the registry answered for but didn't verify stays 'Not verified', with its status", () => {
    render(<EntityAuthorityGrid data={{ ...ROW, abnStatus: "Cancelled" }} />);
    expect(screen.getByText("Not verified")).toHaveAttribute("data-signal-ok", "false");
    expect(signal("ABN Registry")?.textContent).toContain("registry status: Cancelled");
  });

  it("Wikipedia: 'Couldn't check' when the lookup didn't complete; 'Not found' only when it did", () => {
    render(<EntityAuthorityGrid data={{ ...ROW, wikipediaAuStatus: "unavailable" }} />);
    expect(screen.getByText("Couldn't check")).toHaveAttribute("data-signal-ok", "neutral");
    cleanup();
    render(<EntityAuthorityGrid data={{ ...ROW, wikipediaAuStatus: "not_found" }} />);
    expect(screen.getByText("Not found")).toHaveAttribute("data-signal-ok", "false");
    cleanup();
    // Not recorded (an audit from before the lookup's state was kept): it can't say which.
    render(<EntityAuthorityGrid data={ROW} />);
    expect(screen.getByText("None found")).toHaveAttribute("data-signal-ok", "neutral");
    expect(screen.queryByText("Not found")).not.toBeInTheDocument();
  });

  it("the page says when the facts were checked and where the check runs from", async () => {
    stubFetch((url) =>
      url === `${API}/entity-score`
        ? Response.json({
            ...ROW,
            scoreOf10: "2.00",
            displayScore: 25,
            scoreBasis: "Based on: ABN not checked, .au domain, no Wikipedia AU article found",
            knowledgePanelPresent: null,
            knowledgePanelAccurate: null,
            knowledgePanelUrl: null,
            knowledgePanelImplemented: false,
            wikidataEntryPresent: null,
            wikidataEntryUrl: null,
            wikidataImplemented: false,
            auDirectoryPresence: null,
            rationale:
              "Galah Plumbing's entity authority score of 25/100 highlights significant gaps.",
            confidence_label: "High",
            scoreLevel: "Low",
            top_action: null,
            checkedAt: "2026-11-14T23:30:00.000Z",
          })
        : undefined,
    );
    const { default: Page } = await import("@/app/(auth)/brands/[brandId]/trust/entity-score/page");
    onAgencyPlan(<Page />);
    const checked = await screen.findByText(
      "Checked 15 Nov 2026. The entity check runs with each audit you start.",
    );
    expect(checked).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Updates with each full audit/);
  });
});

describe("YouTube Presence scorecard", () => {
  it("a count the channel doesn't show is 'Not shown', never 0", () => {
    render(
      <YoutubePresenceScorecard
        data={{
          presenceScore: 57,
          channelExists: true,
          channelSubscriberCount: null,
          channelTotalVideos: 24,
          lastUploadAt: null,
          rationale:
            "Galah Plumbing's YouTube presence score of 57/100 shows moderate performance.",
          confidence_label: null,
          scoreLevel: "Medium",
          top_action: null,
        }}
      />,
    );
    expect(screen.getByText("Not shown")).toBeInTheDocument();
    expect(screen.getByText("24")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});

describe("Overall Trust Score card", () => {
  it("shows when each check ran and why one isn't in the score, in either state", () => {
    const notes = [
      "Entity check: 15 Nov 2026.",
      "YouTube check: 3 Nov 2026. It found no channel we could confirm as this business's, so YouTube isn't in the score.",
    ];
    render(
      <TrustScoreCard
        label="Overall Trust Score"
        score={25}
        basis="Based on: Entity 25/100"
        maxScore={100}
        rationale="Galah Plumbing's trust score of 25/100 highlights significant gaps."
        confidenceLabel={null}
        notes={notes}
      />,
    );
    for (const note of notes) expect(screen.getByText(note)).toBeInTheDocument();
    cleanup();
    render(
      <TrustScoreCard
        label="Overall Trust Score"
        score={null}
        maxScore={100}
        rationale="Not measured"
        confidenceLabel={null}
        insufficientData
        notes={notes}
      />,
    );
    for (const note of notes) expect(screen.getByText(note)).toBeInTheDocument();
  });
});
