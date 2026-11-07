import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";

export function generateMetadata(): Metadata {
  return buildMetadata({ title: "Privacy Policy", path: "/privacy" });
}

export default function PrivacyPage() {
  return (
    <article className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-8">Last updated: November 2026</p>
      <div className="space-y-6 text-sm text-muted-foreground">
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">Information we collect</h2>
          {/* Methodology v2.2 (7 Nov), part 6 -- a draft for Sri's review, not legal advice. What is sent:
              lib/brands/classify-brand.ts (name, domain and home page title, description and first heading,
              to Claude, once, when a business is added); lib/prompts/build-prompt-pack.ts (the questions
              never use the domain); lib/brands/region-label.ts buildEngineLocation (a confirmed fixed
              location's city and state, to ChatGPT's and Claude's web search). */}
          <p>
            When you create an account, we collect your email address, business name, and domain.
            When you add a business, we send its name and website address, with its home page&apos;s
            title, description and main heading, to Anthropic (Claude) to work out what kind of
            business it is. When you run an audit, we send questions to the AI providers listed
            under Third-party services: questions your customers might ask, which name your kind of
            business and the area you serve, and a few questions that name your business. Once
            you&apos;ve confirmed your business&apos;s location, its city and state also go to
            ChatGPT&apos;s and Claude&apos;s web search as an approximate location.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            How we use your information
          </h2>
          {/* Part 6: only what's enforced -- no deletion period. The weekly retention job can't delete
              audits (action_items, drift_alerts, audit_exports and engine_call_failures reference them
              with no ON DELETE rule), closing a workspace deletes nothing, and evidence snapshots and the
              answer cache are never purged. */}
          <p>
            Your information is used solely to run AI visibility audits and deliver reports. We do
            not sell your data. The questions we send to the AI providers, and their answers, are
            saved with your audit results. We keep them until you ask us to delete them.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">Third-party services</h2>
          {/* Part 6: the providers, as the Data Residency page lists them (lib/governance/residency-config.ts:
              OpenAI, Anthropic, Google and Perplexity, US, per provider API data-usage terms). */}
          <p>
            The questions we send, and the business details above, are processed by OpenAI
            (ChatGPT), Anthropic (Claude), Google (Gemini) and Perplexity through their APIs, in the
            United States, under each provider&apos;s API data-usage terms. Payment processing is
            handled by Stripe. We use these services under their respective data processing
            agreements.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">Your rights</h2>
          <p>
            Under the Australian Privacy Act 1988, you have the right to access, correct, or delete
            your personal information. Contact us at{" "}
            <a href="mailto:privacy@visibleau.com" className="underline text-primary">
              privacy@visibleau.com
            </a>{" "}
            to exercise these rights.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">Complaints</h2>
          <p>
            If you believe we have breached the Australian Privacy Principles, you may lodge a
            complaint with the Office of the Australian Information Commissioner (OAIC) at{" "}
            <span className="text-foreground">oaic.gov.au</span>.
          </p>
        </section>
        <p>
          For questions:{" "}
          <a href="mailto:privacy@visibleau.com" className="underline text-primary">
            privacy@visibleau.com
          </a>
        </p>
      </div>
    </article>
  );
}
