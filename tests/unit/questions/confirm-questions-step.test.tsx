// @vitest-environment jsdom
/**
 * S03 part 7 (LLD 8.3.6, client request C4; contract P10 step 3): the Questions step on "Confirm your business details".
 * - The card, with the step: "Next: questions" asks for the questions these (unsaved) details make; the step lists them
 *   in P02's rows under the reach, with "{n} of {limit} everyday"; Back keeps the choices; Confirm sends exactly the list
 *   shown with the details, then starts the first audit and opens it.
 * - Swap an everyday question for a spare; Growth and up add their own through P03's drawer (labelled "Written by
 *   {agency}") and can remove it; Starter swaps only; Free keeps the questions as they are.
 * - The server's refusal is said in its own words, in the step.
 * - Without the step (agency_questions off, or a brand with audits) the card is as before.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ClassificationConfirmCard } from "@/components/domain/brand/classification-confirm-card";
import type { ConfirmPreview } from "@/lib/questions/confirm-questions";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/brands/brand-1",
}));

const EVERYDAY = Array.from(
  { length: 10 },
  (_, i) => `Plumber in Chatswood, NSW for job number ${i + 1}?`,
);
const BRANDED = ["Is Wattlebird Plumbing a good choice for a plumber in Chatswood, NSW?"];
const SPARE = "Electrician in Chatswood, NSW for a new power point?";
const TYPED = "Who fixes burst pipes in Chatswood quickly?";

const preview = (limits: Partial<ConfirmPreview["limits"]> = {}): ConfirmPreview => ({
  reachLabel: "Local · Chatswood",
  agencyName: "Possum Marketing",
  questions: [
    ...EVERYDAY.map((text) => ({ text, kind: "everyday" as const, source: "original" as const })),
    ...BRANDED.map((text) => ({ text, kind: "branded" as const, source: "original" as const })),
  ],
  spares: [{ text: SPARE, kind: "everyday", source: "template" }],
  limits: {
    plan: "agency",
    everydayAllowed: 11,
    everydayMin: 5,
    maxBranded: 5,
    canWriteQuestions: true,
    canSwap: true,
    ...limits,
  },
});

let handler: (url: string, init?: RequestInit) => Response;
let calls: Array<{ url: string; init?: RequestInit }>;
beforeEach(() => {
  calls = [];
  router.push.mockClear();
  handler = (url) => {
    if (url.endsWith("/confirm-preview")) return Response.json(preview());
    if (url.endsWith("/confirm-classification")) return Response.json({ brand: { id: "brand-1" } });
    if (url === "/api/audits") return Response.json({ auditId: "audit-1" }, { status: 201 });
    return Response.json({});
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return handler(url, init);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderCard(questionsStep: boolean) {
  render(
    <ClassificationConfirmCard
      brandId="brand-1"
      suggestedCategory="trades_plumbing"
      suggestedAudience="households"
      suggestedCompetitors={[]}
      confidence={0.6}
      vertical="tradies"
      startFirstAudit
      questionsStep={questionsStep}
    />,
  );
}
async function openStep() {
  renderCard(true);
  fireEvent.click(screen.getByRole("button", { name: "Next: questions" }));
  return screen.findByTestId("p10-step3", {}, { timeout: 10_000 });
}
const body = (url: string) =>
  JSON.parse(String(calls.find((c) => c.url.endsWith(url))?.init?.body));

beforeAll(async () => {
  // The first jsdom render of the card and its rows is slow here (memory: jsdom first-render timeout).
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(preview())),
  );
  renderCard(true);
  fireEvent.click(screen.getByRole("button", { name: "Next: questions" }));
  await screen.findByTestId("p10-step3", {}, { timeout: 20_000 });
  cleanup();
  vi.unstubAllGlobals();
}, 30_000);

describe("the card with the Questions step", () => {
  it("Next asks for the questions these details make; the step lists them under the reach", async () => {
    const step = await openStep();
    expect(body("/confirm-preview")).toEqual({
      categories: ["trades_plumbing"],
      audience: "households",
      confirmedCompetitors: [],
    });
    expect(screen.getByTestId("p10-steps")).toHaveTextContent("1 · Business details2 · Questions");
    expect(within(screen.getByTestId("p10-steps")).getByText("2 · Questions")).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(within(step).getByText("Local · Chatswood")).toBeInTheDocument();
    expect(within(step).getByTestId("p10-count")).toHaveTextContent("10 of 11 everyday");
    expect(within(step).getAllByTestId("p02-row")).toHaveLength(11);
    expect(within(step).getAllByText("Names your business · not scored")).toHaveLength(1);
    // Nothing is saved until Confirm.
    expect(calls.some((c) => c.url.endsWith("/confirm-classification"))).toBe(false);
  });

  it("Back keeps the choices; Confirm sends exactly the list shown, then starts the first audit", async () => {
    await openStep();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Next: questions" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next: questions" }));
    await screen.findByTestId("p10-step3");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm and start the first audit" }));
    });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/audits/audit-1"));
    expect(body("/confirm-classification")).toEqual({
      categories: ["trades_plumbing"],
      audience: "households",
      confirmedCompetitors: [],
      questions: [
        ...EVERYDAY.map((text) => ({ text, source: "original" })),
        ...BRANDED.map((text) => ({ text, source: "original" })),
      ],
    });
    const urls = calls.map((c) => c.url);
    expect(urls.indexOf("/api/brands/brand-1/confirm-classification")).toBeLessThan(
      urls.indexOf("/api/audits"),
    );
  });

  it("swap an everyday question for a spare; the swapped-out one becomes a spare", async () => {
    const step = await openStep();
    fireEvent.click(within(step).getByRole("button", { name: `Swap “${EVERYDAY[0]}”` }));
    fireEvent.click(
      within(screen.getByTestId("p10-swap-menu")).getByRole("button", { name: SPARE }),
    );
    expect(within(step).queryByText(EVERYDAY[0])).toBeNull();
    expect(within(step).getByText(SPARE)).toBeInTheDocument();
    fireEvent.click(within(step).getByRole("button", { name: `Swap “${SPARE}”` }));
    expect(
      within(screen.getByTestId("p10-swap-menu")).getByRole("button", { name: EVERYDAY[0] }),
    ).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm and start the first audit" }));
    });
    await waitFor(() => expect(router.push).toHaveBeenCalled());
    expect(body("/confirm-classification").questions[0]).toEqual({
      text: SPARE,
      source: "template",
    });
  });

  it("Growth and up: their own question through P03's drawer, labelled, and removable", async () => {
    handler = (url, init) => {
      if (url.endsWith("/validate"))
        return Response.json({
          ok: true,
          kind: "everyday",
          text: JSON.parse(String(init?.body)).text,
          checks: [{ id: "shape", status: "pass", message: "One question, 10–200 characters" }],
        });
      if (url.endsWith("/confirm-preview")) return Response.json(preview());
      return Response.json({});
    };
    const step = await openStep();
    fireEvent.click(within(step).getByTestId("p10-add"));
    const drawer = screen.getByRole("dialog", { name: "Add a question" });
    fireEvent.change(within(drawer).getByLabelText("Question a customer would ask AI"), {
      target: { value: TYPED },
    });
    const add = within(drawer).getByRole("button", { name: "Add to draft" });
    await waitFor(() => expect(add).toBeEnabled());
    fireEvent.click(add);
    const row = within(step).getByText(TYPED).closest("li") as HTMLElement;
    expect(row).toHaveTextContent("Written by Possum Marketing");
    expect(within(step).getByTestId("p10-count")).toHaveTextContent("11 of 11 everyday");
    // The plan's limit reached: Add says why instead.
    expect(within(step).getByTestId("p10-add")).toBeDisabled();
    expect(step).toHaveTextContent(
      "Your plan includes 11 everyday questions per brand. Remove one, or add a question pack.",
    );
    fireEvent.click(within(row).getByRole("button", { name: `Remove “${TYPED}”` }));
    expect(within(step).queryByText(TYPED)).toBeNull();
  });

  it("Starter swaps only; Free keeps the questions as they are", async () => {
    handler = (url) =>
      url.endsWith("/confirm-preview")
        ? Response.json(preview({ plan: "starter", canWriteQuestions: false }))
        : Response.json({});
    let step = await openStep();
    expect(within(step).queryByTestId("p10-add")).toBeNull();
    expect(within(step).getAllByRole("button", { name: /^Swap / })).toHaveLength(10);
    cleanup();
    handler = (url) =>
      url.endsWith("/confirm-preview")
        ? Response.json(preview({ plan: "free", canWriteQuestions: false, canSwap: false }))
        : Response.json({});
    step = await openStep();
    expect(within(step).queryByRole("button", { name: /^Swap / })).toBeNull();
    expect(within(step).queryByTestId("p10-add")).toBeNull();
  });

  it("a refusal is said in the server's words, in the step", async () => {
    handler = (url) => {
      if (url.endsWith("/confirm-preview")) return Response.json(preview());
      if (url.endsWith("/confirm-classification"))
        return Response.json(
          { error: "invalid_questions", message: "Keep at least 5 everyday questions." },
          { status: 422 },
        );
      return Response.json({});
    };
    await openStep();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm and start the first audit" }));
    });
    expect(await screen.findByTestId("p10-error")).toHaveTextContent(
      "Keep at least 5 everyday questions.",
    );
    expect(calls.some((c) => c.url === "/api/audits")).toBe(false);
  });
});

describe("a step that starts full (the workspace's count is the plan's)", () => {
  it("Remove makes room for their own question; the removed one becomes a spare; never below 5", async () => {
    handler = (url) =>
      url.endsWith("/confirm-preview")
        ? Response.json(preview({ everydayAllowed: 10 }))
        : Response.json({});
    const step = await openStep();
    expect(within(step).getByTestId("p10-count")).toHaveTextContent("10 of 10 everyday");
    expect(within(step).getByTestId("p10-add")).toBeDisabled();
    fireEvent.click(within(step).getByRole("button", { name: `Remove “${EVERYDAY[9]}”` }));
    expect(within(step).getByTestId("p10-count")).toHaveTextContent("9 of 10 everyday");
    expect(within(step).getByTestId("p10-add")).toBeEnabled();
    fireEvent.click(within(step).getByRole("button", { name: `Swap “${EVERYDAY[0]}”` }));
    expect(
      within(screen.getByTestId("p10-swap-menu")).getByRole("button", { name: EVERYDAY[9] }),
    ).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    for (const text of EVERYDAY.slice(5, 9)) {
      fireEvent.click(within(step).getByRole("button", { name: `Remove “${text}”` }));
    }
    expect(within(step).getByTestId("p10-count")).toHaveTextContent("5 of 10 everyday");
    expect(within(step).queryByRole("button", { name: /^Remove / })).toBeNull();
  });
});

describe("the card without the step", () => {
  it("is as before: one Confirm that starts the first audit, no questions sent", async () => {
    renderCard(false);
    expect(screen.queryByTestId("p10-steps")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm and start the first audit" }));
    });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/audits/audit-1"));
    expect(body("/confirm-classification")).not.toHaveProperty("questions");
    expect(calls.some((c) => c.url.endsWith("/confirm-preview"))).toBe(false);
  });
});
