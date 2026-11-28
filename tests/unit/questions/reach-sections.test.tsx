// @vitest-environment jsdom
/**
 * S04 part 7 (contract P02.section, P03.area; LLD 8.4.6):
 * - With visibility_reach on (the response carries `reaches`), the Questions tab has one section per reach in reach
 *   order, titled by its label, counted, "· small sample" under 5, its own last-audit line; without it, one "Everyday
 *   questions" section as before.
 * - In edit mode a question beyond Local shows its reach; the add drawer offers the enabled reaches as its Area, checks
 *   the text against the chosen one, and adds the question in it. Local alone without `reaches`.
 * - The reach labels: "across Local, NSW and Australia"; one reach keeps the Local label; the tile's hover sentence.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/brands",
  useSearchParams: () => new URLSearchParams(),
}));

import { AddQuestionDrawer, QuestionEditor } from "@/components/domain/questions/question-editor";
import { type QuestionsResponse, QuestionsTab } from "@/components/domain/questions/questions-tab";
import { andList, reachHeadlineLabel, reachTileTooltip } from "@/lib/reach/labels";

const BRAND = "3c5e7a9b-2d4f-4b6a-8c1e-5f7a9b2d4f60";
type Reach = "local" | "state" | "country";

function q(i: number, reach: Reach, kind: "everyday" | "branded" = "everyday") {
  return {
    id: `00000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`,
    position: i,
    text: `Who is the best plumber, question number ${i + 1}?`,
    kind,
    reach,
    source: "original" as const,
    serviceLabel: null,
    intent: null,
    lastResult: { chatgpt: i % 2 === 0 ? ("named" as const) : ("not_named" as const) },
  };
}

function view(withReaches: boolean): QuestionsResponse {
  return {
    set: {
      id: "set-2",
      version: 2,
      appliedAt: "2026-11-27T01:00:00.000Z",
      appliedBy: null,
      original: false,
      comparingSinceAudit: null,
    },
    questions: [
      ...[0, 1, 2, 3].map((i) => q(i, "local")),
      ...[4, 5, 6].map((i) => q(i, "state")),
      ...[7, 8, 9].map((i) => q(i, "country")),
      q(10, "local", "branded"),
    ],
    lastAudit: { id: "audit-60", number: 60, engines: ["chatgpt"] },
    history: [],
    library: [],
    suggestions: [],
    agencyName: "Possum Marketing",
    brandName: "Bluegum Plumbing",
    limits: {
      plan: "agency",
      engines: ["chatgpt"],
      suggestionsShown: true,
      canEdit: true,
      editable: true,
      everydayAllowed: 10,
      everydayMin: 5,
      maxBranded: 5,
      canWriteQuestions: true,
    },
    ...(withReaches
      ? {
          reaches: [
            { reach: "local" as const, label: "Local · Wollongong", enabled: true },
            { reach: "state" as const, label: "NSW", enabled: true },
            { reach: "country" as const, label: "Australia", enabled: true },
            { reach: "global" as const, label: "Worldwide", enabled: false },
          ],
        }
      : {}),
  };
}

async function tab(v: QuestionsResponse) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(v), { status: 200 })),
  );
  render(<QuestionsTab brandId={BRAND} />);
  await screen.findByTestId("p02-header", {}, { timeout: 15_000 });
}

beforeAll(async () => {
  // The first jsdom render is slow here (project_jsdom_first_render_timeout): warm up once.
  await tab(view(false));
  cleanup();
  vi.unstubAllGlobals();
}, 30_000);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe("the Questions tab by reach", () => {
  it("off: one Everyday questions section", async () => {
    await tab(view(false));
    const section = screen.getByTestId("p02-section-local");
    expect(
      within(section).getByRole("heading", { name: "Everyday questions" }),
    ).toBeInTheDocument();
    expect(section).toHaveTextContent("10 questions");
    expect(screen.queryByTestId("p02-section-state")).toBeNull();
  });

  it("on: a section per reach, in order, each counted with its own last-audit line", async () => {
    await tab(view(true));
    const sections = screen.getAllByTestId(/^p02-section-(local|state|country)$/);
    expect(sections.map((s) => s.getAttribute("data-testid"))).toEqual([
      "p02-section-local",
      "p02-section-state",
      "p02-section-country",
    ]);
    const local = screen.getByTestId("p02-section-local");
    expect(within(local).getByRole("heading", { name: "Local · Wollongong" })).toBeInTheDocument();
    expect(local).toHaveTextContent("4 questions · small sample");
    expect(local).toHaveTextContent("Last audit (#60): 2 of 4 answers named you");
    const state = screen.getByTestId("p02-section-state");
    expect(within(state).getByRole("heading", { name: "NSW" })).toBeInTheDocument();
    expect(state).toHaveTextContent("3 questions · small sample");
    expect(state).toHaveTextContent("Last audit (#60): 2 of 3 answers named you");
    expect(screen.getByTestId("p02-section-branded")).toHaveTextContent("1 question · not scored");
  });
});

describe("edit mode and the add drawer by reach", () => {
  // S04B part 4 (LLD amendment 102: "P02's edit mode in one section per reach"): the reach is the section a row is in,
  // so the S04 chip on each row beyond Local is gone.
  it("a question beyond Local is in its reach's section", async () => {
    render(
      <QuestionEditor
        brandId={BRAND}
        view={view(true)}
        restored={null}
        onClose={() => undefined}
        onApplied={() => undefined}
        onReload={() => undefined}
      />,
    );
    await screen.findByTestId("p02-edit", {}, { timeout: 15_000 });
    expect(screen.queryAllByTestId("p02-row-reach")).toEqual([]);
    const rows = (reach: string) =>
      within(screen.getByTestId(`p02-section-${reach}`)).getAllByTestId("p02-row").length;
    expect([rows("local"), rows("state"), rows("country")]).toEqual([4, 3, 3]);
  });

  it("the drawer's areas: the chosen one is checked against and the question added in it", async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ ok: true, kind: "everyday", checks: [] }), {
          status: 200,
        });
      }),
    );
    const onAdd = vi.fn();
    render(
      <AddQuestionDrawer
        brandId={BRAND}
        agencyName="Possum Marketing"
        draft={{ baseVersion: 2, items: [], archive: [] }}
        maxBranded={5}
        areas={[
          { reach: "local", label: "Local · Wollongong" },
          { reach: "state", label: "NSW" },
        ]}
        onAdd={onAdd}
        onClose={() => undefined}
      />,
    );
    const area = screen.getByTestId("p03-area");
    expect(within(area).getByRole("radio", { name: "Local · Wollongong" })).toBeChecked();
    fireEvent.click(within(area).getByRole("radio", { name: "NSW" }));
    fireEvent.change(screen.getByLabelText("Question a customer would ask AI"), {
      target: { value: "Who are the best plumbers in NSW for a big job?" },
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(bodies.at(-1)).toEqual({
      text: "Who are the best plumbers in NSW for a big job?",
      reach: "state",
    });
    const add = screen.getByRole("button", { name: "Add to draft" });
    await act(async () => {
      fireEvent.click(add);
    });
    expect(onAdd).toHaveBeenCalledWith({
      text: "Who are the best plumbers in NSW for a big job?",
      kind: "everyday",
      reach: "state",
    });
  });

  it("without areas: Local alone, as before", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })),
    );
    render(
      <AddQuestionDrawer
        brandId={BRAND}
        agencyName="Possum Marketing"
        draft={{ baseVersion: 2, items: [], archive: [] }}
        maxBranded={5}
        onAdd={() => undefined}
        onClose={() => undefined}
      />,
    );
    const radios = within(screen.getByTestId("p03-area")).getAllByRole("radio");
    expect(radios).toHaveLength(1);
    expect(radios[0]).toHaveAccessibleName("Local");
    expect(radios[0]).toBeChecked();
  });
});

describe("the reach labels", () => {
  it("names the reaches the headline covers", () => {
    expect(andList(["Local", "NSW", "Australia"])).toBe("Local, NSW and Australia");
    expect(
      reachHeadlineLabel(
        [
          { reach: "local", label: "Local · Sydney" },
          { reach: "state", label: "NSW" },
          { reach: "country", label: "Australia" },
        ],
        "Local · Sydney",
      ),
    ).toBe("across Local, NSW and Australia");
    expect(
      reachHeadlineLabel([{ reach: "local", label: "Local · Sydney" }], "Local · Sydney"),
    ).toBe("Local · Sydney");
    expect(reachTileTooltip({ mentioned: 2, everydayAnswers: 20, label: "NSW" })).toBe(
      "2 of 20 everyday answers in NSW named you.",
    );
  });
});
