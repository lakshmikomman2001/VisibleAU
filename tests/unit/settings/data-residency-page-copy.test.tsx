// @vitest-environment jsdom

/**
 * "Addendum: production functions run in iad1, not Sydney" (23 Oct),
 * corrected (23 Oct, follow-up): Vercel's dashboard confirms functions
 * DO run in syd1 -- "Overridden" meant vercel.json's own `"regions"`
 * value takes precedence over the dashboard's UI setting, not that the
 * Hobby plan was silently ignoring it. Hobby's "single region" limit
 * is satisfied by one region of your choosing (syd1 qualifies); the
 * earlier report's "most likely a Hobby-plan limitation... some
 * requests may be processed in the United States" was wrong and is
 * removed. The iad1 seen in the original error was most likely the
 * edge entry point Inngest's own US-hosted servers hit when calling
 * back into /api/webhooks/inngest, not the function's own region.
 *
 * This page's copy previously named only the database and the AI
 * providers; it now also names application compute (Sydney, with
 * middleware's own actual, narrow data access -- a session-cookie
 * check and the request's path/geo-country, nothing account- or
 * brand-specific), Upstash, Inngest, and email -- "every place data
 * actually goes", per this task's own instruction -- rather than
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

  it("states application functions run in Sydney, and describes middleware's actual (narrow) data access", () => {
    stubFetch();
    render(<DataResidencyPage />);
    expect(
      screen.getByText(/Application functions run in Sydney, Australia\./),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/checks for a\s*\n?\s*signed-in session cookie/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not read your account or brand data/),
    ).toBeInTheDocument();
    // The corrected claim never hedges Sydney with "not always
    // guaranteed" or "may be processed in the United States" --
    // that was the wrong claim this follow-up removed.
    expect(screen.queryByText(/not always guaranteed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/may be processed in the United States/)).not.toBeInTheDocument();
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
