// @vitest-environment jsdom
/**
 * 6 Nov (phone-layout follow-ups, item 9) -- a brand's reports list. Each row used to
 * be a <div role="button" tabIndex={0}> that opened the report on Enter only, with the
 * row's Download link and Try again button nested inside it. Now the report's headline
 * is a real <button type="button">: Enter and Space open the report, and the row's own
 * controls are separate, each reachable on its own.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useParams: () => ({ brandId: "brand-1" }),
  usePathname: () => "/brands/brand-1/reports",
}));

import ReportsListPage from "@/app/(auth)/brands/[brandId]/reports/page";

const READY = {
  id: "report-1",
  headline: "AI Visibility Report, 2026-W44",
  periodLabel: "2026-W44",
  pdfUrl: "https://files.example.com/report-1.pdf",
  pdfLinkUnavailable: false,
  status: "ready",
  createdAt: "2026-11-01T05:51:00.000Z",
};

const realFetch = global.fetch;
function serveReady() {
  global.fetch = vi.fn((url: string) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve(url.startsWith("/api/report-branding") ? { agencyName: "" } : [READY]),
    }),
  ) as unknown as typeof fetch;
}

async function headlineButton(timeout = 4_000) {
  render(<ReportsListPage />);
  return screen.findByRole("button", { name: READY.headline }, { timeout });
}

// The page's first render is the slow one (a cold process: 8.7 s once on a loaded
// machine): done here, with room for that, not in a test.
beforeAll(async () => {
  serveReady();
  await headlineButton(30_000);
  cleanup();
  global.fetch = realFetch;
}, 60_000);
beforeEach(serveReady);
afterEach(() => {
  cleanup();
  global.fetch = realFetch;
  vi.clearAllMocks();
});

describe("a report's row", () => {
  it("is opened by a real button, not a div with role=button", async () => {
    const button = await headlineButton();
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("type", "button");
    expect(document.querySelector('div[role="button"]')).toBeNull();
  });

  it("Enter opens the report", async () => {
    const user = userEvent.setup();
    const button = await headlineButton();
    button.focus();
    await user.keyboard("{Enter}");
    expect(router.push).toHaveBeenCalledWith("/brands/brand-1/reports/report-1");
  });

  it("Space opens the report too (the old row only took Enter)", async () => {
    const user = userEvent.setup();
    const button = await headlineButton();
    button.focus();
    await user.keyboard(" ");
    expect(router.push).toHaveBeenCalledWith("/brands/brand-1/reports/report-1");
  });

  it("its Download link is its own stop, outside the button, and doesn't open the report", async () => {
    const user = userEvent.setup();
    const button = await headlineButton();
    const download = screen.getByRole("link", { name: `Download ${READY.headline}` });
    expect(button.contains(download)).toBe(false);
    button.focus();
    await user.tab();
    expect(download).toHaveFocus();
    await waitFor(() => expect(router.push).not.toHaveBeenCalled());
  });
});
