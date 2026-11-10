import type { Metadata } from "next";
import { CONTACT_EMAIL, CRAWLER_USER_AGENT, PRODUCT_NAME } from "@/lib/product";
import { buildMetadata } from "@/lib/seo/metadata";

export function generateMetadata(): Metadata {
  return buildMetadata({ title: "About", path: "/about" });
}

export default function AboutPage() {
  return (
    <article className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-6">About {PRODUCT_NAME}</h1>
      <div className="space-y-4 text-muted-foreground">
        <p>
          {PRODUCT_NAME} helps Australian service businesses understand how AI search engines
          describe them when customers ask questions like &ldquo;best plumber in Bondi&rdquo; or
          &ldquo;recommend a physio in Melbourne.&rdquo;
        </p>
        {/* Display-only relabel below ("source citation"): this dimension measures citation rate
        (accuracyDimensionScore), not factual correctness. DB column (score_accuracy) and internal
        key (accuracy) are unchanged — see docs/ops for the Phase 1 writeup. */}
        {/* Methodology v2.2 (7 Nov), part 5: only what's measured is said to be measured. */}
        <p>
          We audit your brand&apos;s visibility across ChatGPT, Claude, Gemini, and Perplexity —
          measuring how often the answers name you, where they place you, and which sources they
          cite. Sentiment and context are coming soon. Then we give you specific recommendations to
          improve.
        </p>
        {/* Playwright-run follow-ups (10 Nov), part 7: the bot's user agent points here, so a site owner who sees it
            in their logs reads what it is. What it fetches is lib/crawler/index.ts's crawlSite; the four checks that
            pass userAgent "GPTBot/1.1" (llms.txt generate and refresh, agent readiness, content structure, entity
            home) are said too, so this page is true of every request. */}
        <h2 id="site-checker" className="text-xl font-semibold text-foreground pt-2">
          Our site checker
        </h2>
        <p>
          For each customer&apos;s website, {PRODUCT_NAME} reads its public pages: its robots.txt,
          its sitemap and up to 20 pages. The site check identifies itself as{" "}
          <code>{CRAWLER_USER_AGENT}</code>. The checks that test what an AI crawler is shown (the
          llms.txt draft, agent readiness, content structure and the entity home page) send
          GPTBot&apos;s user agent instead, so they get the page GPTBot gets. If you see either in
          your logs and didn&apos;t expect it, email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline text-primary">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
        <p>
          Built by an indie developer in Sydney. Questions?{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline text-primary">
            {CONTACT_EMAIL}
          </a>
        </p>
      </div>
    </article>
  );
}
