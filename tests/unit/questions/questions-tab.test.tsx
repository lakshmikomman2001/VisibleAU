// @vitest-environment jsdom
/**
 * S02 part 4 (contract P02 view mode; LLD 8.2.2): the brand's Questions tab, from one GET.
 * - Header: "Questions" and "Version 1 · your original questions · {everyday} everyday + {branded} that name your
 *   business · comparing since audit #N" (a later version: "applied {date} by {name}"; no audit yet: "not used in an
 *   audit yet"). History opens a read-only drawer, newest first; Escape closes it and focus goes back to History.
 * - The intro names the engines the audit asks; "Everyday questions" with its count, "· small sample" under 5, and
 *   "Last audit (#{n}): {m} of {a} answers named you" (S03 part 0: the audit named, and the legend under the intro);
 *   rows with their source pill and EngineDots in four states as one
 *   image with the sentence; "Names your business" with its pill and no dots; the more menu (Copy text, See answers).
 * - Suggestions "From your business type", Add disabled with "Edit questions to add"; none when the plan has none.
 * - States: loading skeleton, empty (Confirm details), error (Retry asks again), view only for a viewer.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { engineDotsLabel } from "@/components/domain/audit/engine-dots";
import {
  headerLine,
  type QuestionsResponse,
  QuestionsTab,
} from "@/components/domain/questions/questions-tab";

const BRAND = "6f1c0e2a-4b7d-4c1e-9a52-3d8e7f6a1b20";
const AUDIT = "0d3b9c41-27e5-4f6a-8b1c-5e2d7a9f4c63";
const ALL = ["chatgpt", "claude", "gemini", "perplexity"];

function q(
  i: number,
  text: string,
  over: Partial<QuestionsResponse["questions"][number]> = {},
): QuestionsResponse["questions"][number] {
  return {
    id: `00000000-0000-4000-8000-00000000000${i}`,
    position: i,
    text,
    kind: "everyday",
    reach: "local",
    source: "original",
    serviceLabel: null,
    intent: null,
    lastResult: null,
    ...over,
  };
}

function body(over: Partial<QuestionsResponse> = {}): QuestionsResponse {
  return {
    set: {
      id: "set-1",
      version: 1,
      appliedAt: "2026-11-20T01:00:00.000Z",
      appliedBy: null,
      original: true,
      comparingSinceAudit: 53,
    },
    questions: [
      q(1, "Who is the best plumber in Wollongong?", {
        serviceLabel: "Blocked drains",
        intent: "best",
        lastResult: {
          chatgpt: "named",
          claude: "not_named",
          gemini: "unverified",
          perplexity: "failed",
        },
      }),
      q(2, "Which plumber near Wollongong can come today?", {
        lastResult: {
          chatgpt: "not_named",
          claude: "named",
          gemini: "not_named",
          perplexity: "named",
        },
      }),
      q(3, "Is Bluegum Plumbing any good?", { kind: "branded" }),
    ],
    lastAudit: { id: AUDIT, number: 54, engines: ALL },
    history: [
      {
        version: 1,
        appliedAt: "2026-11-20T01:00:00.000Z",
        appliedBy: null,
        everyday: 2,
        audits: { from: 53, to: 54 },
      },
    ],
    library: [],
    suggestions: [
      { id: "s-1", text: "Who fixes hot water systems in Wollongong?", serviceLabel: "Hot water" },
    ],
    limits: {
      plan: "agency",
      engines: ALL,
      suggestionsShown: true,
      canEdit: true,
      editable: false,
    },
    ...over,
  };
}

let answers: Array<() => Response>;
let fetchMock: ReturnType<typeof vi.fn>;
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
  fetchMock = vi.fn(async () =>
    (answers.shift() ?? (() => new Response(JSON.stringify(body()), { status: 200 })))(),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const ok = (b: QuestionsResponse) => () => new Response(JSON.stringify(b), { status: 200 });

async function shown(b: QuestionsResponse = body()) {
  answers.push(ok(b));
  render(<QuestionsTab brandId={BRAND} />);
  await screen.findByTestId("p02-header");
}

describe("the Questions tab, view mode", () => {
  it("one request: the header line, the intro and the two sections", async () => {
    await shown();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/brands/${BRAND}/questions`);
    expect(screen.getByRole("heading", { level: 1, name: "Questions" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Version 1 · your original questions · 2 everyday + 1 that names your business · comparing since audit #53",
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("p02-intro")).toHaveTextContent(
      "Every audit asks these questions on ChatGPT, Claude, Gemini and Perplexity. Only everyday questions count toward your score. How questions are chosen",
    );
    // P02.intro: the link opens the methodology page's section on how questions are chosen.
    expect(screen.getByRole("link", { name: "How questions are chosen" })).toHaveAttribute(
      "href",
      "/methodology#how-we-gather-answers",
    );
    const everyday = screen.getByRole("region", { name: "Everyday questions" });
    expect(everyday).toHaveTextContent("2 questions · small sample");
    // Named: ChatGPT on 1; Claude and Perplexity on 2 -- of 7 answers (Perplexity's call for 1 failed); the
    // unconfirmed Gemini mention isn't counted. S03 part 0, LLD amendment 79: "the section line names its audit
    // ('Last audit (#56): 12 of 40 answers named you')" -- S02 printed "Last audit: 3 of 7 ...".
    expect(everyday).toHaveTextContent("Last audit (#54): 3 of 7 answers named you");
    expect(within(everyday).getAllByRole("listitem")).toHaveLength(2);
    expect(within(everyday).getAllByText("Original set")).toHaveLength(2);
    expect(within(everyday).getByText("Blocked drains")).toBeInTheDocument();
    expect(within(everyday).getByText("Best")).toBeInTheDocument();
    const branded = screen.getByRole("region", { name: "Names your business" });
    expect(branded).toHaveTextContent("1 question · not scored");
    expect(branded).toHaveTextContent("Shown in results, never counted");
    expect(within(branded).getByText("Names your business · not scored")).toBeInTheDocument();
    expect(within(branded).queryByRole("img")).toBeNull();
  });

  it("EngineDots: four states in the fixed engine order, one image with the full sentence", async () => {
    await shown();
    const [first] = within(screen.getByRole("region", { name: "Everyday questions" })).getAllByRole(
      "img",
    );
    expect(first).toHaveAccessibleName(
      "Named you on ChatGPT; unconfirmed on Gemini; not on Claude; failed on Perplexity",
    );
    expect(
      [...first.children].map((d) => [
        d.getAttribute("data-engine"),
        d.getAttribute("data-result"),
      ]),
    ).toEqual([
      ["chatgpt", "named"],
      ["claude", "not_named"],
      ["gemini", "unverified"],
      ["perplexity", "failed"],
    ]);
    // Not by colour alone: a tick, a question mark, empty, a hatch.
    expect([...first.children].map((d) => d.textContent)).toEqual(["✓", "", "?", ""]);
    expect(
      engineDotsLabel({ chatgpt: "named", perplexity: "named" }, ["chatgpt", "perplexity"]),
    ).toBe("Named you on ChatGPT and Perplexity");
    expect(engineDotsLabel({ chatgpt: "not_named" }, ["chatgpt"])).toBe("Not on ChatGPT");
  });

  it("the more menu: Copy text, and the last audit's answers", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await shown();
    const more = screen.getByRole("button", {
      name: "More actions for Who is the best plumber in Wollongong?",
    });
    fireEvent.click(more);
    const menu = screen.getByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: "See answers in the last audit" }),
    ).toHaveAttribute("href", `/audits/${AUDIT}?tab=responses`);
    await act(async () => {
      fireEvent.click(within(menu).getByRole("menuitem", { name: "Copy text" }));
    });
    expect(writeText).toHaveBeenCalledWith("Who is the best plumber in Wollongong?");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(more).toHaveFocus();
  });

  it("History: a read-only drawer, newest first; Escape closes it and focus returns", async () => {
    await shown(
      body({
        history: [
          {
            version: 2,
            appliedAt: "2026-11-24T01:00:00.000Z",
            appliedBy: "Mia Tran",
            everyday: 10,
            audits: null,
          },
          {
            version: 1,
            appliedAt: "2026-11-20T01:00:00.000Z",
            appliedBy: null,
            everyday: 10,
            audits: { from: 50, to: 54 },
          },
        ],
      }),
    );
    const button = screen.getByRole("button", { name: "History" });
    fireEvent.click(button);
    const drawer = screen.getByRole("dialog", { name: "Question history" });
    const rows = within(drawer)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(rows[0]).toMatch(/^Version 2 · .+ · Mia Tran · 10 everyday$/);
    expect(rows[1]).toMatch(/^Version 1 · .+ · 10 everyday · used in audits #50–#54$/);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(button).toHaveFocus();
  });

  it("suggestions from the business type, Add disabled until editing; none when the plan has none", async () => {
    await shown();
    const card = screen.getByRole("region", { name: "Suggestions" });
    expect(card).toHaveTextContent("From your business type");
    const add = within(card).getByRole("button", {
      name: /^Add: Who fixes hot water systems in Wollongong\?/,
    });
    expect(add).toBeDisabled();
    expect(add).toHaveAttribute("title", "Edit questions to add");
  });

  it("Free: no suggestions card; a viewer: the view-only banner", async () => {
    await shown(
      body({
        suggestions: [],
        limits: {
          plan: "free",
          engines: ["chatgpt", "perplexity"],
          suggestionsShown: false,
          canEdit: false,
          editable: false,
        },
      }),
    );
    expect(screen.queryByRole("region", { name: "Suggestions" })).toBeNull();
    expect(screen.getByTestId("p02-view-only")).toHaveTextContent(
      "View only. Owners, admins and analysts can change questions.",
    );
  });

  it("a later version names who applied it; one no audit has used says so", () => {
    const later = body({
      set: {
        id: "set-2",
        version: 2,
        appliedAt: "2026-11-24T01:00:00.000Z",
        appliedBy: "Mia Tran",
        original: false,
        comparingSinceAudit: null,
      },
    });
    expect(headerLine(later)).toMatch(
      /^Version 2 · applied .+ by Mia Tran · 2 everyday \+ 1 that names your business · not used in an audit yet$/,
    );
  });
});

describe("the Questions tab's other states", () => {
  it("loading: the skeleton", () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    render(<QuestionsTab brandId={BRAND} />);
    expect(screen.getByTestId("p02-loading")).toHaveAttribute("aria-busy", "true");
  });

  it("empty: one sentence and Confirm details", async () => {
    answers.push(ok(body({ set: null, questions: [], history: [], lastAudit: null })));
    render(<QuestionsTab brandId={BRAND} />);
    const empty = await screen.findByTestId("p02-empty");
    expect(empty).toHaveTextContent(
      "No questions yet. Confirm your business details to create them.",
    );
    expect(within(empty).getByRole("link", { name: "Confirm details" })).toHaveAttribute(
      "href",
      `/brands/${BRAND}`,
    );
  });

  it("error: the warn banner, and Retry asks again", async () => {
    answers.push(() => new Response(JSON.stringify({ error: "boom" }), { status: 500 }));
    render(<QuestionsTab brandId={BRAND} />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't load the questions. Try again.");
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    await screen.findByTestId("p02-header");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a Free audit's two engines: the intro and the dots name only those", async () => {
    await shown(body({ lastAudit: { id: AUDIT, number: 54, engines: ["chatgpt", "perplexity"] } }));
    expect(screen.getByTestId("p02-intro")).toHaveTextContent(
      "Every audit asks these questions on ChatGPT and Perplexity.",
    );
    await waitFor(() => expect(screen.getAllByRole("img")[0].children).toHaveLength(2));
  });

  it("no audit yet: the intro names the plan's engines (from the same request), and no dots", async () => {
    const none = body({ lastAudit: null });
    none.limits = { ...none.limits, plan: "free", engines: ["chatgpt", "perplexity"] };
    none.questions = none.questions.map((x) => ({ ...x, lastResult: null }));
    await shown(none);
    expect(screen.getByTestId("p02-intro")).toHaveTextContent(
      "Every audit asks these questions on ChatGPT and Perplexity.",
    );
    expect(screen.queryAllByRole("img")).toEqual([]);
    expect(screen.getByRole("region", { name: "Everyday questions" })).not.toHaveTextContent(
      "Last audit",
    );
    // P02.legend: only when a row shows EngineDots.
    expect(screen.queryByTestId("p02-legend")).toBeNull();
  });
});

/**
 * S03 part 0 (LLD amendment 79, contract v1.8): the legend under the intro says what the squares are, once, with the
 * engines the squares show, in EngineDots' order.
 */
