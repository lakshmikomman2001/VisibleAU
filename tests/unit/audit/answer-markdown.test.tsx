/**
 * 13 Nov (Sri's walk-through, part 10): the Responses tab printed AI answers as raw markdown (`**Hero** Home
 * Services`, `([localsearch.com.au](https://…?utm_source=openai))`, `| Provider | … |` / `|------|`). They
 * render as formatted text now -- bold, lists, tables, links -- through a renderer that never sets HTML:
 * a `<script>` in an answer is text, a `javascript:` or `data:` link is text, links open in a new tab with
 * rel="noopener noreferrer nofollow", and tracking parameters leave both the link and its text.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnswerMarkdown } from "@/components/domain/audit/answer-markdown";
import { ResponseAnswerText } from "@/components/domain/audit/response-answer-text";
import { parseMarkdown, safeHref } from "@/lib/answers/markdown";

const html = (text: string) => renderToStaticMarkup(<AnswerMarkdown text={text} />);

// From audit #46's ChatGPT answer, as Sri quoted it.
const ANSWER = [
  "Here are some well-reviewed options in and around Yennora, NSW:",
  "",
  "1. **Hero** Home Services (Yennora-based)",
  "   - Address: 9/3 Dursley Rd, Yennora NSW 2161",
  "   - Profile: ([localsearch.com.au](https://www.localsearch.com.au/profile/hero-home-services/yennora-nsw?utm_source=openai))",
  "2. Fixit Plumbing",
  "",
  "| Provider | Location/Service Area | Highlights |",
  "|------|------|------|",
  "| **Hero Home Services** | Yennora | Hot water repairs |",
  "| Fixit Plumbing | Fairfield | _Same-day_ service |",
  "",
  "**Hero Home Services** is an excellent choice.",
].join("\n");

describe("formatted, not raw", () => {
  it("bold, a numbered list with its sub-points, a table and a link", () => {
    const out = html(ANSWER);
    expect(out).toContain("<strong>Hero</strong> Home Services (Yennora-based)");
    expect(out).toMatch(
      /<ol[^>]*><li><strong>Hero<\/strong> Home Services \(Yennora-based\)<ul[^>]*><li>Address: 9\/3 Dursley Rd, Yennora NSW 2161<\/li>/,
    );
    expect(out).toMatch(
      /<table[^>]*><thead><tr><th[^>]*>Provider<\/th><th[^>]*>Location\/Service Area<\/th><th[^>]*>Highlights<\/th>/,
    );
    expect(out).toMatch(/<td[^>]*><strong>Hero Home Services<\/strong><\/td>/);
    expect(out).toMatch(/<td[^>]*><em>Same-day<\/em> service<\/td>/);
    expect(out).toContain(
      '<a href="https://www.localsearch.com.au/profile/hero-home-services/yennora-nsw" target="_blank" rel="noopener noreferrer nofollow"',
    );
    expect(out).toContain(">localsearch.com.au</a>");
    expect(out).not.toMatch(/\*\*|\|------|utm_source/);
  });

  it("a bare address is a link too, without its tracking tag, as text and as link", () => {
    const out = html(
      "See https://hipages.com.au/connect/omega?utm_source=chatgpt.com for reviews.",
    );
    expect(out).toContain(
      '<a href="https://hipages.com.au/connect/omega" target="_blank" rel="noopener noreferrer nofollow"',
    );
    expect(out).toContain(">https://hipages.com.au/connect/omega</a> for reviews.");
  });

  it("headings, a rule and a code block are kept apart", () => {
    const blocks = parseMarkdown("## Best options\n\nText\n\n---\n\n```\ncode <b>x</b>\n```");
    expect(blocks.map((b) => b.kind)).toEqual(["heading", "paragraph", "rule", "code"]);
  });
});

describe("safe: an answer can't run anything or link anywhere odd", () => {
  it("a <script> in an answer is shown as text", () => {
    const out = html('Try this <script>alert("x")</script> and <img src=x onerror=alert(1)>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  });

  it.each([
    ["javascript:", "[click me](javascript:alert(1))"],
    ["data:", "[click me](data:text/html;base64,PHNjcmlwdD4=)"],
    ["vbscript:", "[click me](vbscript:msgbox)"],
  ])("a %s link is plain text", (_scheme, md) => {
    const out = html(md);
    expect(out).not.toContain("<a");
    expect(out).toContain("click me");
  });

  it("safeHref keeps http(s) only, without tracking parameters", () => {
    expect(safeHref("https://example.com.au/a?utm_source=openai&id=3")).toBe(
      "https://example.com.au/a?id=3",
    );
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("not a url")).toBeNull();
  });
});

describe("the Responses tab", () => {
  it("shows the stored answer formatted", () => {
    const out = renderToStaticMarkup(
      <ResponseAnswerText responseText={ANSWER} responseSnippet={null} />,
    );
    expect(out).toContain('data-answer-kind="full"');
    expect(out).toContain("<strong>Hero</strong> Home Services");
    expect(out).toContain("<table");
    expect(out).not.toContain("|------|");
  });
});
