// @vitest-environment jsdom
/**
 * S03 part 5 (contract P05): the workspace's Questions settings page, and its Account entry.
 * - Header copy; the defaults (the stepper within 5 and the included count, the switch, Local always on) save 500 ms
 *   after a change with an inline "Saved"; the brands table's cells ("{active} / {allowed}", the packs pill, "backfill",
 *   "{date} · {name}", the Edit questions link named for its brand);
 * - Starter: the controls off with the Growth marker; the empty and error states;
 * - Copy: the modal's two brands, refused when they're the same, then the inline status.
 * - The Account list gains Questions after Notifications only when asked (agency_questions, owners and admins).
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNT_ITEMS, accountItems } from "@/components/domain/app-sidebar";
import { QuestionSettings } from "@/components/domain/questions/question-settings";
import type { QuestionSettingsView } from "@/lib/questions/settings";

const view = (over: Partial<QuestionSettingsView> = {}): QuestionSettingsView => ({
  plan: "agency",
  planName: "Agency",
  included: 10,
  canWrite: true,
  defaults: { everydayCount: 10, fillWithSuggestions: true },
  brands: [
    {
      id: "b-1",
      name: "Wattlebird Plumbing",
      areas: ["Local"],
      everydayActive: 9,
      everydayAllowed: 20,
      packs: 1,
      writtenByAgency: 2,
      version: 3,
      lastChange: { at: "2026-11-26T00:00:00.000Z", by: "Pat Owner", backfill: false },
    },
    {
      id: "b-2",
      name: "Kookaburra Plumbing",
      areas: ["Local"],
      everydayActive: 10,
      everydayAllowed: 10,
      packs: 0,
      writtenByAgency: 0,
      version: 1,
      lastChange: { at: "2026-11-20T00:00:00.000Z", by: null, backfill: true },
    },
  ],
  ...over,
});

let handler: (url: string, init?: RequestInit) => Response;
let calls: Array<{ url: string; init?: RequestInit }>;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

beforeAll(async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json(view())),
  );
  const { unmount } = render(<QuestionSettings />);
  await screen.findByTestId("p05-defaults", {}, { timeout: 15_000 });
  unmount();
}, 30_000);
beforeEach(() => {
  calls = [];
  handler = () => json(view());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return handler(url, init);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("the Questions settings page (P05)", () => {
  it("the header, the defaults and the brands table", async () => {
    render(<QuestionSettings />);
    await screen.findByTestId("p05-defaults");
    expect(screen.getByTestId("p05-header")).toHaveTextContent(
      "Choose how many questions each brand is audited on, and write your own. Questions always belong to one brand.",
    );
    expect(screen.getByTestId("p05-defaults-count")).toHaveTextContent(
      "Agency includes 10 per brand, plus packs",
    );
    expect(screen.getByRole("spinbutton")).toHaveAttribute("aria-valuenow", "10");
    expect(
      screen.getByRole("switch", { name: "Fill empty slots with AI suggestions" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("p05-defaults-reach")).toHaveTextContent("Local · always on");
    const rows = screen.getAllByTestId("p05-brand-row");
    expect(rows[0]).toHaveTextContent("Wattlebird Plumbing");
    expect(rows[0]).toHaveTextContent("9 / 20");
    expect(rows[0]).toHaveTextContent("+1 pack");
    expect(rows[0]).toHaveTextContent("26 Nov 2026 · Pat Owner");
    expect(rows[1]).toHaveTextContent("backfill");
    expect(
      within(rows[1]).getByRole("link", { name: "Edit questions for Kookaburra Plumbing" }),
    ).toHaveAttribute("href", "/brands/b-2/questions?edit=1");
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Brand",
      "Areas",
      "Everyday",
      "Written by you",
      "Version",
      "Last change",
      "Edit questions",
    ]);
  });

  it("a change saves 500 ms later with an inline Saved; the stepper stays within 5 and the included count", async () => {
    handler = (_url, init) =>
      init?.method === "PUT" ? json({ defaults: {}, status: "saved" }) : json(view());
    render(<QuestionSettings />);
    await screen.findByTestId("p05-defaults");
    const more = screen.getByRole("button", { name: "More everyday questions" });
    expect(more).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Fewer everyday questions" }));
    expect(screen.getByRole("spinbutton")).toHaveAttribute("aria-valuenow", "9");
    await waitFor(() => expect(screen.getByTestId("p05-saved")).toHaveTextContent("Saved"), {
      timeout: 3000,
    });
    const put = calls.find((c) => c.init?.method === "PUT");
    expect(JSON.parse(String(put?.init?.body))).toEqual({
      everydayCount: 9,
      fillWithSuggestions: true,
    });
  });

  it("Starter: the stepper, the switch and Copy are off, with the Growth marker", async () => {
    handler = () => json(view({ plan: "starter", planName: "Starter", canWrite: false }));
    render(<QuestionSettings />);
    await screen.findByTestId("p05-defaults");
    expect(screen.getByRole("button", { name: "Fewer everyday questions" })).toBeDisabled();
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByTestId("p05-copy-open")).toBeDisabled();
    expect(screen.getAllByTestId("p05-lock").length).toBeGreaterThanOrEqual(3);
  });

  it("no brands: one sentence and Add brand; load failure: the warning and Retry", async () => {
    handler = () => json(view({ brands: [] }));
    const first = render(<QuestionSettings />);
    expect(await screen.findByTestId("p05-empty")).toHaveTextContent(
      "No brands yet. Add a brand to set its questions.",
    );
    first.unmount();
    handler = () => json({ error: "nope" }, 500);
    render(<QuestionSettings />);
    const alert = await screen.findByTestId("p05-error");
    expect(alert).toHaveTextContent("We couldn't load question settings. Try again.");
    handler = () => json(view());
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("p05-defaults")).toBeInTheDocument();
  });

  it("Copy: two different brands, then the inline status names the target", async () => {
    handler = (url) => (url.includes("/copy-from") ? json({ added: 4 }) : json(view()));
    render(<QuestionSettings />);
    await screen.findByTestId("p05-defaults");
    fireEvent.click(screen.getByTestId("p05-copy-open"));
    const modal = screen.getByRole("dialog", { name: "Copy questions from another brand" });
    fireEvent.change(within(modal).getByLabelText("Target brand"), { target: { value: "b-1" } });
    expect(within(modal).getByRole("alert")).toHaveTextContent("Choose two different brands.");
    expect(within(modal).getByRole("button", { name: "Copy" })).toBeDisabled();
    fireEvent.change(within(modal).getByLabelText("Target brand"), { target: { value: "b-2" } });
    await act(async () => {
      fireEvent.click(within(modal).getByRole("button", { name: "Copy" }));
    });
    expect(await screen.findByTestId("p05-copied")).toHaveTextContent(
      "Copied 4 questions to Kookaburra Plumbing as suggestions. Review them in its Questions tab.",
    );
    const sent = calls.find((c) => c.url.includes("/copy-from"));
    expect(sent?.url).toBe("/api/brands/b-2/questions/copy-from");
    expect(JSON.parse(String(sent?.init?.body))).toEqual({ sourceBrandId: "b-1" });
  });
});

describe("the Account list's Questions entry", () => {
  it("only when asked, after Notifications; otherwise the list is as before", () => {
    const off = accountItems(false).map((i) => i.href);
    expect(off).not.toContain("/settings/questions");
    expect(off).toEqual(ACCOUNT_ITEMS.filter((i) => !i.flag).map((i) => i.href));
    const on = accountItems(true).map((i) => i.href);
    expect(on).toHaveLength(off.length + 1);
    expect(on[on.indexOf("/settings/notifications") + 1]).toBe("/settings/questions");
  });
});
