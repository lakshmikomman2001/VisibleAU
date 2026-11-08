import type { Metadata } from "next";
import { RESPONSE_SNIPPET_CHARS } from "@/lib/audit/response-snippet";
import { AUTH_RATE_LIMIT_RETENTION_HOURS } from "@/lib/governance/residency-config";
import {
  AUDIT_QUESTIONS,
  AUDIT_RESULTS_DELETED,
  SENT_FOR_A_CONFIRMED_LOCATION,
  SENT_WHEN_A_BUSINESS_IS_ADDED,
} from "@/lib/legal/data-facts";
import { PRIVACY_EMAIL } from "@/lib/product";
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
              location's city and state, to ChatGPT's and Claude's web search). 9 Nov: the sentences live in
              lib/legal/data-facts.ts, shared with the FAQ and the Data Residency page. */}
          <p>
            When you create an account, we collect your email address, business name, and domain.{" "}
            {SENT_WHEN_A_BUSINESS_IS_ADDED} When you run an audit, we send questions to the AI
            providers listed under Third-party services: {AUDIT_QUESTIONS}.{" "}
            {SENT_FOR_A_CONFIRMED_LOCATION}
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            How we use your information
          </h2>
          {/* Only what's enforced. Retention follow-ups (9 Nov), part 3: the weekly retention job deletes an
              audit AUDIT_DATA_RETENTION_MONTHS after it ran, with its questions and answers
              (lib/retention/audit-retention.ts). Kept until deletion is asked for: generated PDF reports and
              the evidence archive (lib/trust/evidence-archiver.ts, RESPONSE_SNIPPET_CHARS of each first-run
              answer), and the actions someone has started or finished. */}
          <p>
            Your information is used solely to run AI visibility audits and deliver reports. We do
            not sell your data. The questions we send to the AI providers, and their answers, are
            saved with your audit results. {AUDIT_RESULTS_DELETED} Two copies are kept until you ask
            us to delete them: PDF reports you&apos;ve made, and your business&apos;s evidence
            archive (the first {RESPONSE_SNIPPET_CHARS} characters of each answer, with its
            question). Actions you&apos;ve started or finished stay in your Action Center.
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
          <h2 className="text-lg font-semibold text-foreground mb-2">Sign-in protection</h2>
          {/* Brand-feature locks and pricing claims (8 Nov), part 5 -- stated once it's enforced: better-auth
              counts these routes per caller address (lib/auth/rate-limit-rules.ts), and the daily cleanup
              (inngest/functions/sample-audit-cleanup.ts) deletes a count once its last attempt is
              AUTH_RATE_LIMIT_RETENTION_HOURS old (lib/auth/rate-limit-cleanup.ts). */}
          <p>
            To slow down password guessing, we count attempts to sign in, sign up, change a password
            or email address, or send a password reset or verification email, by the internet (IP)
            address they come from. We keep that address with its count until a daily clean-up
            deletes it, once {AUTH_RATE_LIMIT_RETENTION_HOURS} hours have passed since the last
            attempt.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">Your rights</h2>
          <p>
            Under the Australian Privacy Act 1988, you have the right to access, correct, or delete
            your personal information. Contact us at{" "}
            <a href={`mailto:${PRIVACY_EMAIL}`} className="underline text-primary">
              {PRIVACY_EMAIL}
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
          <a href={`mailto:${PRIVACY_EMAIL}`} className="underline text-primary">
            {PRIVACY_EMAIL}
          </a>
        </p>
      </div>
    </article>
  );
}
