// @vitest-environment jsdom
/**
 * S04 part 0a (LLD amendment 84; contract v1.9 P02.regenBanner): what a person sees when a regeneration kept the set
 * they applied.
 * - The Questions page: the neutral banner "Your business details changed after these questions were set. Review the
 *   suggestions." under the legend, above the lists; "Review suggestions" moves focus to the Suggestions heading; no
 *   banner without the flag in the view; on a plan with no suggestions (Free) the banner has no button.
 * - A regenerated suggestion that names the business carries its pill, in view mode and in edit mode; in edit mode
 *   it's added to "Names your business", and an everyday row swaps only for an everyday suggestion.
 * - Brand settings: a save answered "questions_kept" reads "Saved. Your questions didn't change: review the new
 *   suggestions in Questions." with the link (useSave + SaveFeedback); the location card tells the page the same.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/brands",
  useSearchParams: () => new URLSearchParams(),
}));

import { LocationConfirmCard } from "@/components/domain/brand/location-confirm-card";
import { QuestionEditor } from "@/components/domain/questions/question-editor";
import { type QuestionsResponse, QuestionsTab } from "@/components/domain/questions/questions-tab";
import { SaveFeedback, useSave } from "@/components/shared/save-feedback";

const BRAND = "6f1c0e2a-4b7d-4c1e-9a52-3d8e7f6a1b20";
const ALL = ["chatgpt", "claude", "gemini", "perplexity"];
const BANNER =
  "Your business details changed after these questions were set. Review the suggestions.";

function body(over: Partial<QuestionsResponse> = {}): QuestionsResponse {
  const everyday = Array.from({ length: 6 }, (_, i) => ({
    id: `00000000-0000-4000-8000-00000000000${i}`,
    position: i,
    text: `Who is the best plumber in Bilby Creek, number ${i + 1}?`,
    kind: "everyday" as const,
    reach: "local" as const,
    source: "agency" as const,
    serviceLabel: null,
    intent: null,
    lastResult: null,
  }));
  return {
    set: {
      id: "set-2",
      version: 2,
      appliedAt: "2026-11-27T01:00:00.000Z",
      appliedBy: "Owner",
      original: false,
      comparingSinceAudit: null,
    },
    questions: [
      ...everyday,
      {
        ...everyday[0],
        id: "00000000-0000-4000-8000-000000000009",
        position: 6,
        text: "Is Bilby Plumbing a good plumber in Bilby Creek?",
        kind: "branded",
        source: "original",
      },
    ],
    lastAudit: null,
    history: [],
    library: [],
    suggestions: [
      {
        id: "s-everyday",
        text: "Who clears blocked drains in Lidcombe?",
        serviceLabel: null,
        source: "template",
        kind: "everyday",
      },
      {
        id: "s-branded",
        text: "Is Bilby Plumbing Co a good choice for a plumber in Lidcombe?",
        serviceLabel: null,
        source: "template",
        kind: "branded",
      },
    ],
    regeneratedSuggestions: true,
    agencyName: "Possum Marketing",
    brandName: "Bilby Plumbing Co",
    limits: {
      plan: "agency",
      engines: ALL,
      suggestionsShown: true,
      canEdit: true,
      editable: false,
      everydayAllowed: 10,
      everydayMin: 5,
      maxBranded: 5,
      canWriteQuestions: true,
    },
    ...over,
  };
}

let answers: Array<() => Response>;
beforeAll(async () => {
  // The first jsdom render here can take seconds (project_jsdom_first_render_timeout): warm up once.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body()), { status: 200 })),
  );
  const { unmount } = render(<QuestionsTab brandId={BRAND} />);
  await screen.findByTestId("p02-header", {}, { timeout: 15_000 });
  unmount();
}, 30_000);
beforeEach(() => {
  answers = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      (answers.shift() ?? (() => new Response(JSON.stringify(body()), { status: 200 })))(),
    ),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

async function shown(b: QuestionsResponse) {
  answers.push(() => new Response(JSON.stringify(b), { status: 200 }));
  render(<QuestionsTab brandId={BRAND} />);
  await screen.findByTestId("p02-header");
}

describe("the Questions page's regeneration banner (P02.regenBanner)", () => {
  it("shows above the lists, and Review suggestions moves focus to the Suggestions heading", async () => {
    await shown(body());
    const banner = screen.getByTestId("p02-regen-banner");
    expect(banner).toHaveTextContent(BANNER);
    // Under the intro (and the legend when shown), above the first list.
    const section = screen.getByTestId("p02-section-local");
    expect(
      screen.getByTestId("p02-intro").compareDocumentPosition(banner) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(banner.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(within(banner).getByRole("button", { name: "Review suggestions" }));
    expect(screen.getByRole("heading", { name: "Suggestions" })).toHaveFocus();
  });

  it("isn't there when no regeneration added suggestions after the set", async () => {
    await shown(body({ regeneratedSuggestions: false }));
    expect(screen.queryByTestId("p02-regen-banner")).not.toBeInTheDocument();
    expect(screen.queryByText(BANNER)).not.toBeInTheDocument();
  });

  it("on a plan without suggestions (Free) it has no button", async () => {
    await shown(
      body({
        suggestions: [],
        limits: { ...body().limits, plan: "free", suggestionsShown: false },
      }),
    );
    expect(screen.getByTestId("p02-regen-banner")).toHaveTextContent(BANNER);
    expect(screen.queryByRole("button", { name: "Review suggestions" })).not.toBeInTheDocument();
  });

  it("a regenerated suggestion that names the business carries its pill", async () => {
    await shown(body());
    const list = screen.getByTestId("p02-suggestions");
    const row = within(list)
      .getByText("Is Bilby Plumbing Co a good choice for a plumber in Lidcombe?")
      .closest("li") as HTMLElement;
    expect(within(row).getByText("Names your business · not scored")).toBeInTheDocument();
  });
});

describe("edit mode with a suggestion that names the business", () => {
  function editor() {
    const view = body({ limits: { ...body().limits, editable: true } });
    render(
      <QuestionEditor
        brandId={BRAND}
        view={view}
        restored={null}
        onClose={() => undefined}
        onApplied={() => undefined}
        onReload={() => undefined}
      />,
    );
    return view;
  }

  it("Add puts it under Names your business", async () => {
    editor();
    const list = screen.getByTestId("p02-suggestions");
    fireEvent.click(
      within(list).getByRole("button", {
        name: "Add: Is Bilby Plumbing Co a good choice for a plumber in Lidcombe?",
      }),
    );
    const branded = screen.getByTestId("p02-section-branded");
    expect(
      within(branded).getByText("Is Bilby Plumbing Co a good choice for a plumber in Lidcombe?"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("p02-section-local")).queryByText(
        "Is Bilby Plumbing Co a good choice for a plumber in Lidcombe?",
      ),
    ).not.toBeInTheDocument();
  });

  it("an everyday row swaps only for an everyday suggestion", async () => {
    editor();
    const first = within(screen.getByTestId("p02-section-local")).getAllByTestId("p02-row")[0];
    fireEvent.click(within(first).getByTestId("p02-row-more"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Swap for a suggestion" }));
    expect(
      within(first).getByRole("button", { name: "Who clears blocked drains in Lidcombe?" }),
    ).toBeInTheDocument();
    expect(
      within(first).queryByRole("button", {
        name: "Is Bilby Plumbing Co a good choice for a plumber in Lidcombe?",
      }),
    ).not.toBeInTheDocument();
  });
});

describe("brand settings after a save that kept the questions", () => {
  function SaveHarness({ href }: { href?: string }) {
    const save = useSave(`/api/brands/${BRAND}`, { method: "PATCH" });
    return (
      <div>
        <button type="button" onClick={() => void save.save({ name: "Bilby Plumbing Co" })}>
          Save
        </button>
        <SaveFeedback status={save.status} error={save.error} questionsHref={href} />
      </div>
    );
  }

  it('a "questions_kept" answer reads the sentence, with the link to Questions', async () => {
    answers.push(
      () => new Response(JSON.stringify({ brand: {}, status: "questions_kept" }), { status: 200 }),
    );
    render(<SaveHarness href={`/brands/${BRAND}/questions`} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    const status = await screen.findByTestId("questions-kept-status");
    expect(status).toHaveTextContent(
      "Saved. Your questions didn't change: review the new suggestions in Questions.",
    );
    expect(
      within(status).getByRole("link", { name: "review the new suggestions in Questions" }),
    ).toHaveAttribute("href", `/brands/${BRAND}/questions`);
  });

  it("any other save still reads Saved", async () => {
    answers.push(() => new Response(JSON.stringify({ brand: {} }), { status: 200 }));
    render(<SaveHarness href={`/brands/${BRAND}/questions`} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(screen.queryByTestId("questions-kept-status")).not.toBeInTheDocument();
  });

  it("the location card tells the page when its save kept the questions", async () => {
    answers.push(
      () => new Response(JSON.stringify({ brand: {}, status: "questions_kept" }), { status: 200 }),
    );
    const kept = vi.fn();
    render(
      <LocationConfirmCard
        brandId={BRAND}
        currentPrimaryRegion="NSW:Chatswood"
        isLegacyDefaultRegion={false}
        onClose={() => undefined}
        onQuestionsKept={kept}
      />,
    );
    fireEvent.change(screen.getByLabelText("Postcode"), { target: { value: "2141" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(kept).toHaveBeenCalledTimes(1));
  });
});
