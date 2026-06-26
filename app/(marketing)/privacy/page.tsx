import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";

export function generateMetadata(): Metadata {
  return buildMetadata({ title: "Privacy Policy", path: "/privacy" });
}

export default function PrivacyPage() {
  return (
    <article className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Last updated: June 2026
      </p>
      <div className="space-y-6 text-sm text-muted-foreground">
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Information we collect
          </h2>
          <p>
            When you create an account, we collect your email address, business
            name, and domain. When you run an audit, we send your domain and
            business name to LLM provider APIs (OpenAI, Anthropic, Google,
            Perplexity) to generate visibility reports.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            How we use your information
          </h2>
          <p>
            Your information is used solely to run AI visibility audits and
            deliver reports. We do not sell your data. Prompt inputs are not
            stored beyond 24 hours.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Third-party services
          </h2>
          <p>
            Audit data is processed by LLM providers via their APIs. Payment
            processing is handled by Stripe. We use these services under their
            respective data processing agreements.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Your rights
          </h2>
          <p>
            Under the Australian Privacy Act 1988, you have the right to access,
            correct, or delete your personal information. Contact us at{" "}
            <a
              href="mailto:privacy@visibleau.com"
              className="underline text-primary"
            >
              privacy@visibleau.com
            </a>{" "}
            to exercise these rights.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Complaints
          </h2>
          <p>
            If you believe we have breached the Australian Privacy Principles,
            you may lodge a complaint with the Office of the Australian
            Information Commissioner (OAIC) at{" "}
            <span className="text-foreground">oaic.gov.au</span>.
          </p>
        </section>
        <p>
          For questions:{" "}
          <a
            href="mailto:privacy@visibleau.com"
            className="underline text-primary"
          >
            privacy@visibleau.com
          </a>
        </p>
      </div>
    </article>
  );
}
