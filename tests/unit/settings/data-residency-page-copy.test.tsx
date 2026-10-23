// @vitest-environment jsdom

/**
 * "Addendum: production functions run in iad1, not Sydney" (23 Oct) --
 * production evidence (a failed Inngest run-audit step's
 * FUNCTION_INVOCATION_TIMEOUT) showed the app's own compute executing
 * in Washington DC despite vercel.json's `"regions": ["syd1"]`, and the
 * Vercel dashboard marking that setting "Overridden" -- most likely a
 * Hobby-plan limitation (custom function regions are a Pro/Enterprise
 * feature), not a repo-level override (none was found). This page's
 * copy previously named only the database and the AI providers; it now
 * also names application compute (with an honest caveat instead of a
 * false "always Sydney"), Upstash, Inngest, and email -- "every place
 * data actually goes", per this task's own instruction -- rather than
 * silently implying Australia-only processing by omission.
 */
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

function stubFetch() {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve([]),
  }) as unknown as typeof fetch;
}

import DataResidencyPage from "@/app/(auth)/settings/data-residency/page";

describe("Data Residency page -- names every place data actually goes (23 Oct addendum)", () => {
  it("states the database, storage, and rate-limiting locations", () => {
    stubFetch();
    render(<DataResidencyPage />);
    expect(screen.getByText(/Neon \(AWS\s*\n?\s*ap-southeast-2, Sydney\)/)).toBeInTheDocument();
    expect(screen.getByText(/Supabase Storage \(AWS/)).toBeInTheDocument();
    expect(screen.getByText(/Upstash Redis \(Sydney\)/)).toBeInTheDocument();
  });

  it("gives an honest caveat on application compute, never an unqualified 'always Sydney' claim", () => {
    stubFetch();
    render(<DataResidencyPage />);
    expect(
      screen.getByText(/Application servers are configured to run in Sydney too/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/some requests may be processed in the\s*\n?\s*United States/),
    ).toBeInTheDocument();
  });

  it("names the AI providers and that their processing happens outside Australia", () => {
    stubFetch();
    render(<DataResidencyPage />);
    expect(screen.getByText(/OpenAI, Anthropic,\s*\n?\s*Google, Perplexity/)).toBeInTheDocument();
    expect(screen.getByText(/prompts are not used to train their models/)).toBeInTheDocument();
  });

  it("names Inngest and Resend's own data locations", () => {
    stubFetch();
    render(<DataResidencyPage />);
    expect(screen.getByText(/Inngest, whose\s*\n?\s*own/)).toBeInTheDocument();
    expect(screen.getByText(/hosted on AWS in the United States/)).toBeInTheDocument();
    expect(screen.getByText(/Resend/)).toBeInTheDocument();
    expect(
      screen.getByText(/stored in the United States regardless of\s*\n?\s*sending region/),
    ).toBeInTheDocument();
  });
});
