// @vitest-environment jsdom
/**
 * S01C part 5c (LLD amendment 65): "The signed-in Data Residency page lists the ABR, built from ABR_LOOKUP" --
 * wherever it lists DataForSEO: its paragraph (the FAQ's and the privacy page's own sentence) and a row of the
 * residency table, worded from the same 12-month constant so the two can't drift.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ResidencyTable } from "@/components/domain/governance/residency-table";
import {
  ABR_RESIDENCY_ENTRY,
  AUDIT_DATA_RETENTION_MONTHS,
  RESIDENCY_CONFIG,
} from "@/lib/governance/residency-config";
import { ABR_LOOKUP } from "@/lib/legal/data-facts";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

// A cold first render can outlast a test's 5 s on this machine; pay for it here.
beforeAll(async () => {
  await import("@/app/(auth)/settings/data-residency/page");
}, 60_000);

afterEach(() => cleanup());

describe("the ABR on the Data Residency page", () => {
  it("the page says ABR_LOOKUP, the FAQ's and the privacy page's sentence", async () => {
    const Page = (await import("@/app/(auth)/settings/data-residency/page")).default;
    expect(text(renderToStaticMarkup(createElement(Page)))).toContain(ABR_LOOKUP);
  });

  it("the residency list has its row, with the same period ABR_LOOKUP states", () => {
    expect(RESIDENCY_CONFIG).toContain(ABR_RESIDENCY_ENTRY);
    const months = `${AUDIT_DATA_RETENTION_MONTHS} months`;
    expect(ABR_LOOKUP).toContain(months);
    expect(ABR_RESIDENCY_ENTRY.retentionPeriod).toContain(months);
    expect(ABR_RESIDENCY_ENTRY.storageRegion).toContain("Australia");
  });

  it("the table shows it under its own heading", () => {
    render(
      createElement(ResidencyTable, {
        entries: [{ ...ABR_RESIDENCY_ENTRY }],
      }),
    );
    expect(screen.getByText("Business identity")).toBeInTheDocument();
    const table = screen.getByText("Business identity").closest("section") ?? document.body;
    // The group's subheading and the row's provider both name it.
    expect(
      within(table as HTMLElement).getAllByText(/Australian Business Register/).length,
    ).toBeGreaterThan(0);
    expect(document.body).toHaveTextContent(
      `deleted ${AUDIT_DATA_RETENTION_MONTHS} months after each check`,
    );
  });
});
