// @vitest-environment jsdom
/**
 * S04 part 0b (LLD amendments 85 and 93; contract v1.9 P10.step3, P03.footer): the confirm screen's Questions step.
 * - With no spare to swap in (one business type gives the generator at most 10 everyday templates): no Swap buttons,
 *   and "No other questions to swap in for this business type yet." once, under the everyday list. Remove (down to 5)
 *   and "Add your own question" stay. Removing an offered question makes it a spare, so Swap comes back and the line
 *   goes. Free never swaps, so it never shows the line.
 * - With a spare, Swap as before and no line.
 * - The drawer's button reads "Add question" here; P02's drawer keeps "Add to draft".
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/brands/brand-1",
}));

import { ConfirmQuestionsStep } from "@/components/domain/questions/confirm-questions-step";
import { AddQuestionDrawer } from "@/components/domain/questions/question-editor";
import type { ConfirmPreview } from "@/lib/questions/confirm-questions";

const NO_SPARES = "No other questions to swap in for this business type yet.";
const EVERYDAY = Array.from(
  { length: 10 },
  (_, i) => `Plumber in Chatswood, NSW for job number ${i + 1}?`,
);

const preview = (
  over: { spares?: ConfirmPreview["spares"]; limits?: Partial<ConfirmPreview["limits"]> } = {},
): ConfirmPreview => ({
  reachLabel: "Local · Chatswood",
  agencyName: "Possum Marketing",
  questions: [
    ...EVERYDAY.map((text) => ({ text, kind: "everyday" as const, source: "original" as const })),
    {
      text: "Is Wattlebird Plumbing a good choice for a plumber in Chatswood, NSW?",
      kind: "branded" as const,
      source: "original" as const,
    },
  ],
  spares: over.spares ?? [],
  limits: {
    plan: "agency",
    everydayAllowed: 10,
    everydayMin: 5,
    maxBranded: 5,
    canWriteQuestions: true,
    canSwap: true,
    ...over.limits,
  },
});

function step(p: ConfirmPreview) {
  render(
    <ConfirmQuestionsStep
      brandId="brand-1"
      preview={p}
      saving={false}
      error={null}
      onBack={() => undefined}
      onConfirm={() => undefined}
    />,
  );
}

beforeAll(async () => {
  // The first jsdom render can take seconds (project_jsdom_first_render_timeout): warm up once.
  step(preview());
  await screen.findByTestId("p10-step3", {}, { timeout: 15_000 });
  cleanup();
}, 30_000);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the confirm step with no spare to swap in", () => {
  it("has no Swap buttons and one line under the everyday list; Remove and Add stay", () => {
    step(preview());
    expect(screen.queryAllByRole("button", { name: /^Swap/ })).toHaveLength(0);
    const line = screen.getAllByText(NO_SPARES);
    expect(line).toHaveLength(1);
    // Under the everyday list, before the questions that name the business.
    const lastEveryday = screen.getByText(EVERYDAY[9]);
    expect(
      lastEveryday.compareDocumentPosition(line[0]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      line[0].compareDocumentPosition(screen.getByText("Questions that name the business")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Remove/ }).length).toBeGreaterThan(0);
    expect(screen.getByTestId("p10-add")).toBeInTheDocument();
  });

  it("removing an offered question makes it a spare: Swap comes back and the line goes", () => {
    step(preview());
    fireEvent.click(screen.getByRole("button", { name: `Remove “${EVERYDAY[0]}”` }));
    expect(screen.queryByText(NO_SPARES)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Swap/ }).length).toBeGreaterThan(0);
  });

  it("with a spare: Swap as before, no line", () => {
    step(
      preview({
        spares: [
          {
            text: "Electrician in Chatswood, NSW for a new power point?",
            kind: "everyday",
            source: "template",
          },
        ],
      }),
    );
    expect(screen.queryByText(NO_SPARES)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Swap/ }).length).toBeGreaterThan(0);
  });

  it("Free never swaps, so never shows the line", () => {
    step(preview({ limits: { plan: "free", canSwap: false, canWriteQuestions: false } }));
    expect(screen.queryByText(NO_SPARES)).not.toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /^Swap/ })).toHaveLength(0);
  });
});

describe("the drawer's button", () => {
  it('reads "Add question" on the confirm screen', async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true, kind: "everyday", checks: [] })),
    );
    step(preview({ limits: { everydayAllowed: 11 } }));
    await act(async () => {
      fireEvent.click(screen.getByTestId("p10-add"));
    });
    const footer = await screen.findByTestId("p03-footer");
    expect(within(footer).getByRole("button", { name: "Add question" })).toBeInTheDocument();
    expect(within(footer).queryByRole("button", { name: "Add to draft" })).not.toBeInTheDocument();
  });

  it('keeps "Add to draft" in the Questions page\'s editor', () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true, kind: "everyday", checks: [] })),
    );
    render(
      <AddQuestionDrawer
        brandId="brand-1"
        agencyName="Possum Marketing"
        draft={{ baseVersion: 1, items: [], archive: [] }}
        maxBranded={5}
        onAdd={() => undefined}
        onClose={() => undefined}
      />,
    );
    const footer = screen.getByTestId("p03-footer");
    expect(within(footer).getByRole("button", { name: "Add to draft" })).toBeInTheDocument();
  });
});
