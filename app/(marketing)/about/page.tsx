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
            in their logs reads what it is. What it fetches is lib/crawler/index.ts's crawlSite (and fetchRobotsTxt,
            lib/crawler/crawler-access.ts's home-page check). Follow-ups from af8de42..d1eb5a1, part 2: every
            request is this user agent -- four checks sent GPTBot's, and CDN Shield GPTBot's, ClaudeBot's,
            Googlebot's and PerplexityBot's; none can now (tests/unit/crawler/no-borrowed-user-agent.test.ts). */}
        <h2 id="site-checker" className="text-xl font-semibold text-foreground pt-2">
          Our site checker
        </h2>
        <p>
          For each customer&apos;s website, {PRODUCT_NAME} reads its public pages: its robots.txt,
          its sitemap and up to 20 pages. Every request identifies itself as{" "}
          <code>{CRAWLER_USER_AGENT}</code>; we never send another company&apos;s crawler name. To
          say whether an AI crawler such as GPTBot may read a site, we read the rules its robots.txt
          sets for that crawler. Whether a CDN or firewall lets an AI crawler through can&apos;t be
          tested from outside without pretending to be it, so we don&apos;t: a site&apos;s own
          server logs, uploaded to {PRODUCT_NAME}, show the crawler&apos;s real, verified visits. If
          you see our checker in your logs and didn&apos;t expect it, email{" "}
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
