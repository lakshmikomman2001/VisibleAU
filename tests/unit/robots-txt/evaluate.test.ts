/**
 * Follow-ups from af8de42..d1eb5a1 (10 Nov), part 2 -- whether robots.txt lets an AI crawler in, from the file's
 * own rules (RFC 9309), never by visiting as that crawler (lib/robots-txt/evaluate.ts).
 */
import { describe, expect, it } from "vitest";
import { evaluateRobotsForAgent, readinessRobots } from "@/lib/robots-txt/evaluate";

const gpt = (txt: string | null, path = "/") => evaluateRobotsForAgent(txt, "GPTBot", path);

describe("robots.txt and GPTBot: allow, block, absent", () => {
  it("allows: its own group says Allow", () => {
    const r = gpt("User-agent: GPTBot\nAllow: /\n");
    expect(r.verdict).toBe("allowed");
    expect(r.basis).toBe("agent-group");
    expect(r.sentence).toBe("robots.txt allows GPTBot");
  });

  it("blocks: its own group says Disallow: /", () => {
    const r = gpt("User-agent: GPTBot\nDisallow: /\n");
    expect(r.verdict).toBe("blocked");
    expect(r.rule).toBe("Disallow: /");
    expect(r.sentence).toBe("robots.txt blocks GPTBot");
  });

  it("absent: no robots.txt, so nothing in it blocks GPTBot", () => {
    const r = gpt(null);
    expect(r.verdict).toBe("allowed");
    expect(r.basis).toBe("no-robots-txt");
    expect(r.sentence).toBe("No robots.txt was found, so nothing in it blocks GPTBot");
  });

  it("no group for it and no *: it has no rules for GPTBot", () => {
    const r = gpt("User-agent: Bingbot\nDisallow: /\n");
    expect(r.verdict).toBe("allowed");
    expect(r.basis).toBe("no-matching-group");
    expect(r.sentence).toBe("robots.txt has no rules for GPTBot, so it doesn't block it");
  });

  it("the * group applies only when there's no GPTBot group", () => {
    expect(gpt("User-agent: *\nDisallow: /\n").verdict).toBe("blocked");
    expect(gpt("User-agent: *\nDisallow: /\n").sentence).toContain("User-agent: *");
    // Its own group wins over * entirely.
    expect(gpt("User-agent: *\nDisallow: /\n\nUser-agent: GPTBot\nAllow: /\n").verdict).toBe(
      "allowed",
    );
  });
});

describe("RFC 9309's rules", () => {
  it("a Disallow for another path doesn't block the home page (the old check said it did)", () => {
    expect(gpt("User-agent: GPTBot\nDisallow: /admin\n").verdict).toBe("allowed");
    expect(gpt("User-agent: GPTBot\nDisallow: /admin\n", "/admin/users").verdict).toBe("blocked");
  });

  it("an empty Disallow allows everything", () => {
    expect(gpt("User-agent: GPTBot\nDisallow:\n").verdict).toBe("allowed");
  });

  it("the longest match wins, and Allow wins a tie", () => {
    const txt = "User-agent: GPTBot\nDisallow: /\nAllow: /blog\n";
    expect(gpt(txt, "/blog/post").verdict).toBe("allowed");
    expect(gpt(txt, "/shop").verdict).toBe("blocked");
    expect(gpt("User-agent: GPTBot\nDisallow: /a\nAllow: /a\n", "/a").verdict).toBe("allowed");
  });

  it("* and $ in paths", () => {
    const txt = "User-agent: GPTBot\nDisallow: /*.pdf$\n";
    expect(gpt(txt, "/files/menu.pdf").verdict).toBe("blocked");
    expect(gpt(txt, "/files/menu.pdf?x=1").verdict).toBe("allowed");
  });

  it("user agents match case-insensitively, several lines make one group, and groups merge", () => {
    const txt =
      "User-agent: Gptbot\nUser-agent: ClaudeBot\nDisallow: /private\n\nUser-agent: GPTBOT\nDisallow: /\n";
    expect(gpt(txt).verdict).toBe("blocked");
    expect(evaluateRobotsForAgent(txt, "ClaudeBot").verdict).toBe("allowed");
    expect(evaluateRobotsForAgent(txt, "ClaudeBot", "/private").verdict).toBe("blocked");
  });

  it("comments, CRLF, a BOM and other fields don't change anything", () => {
    const txt =
      "﻿# hello\r\nUser-agent: GPTBot # OpenAI\r\nCrawl-delay: 5\r\nDisallow: / # all\r\nSitemap: https://x/s.xml\r\n";
    expect(gpt(txt).verdict).toBe("blocked");
  });
});

describe("agent readiness's robots check", () => {
  it("names the crawler robots.txt blocks", () => {
    const r = readinessRobots("User-agent: ClaudeBot\nDisallow: /\n");
    expect(r.allowsCrawlers).toBe(false);
    expect(r.gap).toBe(
      "robots.txt blocks ClaudeBot. Allow it if you want that AI engine to read your site.",
    );
  });

  it("a Disallow: /admin under * isn't a block (it was)", () => {
    expect(readinessRobots("User-agent: *\nDisallow: /admin\n").allowsCrawlers).toBe(true);
  });

  it("both blocked, and none", () => {
    expect(readinessRobots("User-agent: *\nDisallow: /\n").gap).toBe(
      "robots.txt blocks GPTBot and ClaudeBot. Allow them if you want those AI engines to read your site.",
    );
    expect(readinessRobots(null)).toMatchObject({ allowsCrawlers: true, gap: null });
  });
});
