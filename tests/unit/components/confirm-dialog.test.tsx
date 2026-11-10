// @vitest-environment jsdom
/**
 * Follow-ups from af8de42..d1eb5a1 (10 Nov), part 4 -- deleting a brand asks through the shared confirm dialog
 * (components/shared/confirm-dialog.tsx): role="alertdialog", named by its title and described by what it
 * will do, focus on Cancel when it opens, Tab and Shift+Tab kept inside, Escape cancels, and focus back on
 * Delete when it closes. It was a plain div with none of that.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/brands/b1",
}));

const BRAND = {
  id: "b1",
  name: "Omega Services",
  domain: "omega.com.au",
  vertical: "tradies",
  region: "au",
  competitors: [],
  classificationStatus: "complete" as const,
  locationConfirmedAt: "2026-10-18T11:20:59.000Z",
  primaryRegions: ["NSW:Norwest"],
};
const PROPS = {
  auditCount: 2,
  recentAudits: [],
  latestAudit: null,
  avgPosition: null,
  totalMentions: 0,
  engineStats: [],
};

async function openDelete() {
  const { BrandDetailClient } = await import("@/components/domain/brand/brand-detail-client");
  render(<BrandDetailClient {...PROPS} brand={BRAND} />);
  const trigger = screen.getByRole("button", { name: "Delete" });
  trigger.focus();
  fireEvent.click(trigger);
  return { trigger, dialog: screen.getByRole("alertdialog", { name: "Delete Omega Services?" }) };
}

beforeAll(async () => {
  await import("@/components/domain/brand/brand-detail-client");
}, 60_000);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the delete-brand dialog", () => {
  it("is an alertdialog, named by its title and described by what it will do", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({})),
    );
    const { dialog } = await openDelete();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription(/This cannot be undone/);
  });

  it("opens with focus on Cancel, and Tab / Shift+Tab stay inside", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({})),
    );
    await openDelete();
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Delete brand" });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(confirm).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(cancel).toHaveFocus();
  });

  it("Escape cancels, nothing is deleted, and focus goes back to Delete", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({}));
    vi.stubGlobal("fetch", fetchMock);
    const { trigger } = await openDelete();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        (call) => (call[1] as RequestInit | undefined)?.method === "DELETE",
      ),
    ).toBe(false);
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("a refused delete says why inside the dialog, and stays open", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === "DELETE"
          ? Response.json({ error: "Only the owner can delete a brand." }, { status: 403 })
          : Response.json({}),
      ),
    );
    const { dialog } = await openDelete();
    fireEvent.click(screen.getByRole("button", { name: "Delete brand" }));
    expect(await screen.findByText("Only the owner can delete a brand.")).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
  });
});
