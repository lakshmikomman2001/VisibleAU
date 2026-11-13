// @vitest-environment jsdom
/**
 * 13 Nov (Sri's walk-through, part 2): Edit, save and the Brand settings form.
 * - Edit goes to the form and focuses the name; Save says Saving… then Saved, or the API's reason, keeping
 *   what was typed; a saved name tells the top bar's brand switcher to read its list again.
 * - Competitors can be added and removed (the wizard's rule), and the audit page's link lands at Add.
 * - Primary regions has Change location; "1 suburb", "2 suburbs".
 * - The wizard suggests a readable name where the domain shows the words, and asks about a run-together one.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/brands/hero-brand",
  useSearchParams: () => new URLSearchParams(),
}));

import { WorkspaceSwitcher } from "@/components/domain/agency/workspace-switcher";
import { BrandDetailClient } from "@/components/domain/brand/brand-detail-client";
import { BRANDS_CHANGED_EVENT } from "@/lib/brands/brands-changed";

const BRAND = {
  id: "hero-brand",
  name: "herohomeservices",
  domain: "herohomeservices.com.au",
  vertical: "tradies",
  region: "au",
  competitors: [] as string[],
  primaryRegions: ["NSW:Yennora"],
  suburb: "Yennora",
  state: "NSW",
  locationMode: "fixed" as const,
  locationConfirmedAt: "2026-11-12T03:00:00.000Z",
};
const PROPS = {
  auditCount: 1,
  recentAudits: [],
  latestAudit: null,
  avgPosition: null,
  totalMentions: 0,
  engineStats: [],
};

let patchAnswer: () => Response;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  patchAnswer = () => new Response(JSON.stringify({ brand: {} }), { status: 200 });
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") return patchAnswer();
    return new Response(JSON.stringify({ brands: [] }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  router.refresh.mockClear();
  window.history.replaceState(null, "", "/brands/hero-brand");
});
afterEach(() => vi.unstubAllGlobals());

const patchBody = () =>
  JSON.parse(fetchMock.mock.calls.find((c) => c[1]?.method === "PATCH")?.[1]?.body as string);

describe("Edit and Save", () => {
  it("Edit focuses the Brand settings name; Save says Saving… then Saved, and the switcher hears of it", async () => {
    const heard = vi.fn();
    window.addEventListener(BRANDS_CHANGED_EVENT, heard);
    render(<BrandDetailClient {...PROPS} brand={BRAND} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const nameField = screen.getByLabelText("Brand name");
    await waitFor(() => expect(document.activeElement).toBe(nameField));
    fireEvent.change(nameField, { target: { value: "Hero Home Services" } });
    let release: (r: Response) => void = () => {};
    patchAnswer = () =>
      new Promise<Response>((r) => {
        release = r;
      }) as unknown as Response;
    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[0]);
    expect(await screen.findAllByText("Saving…")).not.toHaveLength(0);
    await act(async () => release(new Response(JSON.stringify({ brand: {} }), { status: 200 })));
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(patchBody()).toEqual({
      name: "Hero Home Services",
      domain: "herohomeservices.com.au",
      vertical: "tradies",
    });
    expect(router.refresh).toHaveBeenCalled();
    expect(heard).toHaveBeenCalledTimes(1);
    window.removeEventListener(BRANDS_CHANGED_EVENT, heard);
  });

  it("a refused save shows the API's reason and keeps what was typed, still editing", async () => {
    patchAnswer = () =>
      new Response(JSON.stringify({ error: "That domain is already a brand." }), { status: 409 });
    render(<BrandDetailClient {...PROPS} brand={BRAND} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Brand name"), {
      target: { value: "Hero Home Services" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[0]);
    expect((await screen.findAllByText("That domain is already a brand.")).length).toBeGreaterThan(
      0,
    );
    expect(screen.getByLabelText("Brand name")).toHaveValue("Hero Home Services");
    expect(screen.getByLabelText("Brand name")).toBeEnabled();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe("competitors in Brand settings", () => {
  it("add (Enter or Add), refuse a duplicate, remove, and Save sends the list", async () => {
    render(<BrandDetailClient {...PROPS} brand={BRAND} />);
    expect(screen.getByText("No competitors yet. Click Edit to add one.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const add = screen.getByLabelText("Add a competitor");
    fireEvent.change(add, { target: { value: "Fixit Plumbing" } });
    fireEvent.keyDown(add, { key: "Enter" });
    fireEvent.change(add, { target: { value: "Acme Hot Water" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.change(add, { target: { value: "fixit plumbing" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("alert")).toHaveTextContent("fixit plumbing is already listed.");
    fireEvent.click(screen.getByRole("button", { name: "Remove Fixit Plumbing" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[0]);
    await screen.findByText("Saved");
    expect(patchBody().competitors).toEqual(["Acme Hot Water"]);
  });

  it("the audit page's 'Add competitors in brand settings' lands editing, at Add", async () => {
    window.history.replaceState(null, "", "/brands/hero-brand#add-competitor");
    render(<BrandDetailClient {...PROPS} brand={BRAND} />);
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText("Add a competitor")),
    );
  });
});

describe("Primary regions", () => {
  it("Change location opens the location picker; the count reads 1 suburb / 2 suburbs", () => {
    const view = render(<BrandDetailClient {...PROPS} brand={BRAND} />);
    expect(screen.getByText("1 suburb")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change location" }));
    // 13 Nov, part 2: the location is already confirmed, so the picker changes it (Save, Cancel).
    expect(screen.getByText("Change your business location")).toBeInTheDocument();
    view.rerender(
      <BrandDetailClient
        {...PROPS}
        brand={{ ...BRAND, primaryRegions: ["NSW:Yennora", "NSW:Fairfield"] }}
      />,
    );
    expect(screen.getByText("2 suburbs")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("(s)");
  });
});

describe("the top bar's brand switcher", () => {
  it("reads the brand list again when a brand was saved", async () => {
    render(<WorkspaceSwitcher tier="growth" brandCount={1} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => {
      window.dispatchEvent(new Event(BRANDS_CHANGED_EVENT));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls.every((c) => c[0] === "/api/brands")).toBe(true);
  });
});
