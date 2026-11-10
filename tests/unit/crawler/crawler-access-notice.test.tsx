// @vitest-environment jsdom
/**
 * Follow-ups from af8de42..d1eb5a1 (10 Nov), part 2 -- the Crawler Logs page's notice says what was checked, as
 * us: robots.txt's rules (a fact), our checker refused (a fact about our checker, its fix said as a condition),
 * and what can't be tested from outside, with a link to the log upload. It said "Cloudflare is blocking AI
 * search engines from reading your site" after one request sent as GPTBot.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  type CrawlerAccessCheckView,
  CrawlerAccessNotice,
} from "@/components/domain/retrieval/cdn-block-alert";
import { CDN_UNTESTABLE_SENTENCE } from "@/lib/crawler/access-copy";

afterEach(cleanup);

const base: CrawlerAccessCheckView = {
  brandDomain: "omega.com.au",
  robotsTxt: "found",
  robots: [
    { agent: "GPTBot", verdict: "allowed", sentence: "robots.txt allows GPTBot" },
    { agent: "ClaudeBot", verdict: "allowed", sentence: "robots.txt allows ClaudeBot" },
  ],
  robotsBlocks: [],
  checkerRefused: false,
  probeStatus: 200,
  detectedFirewall: "Cloudflare",
  remediationSnippet: null,
  untestable: CDN_UNTESTABLE_SENTENCE,
};

const notice = (check: CrawlerAccessCheckView, hasVisits = false) =>
  render(
    <CrawlerAccessNotice
      check={check}
      hasVisits={hasVisits}
      logsHref="/brands/b1/retrieval/agent-analytics"
    />,
  );

describe("the Crawler Logs page's AI crawler notice", () => {
  it("nothing blocked, no logs: no alert, and the plain 'can't be tested from outside' with the log upload", () => {
    notice(base);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const p = document.querySelector("[data-cdn-untestable]");
    expect(p?.textContent).toContain("can't be tested from outside without pretending to be them");
    expect(screen.getByRole("link", { name: "Connect your logs" })).toHaveAttribute(
      "href",
      "/brands/b1/retrieval/agent-analytics",
    );
    expect(document.body.textContent).not.toMatch(/is blocking AI/);
  });

  it("robots.txt blocks a crawler: says so, from the file", () => {
    notice({
      ...base,
      robots: [
        { agent: "GPTBot", verdict: "blocked", sentence: "robots.txt blocks GPTBot" },
        { agent: "ClaudeBot", verdict: "allowed", sentence: "robots.txt allows ClaudeBot" },
      ],
      robotsBlocks: ["GPTBot"],
    });
    expect(
      screen.getByRole("alert", { name: "robots.txt blocks AI crawlers" }),
    ).toBeInTheDocument();
    expect(screen.getByText("robots.txt blocks GPTBot.")).toBeInTheDocument();
  });

  it("our checker refused: about our checker, never 'blocks AI crawlers'", () => {
    notice({
      ...base,
      checkerRefused: true,
      probeStatus: 403,
      remediationSnippet:
        "Cloudflare refused our site checker on <brand domain>. If it refuses AI search crawlers the same way, allow them: ...",
    });
    const alert = screen.getByRole("alert", { name: "Your site refused our site checker" });
    expect(alert.textContent).toContain(
      "Cloudflare answered our checker (Vunnara-Audit-Bot) with HTTP 403",
    );
    expect(alert.textContent).toContain("Cloudflare refused our site checker on omega.com.au");
    expect(alert.textContent).not.toMatch(/is blocking AI/);
  });

  it("with visits: the logs are what show who gets through", () => {
    notice(base, true);
    expect(document.querySelector("[data-cdn-untestable]")?.textContent).toContain(
      "The verified visits below show which AI crawlers get through",
    );
  });
});
