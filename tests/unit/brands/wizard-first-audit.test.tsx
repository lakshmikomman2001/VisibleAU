// @vitest-environment jsdom
/**
 * Before the next push (11 Nov), part 3 -- the new-brand wizard creates the brand, then starts its first audit.
 * When that audit didn't start, the wizard went to /brands and said nothing; when the request never answered,
 * it stayed on the wizard saying "Something went wrong" with the brand already made, so Create brand again made
 * a second one. Sri, 11 Nov: land on the brand page with the reason -- "Your brand was created, but the first
 * audit couldn't start: <API message>. Run audit to try again." (lib/brands/first-audit-notice.ts).
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { WizardForm } from "@/app/(auth)/brands/wizard/wizard-form";
import type { VerticalPack } from "@/db/schema";
import {
  brandPageAfterFailedFirstAudit,
  firstAuditFailedSentence,
} from "@/lib/brands/first-audit-notice";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/brands/b1" }));
vi.mock("@/components/domain/set-breadcrumbs", () => ({ SetBreadcrumbs: () => null }));
vi.mock("@/components/domain/vertical/prompt-preview", () => ({ PromptPreview: () => null }));
vi.mock("@/components/domain/vertical/pack-browser", () => ({
  PackBrowser: ({ onSelect }: { onSelect: (pack: VerticalPack) => void }) => (
    <button
      type="button"
      onClick={() =>
        onSelect({
          id: "pack-1",
          name: "Tradies AU",
          vertical: "tradies",
          promptsCount: 10,
        } as VerticalPack)
      }
    >
      select-pack
    </button>
  ),
}));

const AUDIT_CONFIG = {
  freeEngines: 2,
  freeRuns: 1,
  paidEngines: 4,
  paidRuns: 1,
  promptsPerAudit: 10,
};
const REFUSAL = "Your plan's one audit this month has been used.";
const STORED_KEY = "first-audit-failed-brand-1";

/** /api/brands creates "brand-1"; /api/audits answers with `audit`. */
function stubFetch(audit: () => Promise<Response>) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url === "/api/brands") return Response.json({ brand: { id: "brand-1" } }, { status: 201 });
    if (url === "/api/audits") return audit();
    return Response.json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function createBrand() {
  render(<WizardForm auditConfig={AUDIT_CONFIG} />);
  fireEvent.change(screen.getByLabelText("Brand name"), { target: { value: "Omega Services" } });
  fireEvent.change(screen.getByLabelText("Domain"), { target: { value: "omega.com.au" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByText("select-pack"));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByLabelText(/No fixed location/i));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("button", { name: /Create brand/i }));
  await waitFor(() => expect(router.push).toHaveBeenCalled());
}

beforeEach(() => {
  router.push.mockClear();
  router.refresh.mockClear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the wizard, when the brand is created but its first audit doesn't start", () => {
  it("lands on the brand page and keeps the API's reason for it", async () => {
    stubFetch(async () =>
      Response.json({ error: "plan_limit", message: REFUSAL }, { status: 402 }),
    );
    await createBrand();
    expect(router.push).toHaveBeenCalledWith("/brands/brand-1?firstAudit=failed");
    expect(router.push).not.toHaveBeenCalledWith("/brands");
    expect(sessionStorage.getItem(STORED_KEY)).toBe(REFUSAL);
  });

  it("a request that never answers lands there too, and the brand is made once", async () => {
    const fetchMock = stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    await createBrand();
    expect(router.push).toHaveBeenCalledWith(brandPageAfterFailedFirstAudit("brand-1"));
    expect(sessionStorage.getItem(STORED_KEY)).toMatch(/didn't get an answer/);
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/brands")).toHaveLength(1);
  });

  it("an answer with no reason in it lands there, with nothing made up", async () => {
    stubFetch(async () => new Response("Internal Server Error", { status: 500 }));
    await createBrand();
    expect(router.push).toHaveBeenCalledWith("/brands/brand-1?firstAudit=failed");
    expect(sessionStorage.getItem(STORED_KEY)).toBeNull();
  });

  it("an audit that starts still goes to the audit", async () => {
    stubFetch(async () => Response.json({ auditId: "audit-1" }, { status: 201 }));
    await createBrand();
    expect(router.push).toHaveBeenCalledWith("/audits/audit-1");
  });
});

const BRAND = {
  id: "brand-1",
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
  auditCount: 0,
  recentAudits: [],
  latestAudit: null,
  avgPosition: null,
  totalMentions: 0,
  engineStats: [],
};

async function renderBrandPage(url: string) {
  window.history.replaceState(null, "", url);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({})),
  );
  const { BrandDetailClient } = await import("@/components/domain/brand/brand-detail-client");
  render(<BrandDetailClient {...PROPS} brand={BRAND} />);
}

describe("the brand page after the wizard", () => {
  beforeAll(async () => {
    await import("@/components/domain/brand/brand-detail-client");
  }, 60_000);

  it("says the brand was created and why the first audit didn't start, then drops the flag", async () => {
    sessionStorage.setItem(STORED_KEY, REFUSAL);
    await renderBrandPage("/brands/brand-1?firstAudit=failed");
    const alert = await screen.findByText(/Your brand was created/);
    expect(alert).toHaveAttribute("role", "alert");
    expect(alert).toHaveTextContent(
      "Your brand was created, but the first audit couldn't start: Your plan's one audit this month has been used. Run audit to try again.",
    );
    expect(window.location.search).toBe("");
    expect(sessionStorage.getItem(STORED_KEY)).toBeNull();
    expect(screen.getByRole("button", { name: "Run audit" })).toBeInTheDocument();
  });

  it("without a reason it still says the audit didn't start, and nothing in its place", async () => {
    await renderBrandPage("/brands/brand-1?firstAudit=failed");
    expect(await screen.findByText(/Your brand was created/)).toHaveTextContent(
      "Your brand was created, but the first audit couldn't start. Run audit to try again.",
    );
  });

  it("an ordinary visit says nothing of it, and words in the URL never reach the page", async () => {
    sessionStorage.setItem(STORED_KEY, REFUSAL);
    await renderBrandPage("/brands/brand-1?firstAudit=yes&reason=Call+1800+000+000");
    await screen.findByRole("button", { name: "Run audit" });
    expect(screen.queryByText(/Your brand was created/)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("1800");
    expect(sessionStorage.getItem(STORED_KEY)).toBe(REFUSAL);
  });
});

describe("the sentence", () => {
  it("joins the API's reason without doubling its full stop", () => {
    expect(firstAuditFailedSentence("Monthly limit reached.")).toBe(
      "Your brand was created, but the first audit couldn't start: Monthly limit reached. Run audit to try again.",
    );
    expect(firstAuditFailedSentence(null)).toBe(
      "Your brand was created, but the first audit couldn't start. Run audit to try again.",
    );
    expect(firstAuditFailedSentence("  ")).toBe(firstAuditFailedSentence(null));
  });
});
