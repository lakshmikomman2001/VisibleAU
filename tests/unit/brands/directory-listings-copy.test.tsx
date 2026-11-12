// @vitest-environment jsdom
/**
 * 13 Nov (Sri's walk-through, part 4): Brand settings said "Tell us where you're listed -- we never check this
 * for you automatically" while the audit said "add the links so we can check them". What the product does:
 * it never looks the business up on a directory; it matches the profile link the owner adds against the
 * pages AI cites. Both say that now, and "Listed" asks for the link the audit's "Your profile" needs.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DirectoryListingsCard } from "@/components/domain/brand/directory-listings-card";
import { LINK_PROFILES_HINT } from "@/lib/directories/profile-status";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            directories: [
              {
                key: "hipages",
                name: "hipages",
                status: null,
                profileUrl: null,
                confirmedAt: null,
              },
            ],
          }),
          { status: 200 },
        ),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("the directory listings copy agrees with what the product does", () => {
  it("Brand settings: add the link, we match it against what AI cites, we never look you up", async () => {
    render(<DirectoryListingsCard brandId="brand-1" />);
    expect(
      screen.getByText(
        "Add your profile link for each directory you're on. We match it against the pages AI cites in your audits; we never look you up on the directories ourselves.",
      ),
    ).toBeInTheDocument();
    const select = await screen.findByLabelText("hipages");
    expect([...(select as HTMLSelectElement).options].map((o) => o.textContent)).toEqual([
      "Choose…",
      "Listed: add my profile link",
      "Not listed",
      "Not sure",
    ]);
    fireEvent.change(select, { target: { value: "listed" } });
    expect(screen.getByLabelText("Your hipages profile link")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/--|never check/);
  });

  it("the audit page, the report and the PDF say the same: match, not check", () => {
    expect(LINK_PROFILES_HINT).toBe(
      "Add your directory profile links in brand settings so we can match them with what AI cites.",
    );
    const findings = readFileSync("lib/reports/report-findings.ts", "utf8");
    expect(findings).toContain(
      "add your profile links in brand settings so we can match them with what AI cites.",
    );
    expect(findings).not.toContain("so we can check them");
    const pdf = readFileSync("lib/reports/pdf/report-document.tsx", "utf8");
    expect(pdf).not.toContain("so we can match them\n");
    expect(pdf.match(/so we can match them with what AI/g)).toHaveLength(2);
  });
});
