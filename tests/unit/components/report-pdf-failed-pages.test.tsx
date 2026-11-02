// @vitest-environment jsdom

/**
 * URGENT PDF reports (1 Nov), part 2 -- production's 2026-W44 report sat on
 * "Generating... · Pending..." for good after its PDF failed. The real
 * report pages, against an API that says the PDF failed: they show "Failed"
 * (red), "PDF couldn't be created." and "Try again", and stop polling
 * (failed is as final as ready). "Try again" posts to retry-pdf and goes
 * back to generating. A report that has a PDF whose link couldn't be
 * signed shows as ready, not "Generating...".
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useParams: () => ({ brandId: "brand-1", reportId: "report-1" }),
  usePathname: () => "/brands/brand-1/reports",
}));

import ReportDetailPage from "@/app/(auth)/brands/[brandId]/reports/[reportId]/page";
import ReportsListPage from "@/app/(auth)/brands/[brandId]/reports/page";

const FAILED = {
  id: "report-1",
  headline: "AI Visibility Report",
  narrativeText: "Visibility held steady.",
  periodLabel: "2026-W44",
  reportType: "weekly",
  pdfUrl: null,
  emailSentAt: null,
  keyWins: null,
  keyGaps: null,
  fanOutSummary: null,
  topicalSummary: null,
  mentionSourceSummary: null,
  confidenceNotes: null,
  createdAt: "2026-11-01T05:51:00.000Z",
  status: "failed",
  pdfFailureReason: "storage_unavailable",
  pdfLinkUnavailable: false,
};

/** A scripted API: GETs answer with `get()`, the retry POST with `retryStatus`. */
function serve(opts: { get: () => unknown; retryStatus?: number; retryBody?: unknown }) {
  const calls = { gets: 0, posts: [] as string[] };
  global.fetch = vi.fn((url: string, init?: RequestInit) => {
    // 2 Nov: the reports list also asks, once, which agency name its
    // reports print (for its "add your agency name" hint) -- not a poll.
    if (url.startsWith("/api/report-branding")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ agencyName: "Splice Marketing" }),
      });
    }
    if (init?.method === "POST") {
      calls.posts.push(url);
      return Promise.resolve({
        ok: (opts.retryStatus ?? 202) < 300,
        status: opts.retryStatus ?? 202,
        json: () => Promise.resolve(opts.retryBody ?? { status: "generating" }),
      });
    }
    calls.gets += 1;
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(opts.get()) });
  }) as unknown as typeof fetch;
  return calls;
}

const realFetch = global.fetch;
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  global.fetch = realFetch;
  vi.clearAllMocks();
});

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("a report whose PDF failed", () => {
  it("shows Failed, why, and Try again -- and doesn't poll", async () => {
    const calls = serve({ get: () => FAILED });
    render(<ReportDetailPage />);
    await advance(0);
    expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/PDF couldn't be created/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Reason: file storage couldn't be reached/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText(/being generated|Generating/)).not.toBeInTheDocument();

    await advance(60_000);
    expect(calls.gets).toBe(1); // the first load only: failed is terminal
    expect(vi.getTimerCount()).toBe(0);
  });

  it("Try again: posts to retry-pdf, shows Generating, and polls until the PDF arrives", async () => {
    let answer: unknown = FAILED;
    const calls = serve({ get: () => answer });
    render(<ReportDetailPage />);
    await advance(0);

    answer = { ...FAILED, status: "generating", pdfFailureReason: null };
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    await advance(0);
    expect(calls.posts).toEqual(["/api/brands/brand-1/reports/report-1/retry-pdf"]);
    expect(screen.getAllByText(/Generating/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Failed")).not.toBeInTheDocument();

    answer = {
      ...FAILED,
      status: "ready",
      pdfFailureReason: null,
      pdfUrl: "https://signed.example/r.pdf",
    };
    await advance(4_000);
    expect(screen.getAllByText("Download PDF").length).toBeGreaterThan(0);
  });

  it("a viewer's Try again: the server's 403 message is shown, and it stays Failed", async () => {
    serve({
      get: () => FAILED,
      retryStatus: 403,
      retryBody: { error: "Only an owner, admin or analyst can create a report's PDF again." },
    });
    render(<ReportDetailPage />);
    await advance(0);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    await advance(0);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Only an owner, admin or analyst can create a report's PDF again.",
    );
    expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);
  });
});

describe("the reports list", () => {
  const LIST_ROW = {
    id: "report-1",
    headline: "AI Visibility Report",
    periodLabel: "2026-W44",
    reportType: "weekly",
    pdfUrl: null,
    emailSentAt: null,
    createdAt: "2026-11-01T05:51:00.000Z",
    status: "failed",
    pdfFailureReason: "storage_unavailable",
    pdfLinkUnavailable: false,
  };

  it("a failed row: Failed, 'PDF couldn't be created.', Try again -- no polling; Try again goes back to generating", async () => {
    let rows: unknown[] = [LIST_ROW];
    const calls = serve({ get: () => rows });
    render(<ReportsListPage />);
    await advance(0);
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("PDF couldn't be created.")).toBeInTheDocument();
    expect(screen.queryByText("Pending...")).not.toBeInTheDocument();
    await advance(60_000);
    expect(calls.gets).toBe(1);

    rows = [{ ...LIST_ROW, status: "generating", pdfFailureReason: null }];
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    await advance(0);
    expect(calls.posts).toEqual(["/api/brands/brand-1/reports/report-1/retry-pdf"]);
    expect(router.push).not.toHaveBeenCalled(); // the button doesn't also open the report
    expect(screen.getByText("Generating...")).toBeInTheDocument();
    await advance(4_000);
    expect(calls.gets).toBe(2); // polling again
  });

  it("a report with a PDF whose link couldn't be signed: Ready, 'Unavailable right now' -- not Generating, no polling", async () => {
    const calls = serve({
      get: () => [
        { ...LIST_ROW, status: "ready", pdfFailureReason: null, pdfLinkUnavailable: true },
      ],
    });
    render(<ReportsListPage />);
    await advance(0);
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("Unavailable right now")).toBeInTheDocument();
    expect(screen.queryByText("Generating...")).not.toBeInTheDocument();
    await advance(60_000);
    expect(calls.gets).toBe(1);
  });
});
