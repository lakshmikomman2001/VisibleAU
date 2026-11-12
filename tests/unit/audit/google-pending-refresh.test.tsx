// @vitest-environment jsdom
/**
 * 13 Nov (Sri's walk-through, part 5): the Google block said "checking Google… 0 of 13 questions back" and
 * "This updates when Google is done", and Sri reloaded to see results that came 2 minutes later. The block
 * does poll (GoogleSurfacesRefresher: every 10-15 s, for 20 minutes, then "Reload the page"), and it refreshes
 * the page when Google is done; coming back to a background tab asks at once. And "Directories AI cited"
 * says what those links are.
 */
import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { DirectoriesCitedPanel } from "@/components/domain/audit/directories-cited-panel";
import { GoogleSurfacesRefresher } from "@/components/domain/audit/google-surfaces-refresher";

let statuses: string[];
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  statuses = [];
  fetchMock = vi.fn(async () => {
    const status = statuses.shift() ?? "collecting";
    return new Response(JSON.stringify({ status, rows: [] }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  router.refresh.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("the Google block while Google is still answering", () => {
  it("polls, and refreshes the page once Google is done -- no reload needed", async () => {
    statuses = ["collecting", "collecting", "complete"];
    render(<GoogleSurfacesRefresher auditId="audit-1" />);
    expect(screen.getByText("This updates when Google is done.")).toBeInTheDocument();
    await advance(15_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/audits/audit-1/google-surfaces");
    await advance(25_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("coming back to a background tab asks at once", async () => {
    statuses = ["complete"];
    render(<GoogleSurfacesRefresher auditId="audit-1" />);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("after 20 minutes it stops and says to reload", async () => {
    render(<GoogleSurfacesRefresher auditId="audit-1" />);
    await advance(20 * 60_000 + 30_000);
    expect(
      screen.getByText(
        "Google is taking longer than usual. Reload the page to see what's come back.",
      ),
    ).toBeInTheDocument();
    const calls = fetchMock.mock.calls.length;
    await advance(5 * 60_000);
    expect(fetchMock.mock.calls.length).toBe(calls);
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe("Directories AI cited says what the links are", () => {
  it("one line under the heading", () => {
    const html = renderToStaticMarkup(
      <DirectoriesCitedPanel totalAnswers={12} rows={[]} />,
    ).replace(/&#x27;/g, "'");
    expect(html).toContain(
      "These are the pages AI used as sources for these answers. They list local businesses; being listed on them is one way businesses get recommended.",
    );
  });
});
