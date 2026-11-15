// @vitest-environment jsdom
/**
 * 16 Nov, part 5 -- the wizard never ends on an error: a new brand's first audit starts when the owner confirms what
 * the business does on its page (ClassificationConfirmCard startFirstAudit), not in the wizard before that -- where
 * POST /api/audits always refused it ("brand needs confirmation").
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClassificationConfirmCard } from "@/components/domain/brand/classification-confirm-card";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

let fetchMock: ReturnType<typeof vi.fn>;
function stubFetch(audit: () => Response) {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/brands/brand-1/confirm-classification" && init?.method === "PATCH") {
      return Response.json({ brand: { id: "brand-1" } });
    }
    if (url === "/api/audits" && init?.method === "POST") return audit();
    return Response.json({});
  });
  vi.stubGlobal("fetch", fetchMock);
}

function renderCard(startFirstAudit: boolean) {
  render(
    <ClassificationConfirmCard
      brandId="brand-1"
      suggestedCategory="cafe"
      suggestedAudience="households"
      suggestedCompetitors={[]}
      confidence={0.92}
      vertical="local_business"
      startFirstAudit={startFirstAudit}
    />,
  );
}

beforeEach(() => {
  router.push.mockClear();
  router.refresh.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a brand with no audit yet", () => {
  it("says its first audit starts on Confirm, and the button says so", () => {
    stubFetch(() => Response.json({ auditId: "audit-1" }, { status: 201 }));
    renderCard(true);
    expect(
      screen.getByText(/Confirm what it does, and its first audit starts/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirm and start the first audit" }),
    ).toBeInTheDocument();
  });

  it("confirms, then starts the first audit and opens it", async () => {
    stubFetch(() => Response.json({ auditId: "audit-1" }, { status: 201 }));
    renderCard(true);
    fireEvent.click(screen.getByRole("button", { name: "Confirm and start the first audit" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/audits/audit-1"));
    const urls = fetchMock.mock.calls.map(([url]) => url);
    // Confirmed first, then the audit -- never the other way round.
    expect(urls.indexOf("/api/brands/brand-1/confirm-classification")).toBeLessThan(
      urls.indexOf("/api/audits"),
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls.find(([url]) => url === "/api/audits")?.[1]?.body)),
    ).toEqual({
      brandId: "brand-1",
    });
  });

  it("an audit that doesn't start says so, in the API's words, with the details saved", async () => {
    stubFetch(() =>
      Response.json(
        { error: "plan_limit", message: "Your plan's one audit this month has been used." },
        { status: 402 },
      ),
    );
    renderCard(true);
    fireEvent.click(screen.getByRole("button", { name: "Confirm and start the first audit" }));
    expect(
      await screen.findByText(
        "Your details are saved, but the first audit didn't start: Your plan's one audit this month has been used.",
      ),
    ).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
    expect(router.refresh).toHaveBeenCalled();
  });
});

describe("a brand that already has audits", () => {
  it("confirms and starts nothing", async () => {
    stubFetch(() => Response.json({ auditId: "audit-1" }, { status: 201 }));
    renderCard(false);
    expect(screen.queryByText(/its first audit starts/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain("/api/audits");
    expect(router.push).not.toHaveBeenCalled();
  });
});
