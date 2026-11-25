// @vitest-environment jsdom
/**
 * S01B part 5 (LLD amendment 54, Sri's decision of 25 Nov 2026): the public pages say, where they list the other
 * services data goes to, "To confirm your business, we look up your business name and ABN on the Australian Business
 * Register (abr.business.gov.au), the government's public register. We keep what it returns (ABN, entity name,
 * status, postcode and state) with your brand and delete it after 12 months, as we do your audit results." One
 * sentence in lib/legal/data-facts.ts, beside SENT_WHEN_A_BUSINESS_IS_ADDED; the 12 months is the audits' own period,
 * which the retention job enforces for ABR results too (tests/integration/abr-retention.integration.test.ts).
 * RED on the parent: no such sentence anywhere.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as facts from "@/lib/legal/data-facts";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const SENTENCE =
  "To confirm your business, we look up your business name and ABN on the Australian Business Register (abr.business.gov.au), the government's public register. We keep what it returns (ABN, entity name, status, postcode and state) with your brand and delete it after 12 months, as we do your audit results.";

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

/** Read by name, so the parent (no such constant) fails on the value, not on the import. */
const abrLookup = (): unknown => (facts as Record<string, unknown>).ABR_LOOKUP;

// A cold first render can outlast a test's 5 s on this machine; pay for it here.
beforeAll(async () => {
  await import("@/components/domain/landing/faq-section");
  await import("@/app/(marketing)/privacy/page");
}, 60_000);

afterEach(() => {
  cleanup();
});

describe("the ABR lookup, in Sri's words, where the pages list the services data goes to", () => {
  it("is one shared sentence, with the audits' own 12 months", async () => {
    expect(abrLookup()).toBe(SENTENCE);
    const { AUDIT_DATA_RETENTION_MONTHS } = await import("@/lib/governance/residency-config");
    expect(AUDIT_DATA_RETENTION_MONTHS).toBe(12);
  });

  it("the FAQ's 'Is my data safe?' says it right after what goes to Claude when a business is added", async () => {
    const { FaqSection } = await import("@/components/domain/landing/faq-section");
    render(createElement(FaqSection));
    const button = screen.getByRole("button", { name: /^Is my data safe\?/ });
    fireEvent.click(button);
    const answer = button.parentElement?.querySelector("p")?.textContent ?? "";
    expect(answer).toContain(`${facts.SENT_WHEN_A_BUSINESS_IS_ADDED} ${SENTENCE}`);
  });

  it("the privacy page says it under Third-party services", async () => {
    const Page = (await import("@/app/(marketing)/privacy/page")).default;
    const html = renderToStaticMarkup(Page());
    // The section itself (its heading), not "listed under Third-party services" in the paragraph before it.
    const start = html.indexOf(">Third-party services</h2>");
    const end = html.indexOf(">Sign-in protection</h2>");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(text(html.slice(start, end))).toContain(SENTENCE);
  });
});
