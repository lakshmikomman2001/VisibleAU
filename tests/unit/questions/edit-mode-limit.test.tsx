// @vitest-environment jsdom
/**
 * S04 part 0c (LLD amendment 96; contract v1.9 P02 interactions, P02.suggestions, P02.addQuestion): the Questions
 * page's edit mode.
 * - "Keep your draft?" only when the kept draft differs from the current set: an unchanged one is dropped silently
 *   (live it asked, with "No changes yet"), and the page stays in view mode.
 * - At the plan's limit (10 of 10): the suggestions' Add and "+ Add question" are disabled, with "Your plan includes
 *   10 everyday questions per brand. Remove one, or add a question pack." as their tooltip and as a help line under
 *   the everyday list; Swap and Remove still work, and removing one turns Add back on. A suggestion that names the
 *   business is off at the 5 that may.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/brands",
  useSearchParams: () => new URLSearchParams(),
}));

import { initialDraft, QuestionEditor } from "@/components/domain/questions/question-editor";
import { type QuestionsResponse, QuestionsTab } from "@/components/domain/questions/questions-tab";

const BRAND = "6f1c0e2a-4b7d-4c1e-9a52-3d8e7f6a1b20";
const LIMIT =
  "Your plan includes 10 everyday questions per brand. Remove one, or add a question pack.";
const BRANDED_FULL = "Already 5 questions name your business. Remove one first.";

function q(i: number, kind: "everyday" | "branded" = "everyday") {
  return {
    id: `00000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`,
    position: i,
    text:
      kind === "everyday"
        ? `Who is the best plumber in Wollongong, job number ${i + 1}?`
        : `Is Bluegum Plumbing good for job number ${i + 1}?`,
    kind,
    reach: "local" as const,
    source: "original" as const,
    serviceLabel: null,
    intent: null,
    lastResult: null,
  };
}

function view(everyday: number, branded = 3): QuestionsResponse {
  return {
    set: {
      id: "set-1",
      version: 1,
      appliedAt: "2026-11-20T01:00:00.000Z",
      appliedBy: null,
      original: true,
      comparingSinceAudit: null,
    },
    questions: [
      ...Array.from({ length: everyday }, (_, i) => q(i)),
      ...Array.from({ length: branded }, (_, i) => q(everyday + i, "branded")),
    ],
    lastAudit: null,
    history: [],
    library: [],
    suggestions: [
      {
        id: "s-1",
        text: "Who fixes hot water systems in Wollongong?",
        serviceLabel: null,
        source: "template",
        kind: "everyday",
      },
      {
        id: "s-2",
        text: "Is Bluegum Plumbing better than Another Local Co?",
        serviceLabel: null,
        source: "template",
        kind: "branded",
      },
    ],
    agencyName: "Possum Marketing",
    brandName: "Bluegum Plumbing",
    limits: {
      plan: "agency",
      engines: ["chatgpt", "claude", "gemini", "perplexity"],
      suggestionsShown: true,
      canEdit: true,
      editable: true,
      everydayAllowed: 10,
      everydayMin: 5,
      maxBranded: 5,
      canWriteQuestions: true,
    },
  };
}

function editor(v: QuestionsResponse) {
  render(
    <QuestionEditor
      brandId={BRAND}
      view={v}
      restored={null}
      onClose={() => undefined}
      onApplied={() => undefined}
      onReload={() => undefined}
    />,
  );
}

let page: QuestionsResponse;
beforeAll(async () => {
  // The first jsdom render can take seconds (project_jsdom_first_render_timeout): warm up once.
  editor(view(10));
  await screen.findByTestId("p02-edit", {}, { timeout: 15_000 });
  cleanup();
}, 30_000);
beforeEach(() => {
  page = view(9);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(page), { status: 200 })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

const storageKey = `vunnara:questions-draft:${BRAND}`;

describe("a kept draft", () => {
  it("that changes nothing is dropped silently: no question, view mode, storage cleared", async () => {
    window.sessionStorage.setItem(storageKey, JSON.stringify(initialDraft(page)));
    render(<QuestionsTab brandId={BRAND} />);
    await screen.findByTestId("p02-header");
    await act(async () => undefined);
    expect(screen.queryByTestId("p02-keep-draft")).not.toBeInTheDocument();
    expect(screen.queryByText("Keep your draft?")).not.toBeInTheDocument();
    expect(screen.queryByTestId("p02-edit")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(storageKey)).toBeNull();
  });

  it("that changes nothing, with ?edit=1: edit mode, still no question", async () => {
    window.history.replaceState(null, "", "/?edit=1");
    window.sessionStorage.setItem(storageKey, JSON.stringify(initialDraft(page)));
    render(<QuestionsTab brandId={BRAND} />);
    await screen.findByTestId("p02-edit");
    expect(screen.queryByTestId("p02-keep-draft")).not.toBeInTheDocument();
    expect(screen.getByTestId("p02-draft-bar")).toHaveTextContent("No changes yet");
  });

  it("that changes something is asked about, as before", async () => {
    const changed = initialDraft(page);
    changed.items = changed.items.slice(1);
    window.sessionStorage.setItem(storageKey, JSON.stringify(changed));
    render(<QuestionsTab brandId={BRAND} />);
    expect(await screen.findByTestId("p02-keep-draft")).toHaveTextContent("Keep your draft?");
  });
});

describe("at the plan's limit", () => {
  it("Add and + Add question are off, with the plan's sentence as tooltip and help line", () => {
    editor(view(10));
    const add = screen.getByTestId("p02-add-question");
    expect(add).toBeDisabled();
    expect(add).toHaveAttribute("title", LIMIT);
    const help = screen.getByTestId("p02-limit-help");
    expect(help).toHaveTextContent(LIMIT);
    expect(add).toHaveAttribute("aria-describedby", help.id);
    // Under the everyday list.
    expect(within(screen.getByTestId("p02-section-local")).getByTestId("p02-limit-help")).toBe(
      help,
    );
    const suggestion = screen.getByRole("button", {
      name: "Add: Who fixes hot water systems in Wollongong?",
    });
    expect(suggestion).toBeDisabled();
    expect(suggestion).toHaveAttribute("title", LIMIT);
    // A suggestion that names the business doesn't add an everyday question: still on (3 of 5).
    expect(
      screen.getByRole("button", {
        name: "Add: Is Bluegum Plumbing better than Another Local Co?",
      }),
    ).toBeEnabled();
  });

  it("Swap and Remove still work, and removing one turns Add back on", async () => {
    editor(view(10));
    const local = screen.getByTestId("p02-section-local");
    const first = within(local).getAllByTestId("p02-row")[0];
    fireEvent.click(within(first).getByTestId("p02-row-more"));
    const swap = await screen.findByRole("menuitem", { name: "Swap for a suggestion" });
    expect(swap).toBeEnabled();
    fireEvent.click(swap);
    fireEvent.click(
      within(first).getByRole("button", { name: "Who fixes hot water systems in Wollongong?" }),
    );
    expect(
      within(local).getByText("Who fixes hot water systems in Wollongong?"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("p02-draft-bar")).toHaveTextContent("10 of 10 everyday");

    const second = within(local).getAllByTestId("p02-row")[1];
    fireEvent.click(within(second).getByTestId("p02-row-more"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove from set" }));
    expect(screen.getByTestId("p02-draft-bar")).toHaveTextContent("9 of 10 everyday");
    expect(screen.getByTestId("p02-add-question")).toBeEnabled();
    expect(screen.queryByTestId("p02-limit-help")).not.toBeInTheDocument();
  });

  it("below the limit everything is on, with no help line", () => {
    editor(view(9));
    expect(screen.getByTestId("p02-add-question")).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Add: Who fixes hot water systems in Wollongong?" }),
    ).toBeEnabled();
    expect(screen.queryByTestId("p02-limit-help")).not.toBeInTheDocument();
  });

  it("a suggestion that names the business is off at the 5 that may", () => {
    editor(view(9, 5));
    const add = screen.getByRole("button", {
      name: "Add: Is Bluegum Plumbing better than Another Local Co?",
    });
    expect(add).toBeDisabled();
    expect(add).toHaveAttribute("title", BRANDED_FULL);
  });
});
