// @vitest-environment jsdom
/**
 * Mock-gate and retention follow-ups (9 Nov), part 5 -- the FAQ's "Is my data safe?" said "Your domain and business
 * name are sent to LLM providers", and the Data Residency page said an audit's prompts "include your brand name,
 * domain, and public website content". An audit's questions never carry the domain
 * (lib/prompts/build-prompt-pack.ts); it goes to Claude once, when a business is added
 * (lib/brands/classify-brand.ts). All three pages now say it in the same sentences, from lib/legal/data-facts.ts,
 * with the period the retention job enforces.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FaqSection } from "@/components/domain/landing/faq-section";
import {
  AUDIT_AI_PROVIDERS,
  AUDIT_QUESTIONS,
  AUDIT_RESULTS_DELETED,
  KEPT_UNTIL_YOU_ASK,
  SAMPLE_DATA_DELETED,
  SENT_FOR_A_CONFIRMED_LOCATION,
  SENT_WHEN_A_BUSINESS_IS_ADDED,
  SERVER_LOGS_KEPT,
} from "@/lib/legal/data-facts";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

// A cold first render can outlast a test's 5 s on this machine; pay for it here.
beforeAll(async () => {
  render(createElement(FaqSection));
  cleanup();
  await import("@/app/(marketing)/privacy/page");
  await import("@/app/(auth)/settings/data-residency/page");
}, 60_000);

afterEach(() => {
  cleanup();
});

describe("what an audit sends, the same on every page", () => {
  it("the FAQ: the questions (never the domain), the domain to Claude once, kept 12 months", () => {
    render(createElement(FaqSection));
    const button = screen.getByRole("button", { name: /^Is my data safe\?/ });
    fireEvent.click(button);
    const answer = button.parentElement?.querySelector("p")?.textContent ?? "";

    // 19 Nov (Sri's review): the providers by name, what outlives the deletion, the server logs -- and no
    // "We comply with Australia's Privacy Act 1988" (a legal claim nobody has checked).
    expect(answer).toBe(
      `When you run an audit, we send ${AUDIT_QUESTIONS} to ${AUDIT_AI_PROVIDERS}. ${SENT_FOR_A_CONFIRMED_LOCATION} ${SENT_WHEN_A_BUSINESS_IS_ADDED} The questions we send and the answers we get back are saved with your audit results. ${AUDIT_RESULTS_DELETED} ${KEPT_UNTIL_YOU_ASK} ${SERVER_LOGS_KEPT} ${SAMPLE_DATA_DELETED} Read the privacy policy`,
    );
    expect(answer).not.toMatch(/Privacy Act|comply|complian/i);
    expect(answer).not.toMatch(/domain and business name are sent/i);
    const auditSentence = answer.slice(0, answer.indexOf(". ") + 1);
    expect(auditSentence).not.toMatch(/domain|website/i);
    expect(AUDIT_RESULTS_DELETED).toBe(
      "We delete an audit's results 12 months after it ran, or sooner if you ask us to.",
    );
  });

  it("the privacy page says the same sentences", async () => {
    const Page = (await import("@/app/(marketing)/privacy/page")).default;
    const policy = text(renderToStaticMarkup(Page()));
    expect(policy).toContain(SENT_WHEN_A_BUSINESS_IS_ADDED);
    expect(policy).toContain(`${AUDIT_QUESTIONS}.`);
    expect(policy).toContain(AUDIT_RESULTS_DELETED);
    expect(policy).toContain(KEPT_UNTIL_YOU_ASK);
    expect(policy).toContain(`processed by ${AUDIT_AI_PROVIDERS} through their APIs`);
  });

  it("the Data Residency page: no domain in what audits send, the same sentences", async () => {
    const Page = (await import("@/app/(auth)/settings/data-residency/page")).default;
    const page = text(renderToStaticMarkup(createElement(Page)));
    expect(page).not.toMatch(/brand name, domain/i);
    expect(page).toContain(
      `Audits send AI providers in the United States (OpenAI, Anthropic, Google, Perplexity) ${AUDIT_QUESTIONS}.`,
    );
    expect(page).toContain(SENT_WHEN_A_BUSINESS_IS_ADDED);
  });
});
