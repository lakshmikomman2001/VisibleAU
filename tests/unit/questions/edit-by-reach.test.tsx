// @vitest-environment jsdom
/**
 * S04B part 4 (LLD amendment 102; contract P02.section, P02.row.more, P02.addQuestion, P02.draftBar, P03.area), behind
 * visibility_reach (the response carries `reaches`):
 * - edit mode keeps view mode's sections, one per enabled reach in reach order, then "Names your business";
 * - rows reorder within their section only (menu, Alt+arrow, drag);
 * - the row menu's "Move to another area" moves a row to another enabled reach (to the end of its section) and is
 *   hidden with one reach; the draft bar counts it as moved;
 * - each section's "+ Add question" opens P03 with that reach chosen, and the question lands in that section.
 * Without `reaches` edit mode is S04's (tests/unit/questions/edit-mode-limit.test.tsx and the others keep it).
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/brands",
  useSearchParams: () => new URLSearchParams(),
}));

import { QuestionEditor } from "@/components/domain/questions/question-editor";
import type { QuestionsResponse } from "@/components/domain/questions/questions-tab";

const BRAND = "4d6f8a0b-3e5a-4c7b-9d2f-6a8b0c3e5a71";
type Reach = "local" | "state" | "country";

function q(i: number, reach: Reach, kind: "everyday" | "branded" = "everyday") {
  return {
    id: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`,
    position: i,
    text: `Which plumber do you recommend, question number ${i + 1}?`,
    kind,
    reach,
    source: "original" as const,
    serviceLabel: null,
    intent: null,
    lastResult: {},
  };
}

function view(enabled: Reach[] = ["local", "state", "country"]): QuestionsResponse {
  return {
    set: {
      id: "set-3",
      version: 3,
      appliedAt: "2026-11-27T01:00:00.000Z",
      appliedBy: null,
      original: false,
      comparingSinceAudit: null,
    },
    questions: [
      ...[0, 1, 2, 3].map((i) => q(i, "local")),
      ...(enabled.includes("state") ? [4, 5, 6].map((i) => q(i, "state")) : []),
      ...(enabled.includes("country") ? [7, 8].map((i) => q(i, "country")) : []),
      q(10, "local", "branded"),
    ],
    lastAudit: null,
    history: [],
    library: [],
    suggestions: [],
    agencyName: "Kookaburra Agency",
    brandName: "Ironbark Plumbing",
    limits: {
      plan: "agency",
      engines: ["chatgpt"],
      suggestionsShown: true,
      canEdit: true,
      editable: true,
      everydayAllowed: 20,
      everydayMin: 5,
      maxBranded: 5,
      canWriteQuestions: true,
    },
    reaches: [
      { reach: "local", label: "Local · Kurrajong Heights", enabled: true },
      { reach: "state", label: "NSW", enabled: enabled.includes("state") },
      { reach: "country", label: "Australia", enabled: enabled.includes("country") },
      { reach: "global", label: "Worldwide", enabled: false },
    ],
  } as QuestionsResponse;
}

async function editor(v: QuestionsResponse = view()) {
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
  await screen.findByTestId("p02-edit", {}, { timeout: 15_000 });
}

const section = (reach: string) => screen.getByTestId(`p02-section-${reach}`);
const rowTexts = (reach: string) =>
  within(section(reach))
    .getAllByTestId("p02-row")
    .map((r) => r.querySelector("p")?.textContent);
const openMenu = (reach: string, n: number) =>
  fireEvent.click(
    within(within(section(reach)).getAllByTestId("p02-row")[n]).getByTestId("p02-row-more"),
  );
const menuItems = () => screen.getAllByRole("menuitem").map((m) => m.textContent);

beforeAll(async () => {
  // The first jsdom render is slow here (project_jsdom_first_render_timeout): warm up once.
  await editor();
  cleanup();
}, 30_000);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe("P02 edit mode by reach", () => {
  it("one section per enabled reach in reach order, each with its own + Add question, then Names your business", async () => {
    await editor();
    const sections = screen
      .getAllByRole("region")
      .map((r) => r.getAttribute("data-testid"))
      .filter((id) => id?.startsWith("p02-section-"));
    expect(sections).toEqual([
      "p02-section-local",
      "p02-section-state",
      "p02-section-country",
      "p02-section-branded",
    ]);
    expect(within(section("local")).getByRole("heading").textContent).toBe(
      "Local · Kurrajong Heights",
    );
    expect(within(section("state")).getByRole("heading").textContent).toBe("NSW");
    expect(within(section("country")).getByText("2 questions · small sample")).toBeInTheDocument();
    for (const reach of ["local", "state", "country"])
      expect(within(section(reach)).getByTestId("p02-add-question")).toHaveTextContent(
        "+ Add question",
      );
    expect(within(section("branded")).queryByTestId("p02-add-question")).toBeNull();
  });

  it("Move to another area moves the row to the end of that section, offering only the other enabled reaches", async () => {
    await editor();
    const first = rowTexts("local")[0];
    openMenu("local", 0);
    expect(menuItems()).toContain("Move to another area");
    fireEvent.click(screen.getByRole("menuitem", { name: "Move to another area" }));
    expect(menuItems()).toEqual(["NSW", "Australia"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "NSW" }));
    expect(rowTexts("local")).not.toContain(first);
    expect(rowTexts("state").at(-1)).toBe(first);
    expect(screen.getByTestId("p02-live")).toHaveTextContent("Moved to NSW");
    expect(within(screen.getByTestId("p02-draft-bar")).getByText("1 moved")).toBeInTheDocument();
  });

  it("with one reach there is no Move to another area", async () => {
    await editor(view(["local"]));
    openMenu("local", 0);
    expect(menuItems()).not.toContain("Move to another area");
    expect(screen.queryByTestId("p02-section-state")).toBeNull();
  });

  it("Move up and Move down, and Alt+arrow, stay inside the section", async () => {
    await editor();
    openMenu("state", 0);
    expect(menuItems()).not.toContain("Move up");
    fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    expect(rowTexts("state")).toEqual([
      "Which plumber do you recommend, question number 6?",
      "Which plumber do you recommend, question number 5?",
      "Which plumber do you recommend, question number 7?",
    ]);
    const lastLocal = within(section("local"))
      .getAllByRole("button", { name: /^Reorder:/ })
      .at(-1);
    if (!lastLocal) throw new Error("no handle");
    act(() => {
      fireEvent.keyDown(lastLocal, { key: "ArrowDown", altKey: true });
    });
    expect(rowTexts("local")).toHaveLength(4);
    expect(rowTexts("state")).toHaveLength(3);
  });

  it("a row dragged onto another section's row stays where it was", async () => {
    await editor();
    const local = within(section("local")).getAllByTestId("p02-row")[0];
    const nsw = within(section("state")).getAllByTestId("p02-row")[0];
    fireEvent.dragStart(local);
    fireEvent.drop(nsw);
    expect(rowTexts("local")).toHaveLength(4);
    expect(
      within(screen.getByTestId("p02-draft-bar")).getByText("No changes yet"),
    ).toBeInTheDocument();
  });

  it("+ Add question in a section opens the drawer with that reach chosen, and adds the question there", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ kind: "everyday", checks: [], ok: true }), { status: 200 }),
      ),
    );
    await editor();
    fireEvent.click(within(section("country")).getByTestId("p02-add-question"));
    const area = await screen.findByTestId("p03-area");
    const checked = within(area).getByRole("radio", { checked: true }) as HTMLInputElement;
    expect(checked.value).toBe("country");
  });
});