describe("P02.legend (amendment 79)", () => {
  const LEGEND =
    "Squares, left to right: ChatGPT · Claude · Gemini · Perplexity · ✓ named you · ? named but not verified · striped: no answer (failed). Only ✓ counts.";

  it("once, right under the intro, naming every engine the squares show", async () => {
    await shown();
    const legend = screen.getByTestId("p02-legend");
    expect(legend).toHaveTextContent(LEGEND);
    expect(screen.getAllByTestId("p02-legend")).toHaveLength(1);
    expect(screen.getByTestId("p02-intro").nextElementSibling).toBe(legend);
  });

  it("a Free audit's two engines: the legend names only those, in the squares' order", async () => {
    await shown(body({ lastAudit: { id: AUDIT, number: 54, engines: ["perplexity", "chatgpt"] } }));
    expect(screen.getByTestId("p02-legend")).toHaveTextContent(
      "Squares, left to right: ChatGPT · Perplexity · ✓ named you · ? named but not verified · striped: no answer (failed). Only ✓ counts.",
    );
  });

  it("no row with squares (the audit asked none of these questions): no legend", async () => {
    const b = body();
    b.questions = b.questions.map((x) => ({ ...x, lastResult: null }));
    await shown(b);
    expect(screen.queryByTestId("p02-legend")).toBeNull();
    expect(screen.getByRole("region", { name: "Everyday questions" })).not.toHaveTextContent(
      "Last audit",
    );
  });
});
