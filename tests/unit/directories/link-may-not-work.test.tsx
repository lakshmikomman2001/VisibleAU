// @vitest-environment jsdom
/**
 * 13 Nov follow-up, item 5 (part 5's recommendation; Sri approved it): audit #48 listed
 * yellowpages.com.au/yennora-nsw-2161-nsw-2161-nsw-2161-nsw-2161-nsw-2161/handyman-services among the pages AI
 * cited -- the string as the AI gave it. A cited page we can't vouch for says "This link may not work", judged from
 * what's stored, with nothing fetched, and the link still opens the URL as stored (without tracking tags, as every
 * link does):
 * - the AI wrote it in its answer's text (origin "recalled") and it names a page, not just a site;
 * - or its path repeats the same part three or more times in a row.
 * Shown in "Directories AI cited", the Responses tab's sources and the Action Center's evidence (address only: the
 * evidence keeps no origin).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { DbClient } from "@/db/client";
import { citations } from "@/db/schema";
import { getDirectoryCitationsForAudit } from "@/lib/directories/citation-counts";
import { hasRepeatedPath, LINK_MAY_NOT_WORK, linkDoubt } from "@/lib/urls/link-doubt";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const AUDIT_48 =
  "https://www.yellowpages.com.au/yennora-nsw-2161-nsw-2161-nsw-2161-nsw-2161-nsw-2161/handyman-services";
const REAL_PAGE = "https://www.yellowpages.com.au/find/handyman-services/yennora-nsw-2161";
const TYPED_PAGE = "https://www.hipages.com.au/connect/hero-home-services";

/** The two queries the panel's function makes: citations rows, then no confirmed listings. */
function stubDb(rows: Array<{ citedSources: unknown }>): DbClient {
  const select = () => ({
    from: (table: unknown) => ({ where: async () => (table === citations ? rows : []) }),
  });
  return { select } as unknown as DbClient;
}

describe("linkDoubt: from the stored source alone", () => {
  it("audit #48's link repeats its path; the real page shape doesn't", () => {
    expect(linkDoubt({ url: AUDIT_48, origin: "retrieved" })).toBe("repeated_path");
    expect(linkDoubt({ url: REAL_PAGE, origin: "retrieved" })).toBeNull();
    expect(hasRepeatedPath("https://x.com.au/nsw/nsw/nsw/plumbers")).toBe(true);
    expect(hasRepeatedPath("https://x.com.au/a/b/a/b/a/b")).toBe(true);
    expect(hasRepeatedPath("https://x.com.au/nsw/nsw/plumbers")).toBe(false);
    expect(hasRepeatedPath("not a url")).toBe(false);
  });

  it("a page the AI wrote in its answer may not work; a site it named, or a page its search returned, may", () => {
    expect(linkDoubt({ url: TYPED_PAGE, origin: "recalled" })).toBe("written_by_ai");
    expect(linkDoubt({ url: "https://hipages.com.au", origin: "recalled" })).toBeNull();
    expect(linkDoubt({ url: TYPED_PAGE, origin: "retrieved" })).toBeNull();
    // No origin stored (Action Center evidence): only the address is judged.
    expect(linkDoubt({ url: TYPED_PAGE })).toBeNull();
    expect(linkDoubt({ url: AUDIT_48 })).toBe("repeated_path");
  });
});

