// @vitest-environment jsdom
/**
 * S03 part 4 (LLD 8.3.1; contract P02 edit mode, P03, P04): the Questions tab's edit mode.
 * - "Edit questions" only when the page says the user may edit; ?edit=1 while editing.
 * - The draft bar: "No changes yet" with Apply disabled; chips for added, removed and moved; the counts.
 * - Moves by the handle's Alt+↑/↓ (announced) and by the menu; remove; a suggestion added.
 * - Starter: no "+ Add question", the Growth lock and Upgrade instead.
 * - The add drawer: checks 250 ms after typing (the server's), the draft's own duplicate, the place fix, Add to draft.
 * - The draft survives a reload in the tab ("Keep your draft?"), and Discard asks first.
 * - Apply: the modal's changes and comparison notice; 201 -> the inline status; 409 -> the conflict banner; 402 inline.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type QuestionsResponse, QuestionsTab } from "@/components/domain/questions/questions-tab";

const BRAND = "6f1c0e2a-4b7d-4c1e-9a52-3d8e7f6a1b20";
const ALL = ["chatgpt", "claude", "gemini", "perplexity"];

function q(i: number, text: string, kind: "everyday" | "branded" = "everyday") {
  return {
    id: `00000000-0000-4000-8000-00000000000${i}`,
    position: i,
    text,
    kind,
    reach: "local" as const,
    source: "original" as const,
    serviceLabel: null,
    intent: null,
    lastResult: null,
  };
}

function body(over: Partial<QuestionsResponse["limits"]> = {}): QuestionsResponse {
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
      q(1, "Who is the best plumber in Wollongong?"),
      q(2, "Which plumber near Wollongong can come today?"),
      q(3, "Is Bluegum Plumbing any good?", "branded"),
    ],
    lastAudit: { id: "a-54", number: 54, engines: ALL },
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
      {
        id: "00000000-0000-4000-8000-0000000000aa",
        text: "Who fixes hot water systems in Wollongong?",
        serviceLabel: null,
      },
    ],
    brandName: "Bluegum Plumbing",
    agencyName: "Possum Marketing",
    limits: {
      plan: "agency",
      engines: ALL,
      suggestionsShown: true,
      canEdit: true,
      editable: true,
      everydayAllowed: 10,
      everydayMin: 5,
      maxBranded: 5,
      canWriteQuestions: true,
      ...over,
    },
  };
}

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
let handler: Handler;
let calls: Array<{ url: string; init?: RequestInit }>;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

beforeAll(async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json(body())),
  );
  const { unmount } = render(<QuestionsTab brandId={BRAND} />);
  await screen.findByTestId("p02-header", {}, { timeout: 15_000 });
  unmount();
}, 30_000);

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/brands/x/questions");
  calls = [];
  handler = () => json(body());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return handler(url, init);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function openEditor(b: QuestionsResponse = body()) {
  handler = (url) => (url.endsWith("/questions") ? json(b) : json({}));
  render(<QuestionsTab brandId={BRAND} />);
  fireEvent.click(await screen.findByTestId("p02-header-edit"));
  return screen.findByTestId("p02-edit");
}
const bar = () => screen.getByTestId("p02-draft-bar");

describe("entering edit mode", () => {
  it("shows Edit questions only when the page may be edited, and sets ?edit=1", async () => {
    handler = () => json(body({ editable: false }));
    const first = render(<QuestionsTab brandId={BRAND} />);
    await screen.findByTestId("p02-header");
    expect(screen.queryByTestId("p02-header-edit")).toBeNull();
    first.unmount();
    await openEditor();
    expect(window.location.search).toBe("?edit=1");
    expect(screen.queryByTestId("p02-header-edit")).toBeNull();
  });

  it("the draft bar starts empty: No changes yet, Apply disabled, the counts", async () => {
    await openEditor();
    expect(bar()).toHaveTextContent("No changes yet");
    expect(bar()).toHaveTextContent("2 of 10 everyday · 1 of 5 naming you");
    expect(within(bar()).getByRole("button", { name: "Apply from the next audit" })).toBeDisabled();
    expect(bar()).toHaveAttribute("aria-label", "Draft changes");
  });
});

describe("changing the draft", () => {
  it("Alt+↓ on a handle moves the row and says so; the bar counts one moved", async () => {
    await openEditor();
    const handle = screen.getByRole("button", {
      name: "Reorder: Who is the best plumber in Wollongong?",
    });
    expect(handle).toHaveAccessibleDescription("Press Alt and the up or down arrow to move");
    fireEvent.keyDown(handle, { key: "ArrowDown", altKey: true });
    expect(screen.getByTestId("p02-live")).toHaveTextContent("Moved to position 2 of 2");
    expect(bar()).toHaveTextContent("2 moved");
    const rows = within(screen.getByTestId("p02-section-local")).getAllByTestId("p02-row");
    expect(rows[0]).toHaveTextContent("Which plumber near Wollongong can come today?");
  });

  it("the menu removes a question; a suggestion comes in; the bar counts them", async () => {
    await openEditor();
    fireEvent.click(
      screen.getByRole("button", {
        name: "More actions for Who is the best plumber in Wollongong?",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove from set" }));
    expect(bar()).toHaveTextContent("−1 removed");
    fireEvent.click(
      screen.getByRole("button", { name: "Add: Who fixes hot water systems in Wollongong?" }),
    );
    expect(bar()).toHaveTextContent("+1 added");
    expect(bar()).toHaveTextContent("2 of 10 everyday");
    expect(within(bar()).getByRole("button", { name: "Apply from the next audit" })).toBeEnabled();
  });

  it("Starter: the Growth lock and Upgrade instead of + Add question", async () => {
    await openEditor(body({ plan: "starter", canWriteQuestions: false }));
    expect(screen.queryByTestId("p02-add-question")).toBeNull();
    const lock = screen.getByTestId("p02-plan-lock");
    expect(lock).toHaveTextContent("Growth");
    expect(lock).toHaveTextContent("Writing your own questions is available on Growth and up.");
    expect(within(lock).getByRole("link", { name: "Upgrade" })).toHaveAttribute("href", "/pricing");
  });
});

describe("the add drawer (P03)", () => {
  it("checks as you type, offers the place fix, and adds the question to the draft", async () => {
    const checks = (place: boolean) => ({
      ok: true,
      kind: "everyday",
      checks: [
        { id: "shape", status: "pass", message: "One question, 10–200 characters" },
        { id: "duplicate", status: "pass", message: "Not already in your questions" },
        {
          id: "names_business",
          status: "pass",
          message: "Doesn't name your business, so it counts toward your score",
        },
        { id: "contact", status: "pass", message: "No links, emails or phone numbers" },
        ...(place
          ? [
              {
                id: "place",
                status: "warn",
                message:
                  "No place in the question. AI answers differ by place, and Gemini can't be told your location.",
                fix: { label: "Add “in Wollongong”", text: "Who fixes gutters in Wollongong?" },
              },
            ]
          : []),
      ],
    });
    await openEditor();
    handler = (url, init) => {
      if (url.endsWith("/validate")) {
        const text = JSON.parse(String(init?.body)).text as string;
        return json(checks(!text.includes("Wollongong")));
      }
      return json(body());
    };
    fireEvent.click(screen.getByTestId("p02-add-question"));
    const drawer = screen.getByRole("dialog", { name: "Add a question" });
    const box = within(drawer).getByLabelText("Question a customer would ask AI");
    expect(box).toHaveFocus();
    fireEvent.change(box, { target: { value: "Who fixes gutters?" } });
    expect(within(drawer).getByRole("button", { name: "Add to draft" })).toBeDisabled();
    const fix = await within(drawer).findByRole("button", { name: "Add “in Wollongong”" });
    expect(within(drawer).getByTestId("p03-label")).toHaveTextContent(
      "It will be labelled Written by Possum Marketing on the audit page and in reports.",
    );
    fireEvent.click(fix);
    expect(box).toHaveValue("Who fixes gutters in Wollongong?");
    // The fixed question is checked again (250 ms after the change): Add waits for its answer.
    const add = within(drawer).getByRole("button", { name: "Add to draft" });
    await waitFor(() => expect(add).toBeEnabled());
    expect(within(drawer).queryByRole("button", { name: "Add “in Wollongong”" })).toBeNull();
    fireEvent.click(add);
    expect(screen.queryByRole("dialog", { name: "Add a question" })).toBeNull();
    expect(screen.getByTestId("p02-live")).toHaveTextContent("Question added to your draft");
    expect(
      within(screen.getByTestId("p02-section-local")).getByText("Who fixes gutters in Wollongong?"),
    ).toBeInTheDocument();
    expect(bar()).toHaveTextContent("+1 added");
    expect(calls.filter((c) => c.url.endsWith("/validate")).length).toBeGreaterThan(0);
  });

  it("a question already in the draft fails, even when the server's library doesn't have it", async () => {
    await openEditor();
    fireEvent.click(
      screen.getByRole("button", { name: "Add: Who fixes hot water systems in Wollongong?" }),
    );
    handler = (url) =>
      url.endsWith("/validate")
        ? json({
            ok: true,
            kind: "everyday",
            checks: [
              { id: "shape", status: "pass", message: "One question, 10–200 characters" },
              { id: "duplicate", status: "pass", message: "Not already in your questions" },
              {
                id: "names_business",
                status: "pass",
                message: "Doesn't name your business, so it counts toward your score",
              },
              { id: "contact", status: "pass", message: "No links, emails or phone numbers" },
            ],
          })
        : json(body());
    fireEvent.click(screen.getByTestId("p02-add-question"));
    const drawer = screen.getByRole("dialog", { name: "Add a question" });
    fireEvent.change(within(drawer).getByLabelText("Question a customer would ask AI"), {
      target: { value: "who fixes hot water systems in wollongong?" },
    });
    await within(drawer).findByText(/Problem:/);
    expect(within(drawer).getByRole("button", { name: "Add to draft" })).toBeDisabled();
  });
});

describe("keeping and discarding the draft", () => {
  it("a reload in the same tab asks whether to keep the draft; Discard empties it", async () => {
    const first = await openEditor();
    fireEvent.click(
      within(first).getByRole("button", {
        name: "More actions for Who is the best plumber in Wollongong?",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove from set" }));
    expect(window.sessionStorage.getItem(`vunnara:questions-draft:${BRAND}`)).toContain(
      "Which plumber",
    );
    document.body.innerHTML = "";
    render(<QuestionsTab brandId={BRAND} />);
    const keep = await screen.findByTestId("p02-keep-draft");
    expect(keep).toHaveTextContent("Keep your draft?");
    expect(bar()).toHaveTextContent("−1 removed");
    fireEvent.click(within(keep).getByRole("button", { name: "Discard" }));
    expect(bar()).toHaveTextContent("No changes yet");
  });

  it("Discard asks first, then leaves edit mode", async () => {
    await openEditor();
    fireEvent.click(
      screen.getByRole("button", {
        name: "More actions for Who is the best plumber in Wollongong?",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove from set" }));
    fireEvent.click(within(bar()).getByRole("button", { name: "Discard" }));
    const dialog = screen.getByRole("alertdialog", { name: "Discard your changes?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard" }));
    expect(screen.queryByTestId("p02-edit")).toBeNull();
    expect(window.location.search).toBe("");
  });
});

describe("applying (P04)", () => {
  async function toModal() {
    await openEditor();
    fireEvent.click(
      screen.getByRole("button", {
        name: "More actions for Who is the best plumber in Wollongong?",
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove from set" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Add: Who fixes hot water systems in Wollongong?" }),
    );
    fireEvent.click(within(bar()).getByRole("button", { name: "Apply from the next audit" }));
    return screen.getByRole("dialog", { name: "Apply new questions from the next audit?" });
  }

  it("the changes, the comparison notice, the counts, focus on Cancel", async () => {
    const modal = await toModal();
    expect(modal).toHaveTextContent("Bluegum Plumbing · version 1 → 2");
    const changes = within(modal).getByTestId("p04-changes");
    expect(changes).toHaveTextContent("Who fixes hot water systems in Wollongong?");
    expect(changes).toHaveTextContent("From your business type");
    expect(changes).toHaveTextContent("Who is the best plumber in Wollongong?");
    expect(within(modal).getByTestId("p04-notice")).toHaveTextContent(
      "This starts a new comparison. Audits #53–#54 stay in your history; the trend restarts from the next audit. An audit that is already running keeps the current questions.",
    );
    expect(within(modal).getByTestId("p04-footer")).toHaveTextContent(
      "2 of 10 everyday · 1 naming you",
    );
    expect(within(modal).getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("201: the modal closes, the inline status names the version, and the sent body is the draft", async () => {
    const modal = await toModal();
    handler = (url) => (url.endsWith("/question-sets") ? json({ version: 2 }, 201) : json(body()));
    await act(async () => {
      fireEvent.click(within(modal).getByRole("button", { name: "Apply from the next audit" }));
    });
    expect(await screen.findByTestId("p02-applied")).toHaveTextContent(
      "Questions applied. The next audit will use version 2.",
    );
    const sent = JSON.parse(
      String(calls.find((c) => c.url.endsWith("/question-sets"))?.init?.body),
    );
    expect(sent).toMatchObject({ baseVersion: 1, count: 2 });
    expect(sent.items.map((i: { questionId?: string }) => i.questionId)).toEqual([
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-0000000000aa",
      "00000000-0000-4000-8000-000000000003",
    ]);
    expect(window.sessionStorage.getItem(`vunnara:questions-draft:${BRAND}`)).toBeNull();
  });

  it("409: the modal closes and the conflict banner offers Reload; 402: the plan's sentence in the modal", async () => {
    let modal = await toModal();
    handler = (url) =>
      url.endsWith("/question-sets") ? json({ error: "stale_version" }, 409) : json(body());
    await act(async () => {
      fireEvent.click(within(modal).getByRole("button", { name: "Apply from the next audit" }));
    });
    expect(await screen.findByTestId("p02-conflict")).toHaveTextContent(
      "Someone else changed these questions. Reload to see their version.",
    );
    fireEvent.click(within(bar()).getByRole("button", { name: "Apply from the next audit" }));
    modal = screen.getByRole("dialog", { name: "Apply new questions from the next audit?" });
    handler = (url) =>
      url.endsWith("/question-sets") ? json({ error: "question_limit" }, 402) : json(body());
    await act(async () => {
      fireEvent.click(within(modal).getByRole("button", { name: "Apply from the next audit" }));
    });
    expect(await within(modal).findByRole("alert")).toHaveTextContent(
      "Your plan includes 10 everyday questions per brand. Remove one, or add a question pack.",
    );
  });
});
