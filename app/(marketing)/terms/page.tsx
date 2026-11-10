import type { Metadata } from "next";
import { CONTACT_EMAIL, LEGAL_ABN, LEGAL_ENTITY_NAME, PRODUCT_NAME } from "@/lib/product";
import { buildMetadata } from "@/lib/seo/metadata";

export function generateMetadata(): Metadata {
  return buildMetadata({ title: "Terms of Service", path: "/terms" });
}

export default function TermsPage() {
  return (
    <article className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
      <p className="text-sm text-muted-foreground mb-8">Last updated: June 2026</p>
      <div className="space-y-6 text-sm text-muted-foreground">
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">Acceptance of terms</h2>
          <p>
            {/* 10 Nov (Sri): operated by a sole trader, not the company this named. The name and ABN are
                lib/product.ts's constants, placeholders until Sri supplies them. */}
            By using {PRODUCT_NAME}, you agree to these Terms of Service. {PRODUCT_NAME} is operated
            by {LEGAL_ENTITY_NAME} (ABN {LEGAL_ABN}), a sole trader in Australia.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">Service description</h2>
          <p>
            {PRODUCT_NAME} audits your brand&apos;s visibility across AI search engines by sending
            standardised prompts to LLM provider APIs and analysing the responses. Results are
            indicative and may vary between audits.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">Billing</h2>
          <p>
            Paid plans are billed monthly or annually via Stripe. All prices are in Australian
            dollars and include GST. You can cancel at any time from your billing settings — your
            plan remains active until the end of the billing period.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">Acceptable use</h2>
          <p>
            You may not use {PRODUCT_NAME} to abuse LLM provider APIs, impersonate other businesses,
            or conduct activities that violate Australian law.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">Limitation of liability</h2>
          <p>
            {PRODUCT_NAME} provides AI visibility scores on a best-effort basis. We are not liable
            for business decisions made based on audit results. Our total liability is limited to
            the fees paid in the 12 months preceding any claim.
          </p>
        </section>
        <p>
          Questions?{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline text-primary">
            {CONTACT_EMAIL}
          </a>
        </p>
      </div>
    </article>
  );
}