describe("Directories AI cited: each page says whether it may not work, the URL kept as stored", () => {
  it("from the stored answers, deduplicated", async () => {
    const tagged = `${TYPED_PAGE}?utm_source=chatgpt.com`;
    const result = await getDirectoryCitationsForAudit(
      stubDb([
        { citedSources: [{ domain: "yellowpages.com.au", url: AUDIT_48, origin: "retrieved" }] },
        { citedSources: [{ domain: "yellowpages.com.au", url: REAL_PAGE, origin: "retrieved" }] },
        { citedSources: [{ domain: "hipages.com.au", url: tagged, origin: "recalled" }] },
        {
          citedSources: [
            { domain: "hipages.com.au", url: "https://hipages.com.au", origin: "recalled" },
          ],
        },
      ]),
      "audit-48",
      { id: "hero", region: "au", categories: ["trades_general"] },
    );
    const pages = (key: string) =>
      result.results.find((r) => r.directory.key === key)?.citedUrls.map((u) => [u.url, u.doubt]);
    expect(pages("yellow_pages_au")).toEqual([
      [AUDIT_48, "repeated_path"],
      [REAL_PAGE, null],
    ]);
    expect(pages("hipages")).toEqual([
      [tagged, "written_by_ai"],
      ["https://hipages.com.au", null],
    ]);
  });

  it("the same page returned by an engine's search in another answer isn't marked as written by the AI", async () => {
    const result = await getDirectoryCitationsForAudit(
      stubDb([
        { citedSources: [{ domain: "hipages.com.au", url: TYPED_PAGE, origin: "recalled" }] },
        { citedSources: [{ domain: "hipages.com.au", url: TYPED_PAGE, origin: "retrieved" }] },
      ]),
      "audit-48",
      { id: "hero", region: "au", categories: ["trades_general"] },
    );
    const hipages = result.results.find((r) => r.directory.key === "hipages");
    expect(hipages?.citedUrls).toEqual([{ url: TYPED_PAGE, displayUrl: TYPED_PAGE, doubt: null }]);
  });
});

describe("what the owner sees", () => {
  beforeAll(async () => {
    await import("@/components/domain/audit/directories-cited-panel");
    await import("@/components/domain/action-center/evidence-link");
  }, 60_000);
  afterEach(() => vi.clearAllMocks());

  it("the panel labels the doubtful link, says why on hover, and the link opens the stored page", async () => {
    const { DirectoriesCitedPanel } = await import(
      "@/components/domain/audit/directories-cited-panel"
    );
    render(
      <DirectoriesCitedPanel
        totalAnswers={12}
        rows={[
          {
            key: "yellow_pages_au",
            name: "Yellow Pages",
            citedCount: 2,
            ownerProfileLinked: false,
            ownerProfileCitedCount: 0,
            citedUrls: [
              { url: AUDIT_48, displayUrl: AUDIT_48, doubt: "repeated_path" },
              { url: REAL_PAGE, displayUrl: REAL_PAGE, doubt: null },
            ],
          },
        ]}
      />,
    );
    const labels = document.querySelectorAll("[data-link-doubt]");
    expect(labels).toHaveLength(1);
    expect(labels[0]).toHaveTextContent(LINK_MAY_NOT_WORK);
    expect(labels[0]).toHaveAttribute("title", expect.stringMatching(/repeats the same part/));
    const links = [...document.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(links).toEqual([AUDIT_48, REAL_PAGE]);
  });

  it("the Action Center's evidence labels a link whose path repeats itself", async () => {
    const { EvidenceLink } = await import("@/components/domain/action-center/evidence-link");
    render(
      <EvidenceLink
        fallbackDescription="x"
        evidenceRefs={[
          { source: "Yellow Pages", url: AUDIT_48, summary: "cited", sourceType: "checker" },
          { source: "Yellow Pages", url: REAL_PAGE, summary: "cited", sourceType: "checker" },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /View evidence/ }));
    expect(document.querySelectorAll("[data-link-doubt]")).toHaveLength(1);
    expect(screen.getByText(LINK_MAY_NOT_WORK)).toBeInTheDocument();
  });

  it("the Responses tab judges each source with its stored origin", () => {
    const page = readFileSync(
      join(__dirname, "../../../app/(auth)/audits/[auditId]/page.tsx"),
      "utf8",
    );
    expect(page).toMatch(/linkDoubt\(\{ url: src\.url, origin: src\.origin \}\)/);
    expect(page).toMatch(/data-link-doubt=\{doubt\}/);
  });
});
