import * as cheerio from "cheerio";
import type { CrawlPage } from "@/lib/crawler/types";

export interface PromptInjection {
  pattern: string;
  severity: "critical" | "warning" | "info";
  element: string;
}

// Zero-width and invisible Unicode codepoints
const INVISIBLE_RE = new RegExp(
  "[­​‌‍‎‏  ‪‫‬‭‮⁠﻿]",
);

export function detectPromptInjections(page: CrawlPage): PromptInjection[] {
  const $ = cheerio.load(page.html);
  const injections: PromptInjection[] = [];

  // 1. Hidden text
  $("[style]").each((_, el) => {
    const style = $(el).attr("style") ?? "";
    const text = $(el).text().trim();
    if (
      text.length > 20 &&
      (/display\s*:\s*none/i.test(style) || /visibility\s*:\s*hidden/i.test(style))
    ) {
      injections.push({ pattern: "hidden-text", severity: "critical", element: text.slice(0, 100) });
    }
  });

  // 2. Invisible Unicode
  const bodyText = $("body").text();
  if (INVISIBLE_RE.test(bodyText)) {
    injections.push({
      pattern: "invisible-unicode",
      severity: "critical",
      element: "Invisible Unicode characters detected in page content",
    });
  }

  // 3. LLM-instruction injections
  const llmRe =
    /ignore (previous|all|above)|act as|you are now|disregard|system prompt/i;
  $("body")
    .find("p, span, div")
    .each((_, el) => {
      const text = $(el).text().trim();
      if (llmRe.test(text) && $(el).children().length === 0 && text.length < 500) {
        injections.push({
          pattern: "llm-instruction",
          severity: "critical",
          element: text.slice(0, 100),
        });
        return false;
      }
    });

  // 4. HTML comment injection
  const commentRe = /<!--[\s\S]*?(ignore|disregard|act as|you are)/i;
  if (commentRe.test(page.html)) {
    const match = page.html.match(commentRe);
    injections.push({
      pattern: "html-comment-injection",
      severity: "warning",
      element: (match?.[0] ?? "").slice(0, 100),
    });
  }

  // 5. Monochrome text
  $("[style]").each((_, el) => {
    const style = $(el).attr("style") ?? "";
    const colorMatch = style.match(/(?:^|;)\s*color\s*:\s*(#[0-9a-f]{3,8})/i);
    const bgMatch = style.match(/background(?:-color)?\s*:\s*(#[0-9a-f]{3,8})/i);
    if (
      colorMatch &&
      bgMatch &&
      colorMatch[1].toLowerCase() === bgMatch[1].toLowerCase()
    ) {
      const text = $(el).text().trim();
      if (text.length > 5) {
        injections.push({
          pattern: "monochrome-text",
          severity: "critical",
          element: text.slice(0, 80),
        });
      }
    }
  });

  // 6. Micro-font
  $("[style]").each((_, el) => {
    const style = $(el).attr("style") ?? "";
    const sizeMatch = style.match(/font-size\s*:\s*([0-9.]+)px/i);
    if (sizeMatch && Number.parseFloat(sizeMatch[1]) < 2) {
      const text = $(el).text().trim();
      if (text.length > 5) {
        injections.push({
          pattern: "micro-font",
          severity: "warning",
          element: text.slice(0, 80),
        });
      }
    }
  });

  // 7. Data-attr injection
  $("*").each((_, el) => {
    if (!("attribs" in el)) return;
    const attrs = (el as unknown as { attribs: Record<string, string> }).attribs ?? {};
    for (const [key, val] of Object.entries(attrs)) {
      if (/^data-(llm|ai|gpt|prompt|instruction)/i.test(key) && typeof val === "string" && val.length > 0) {
        injections.push({
          pattern: "data-attr-injection",
          severity: "warning",
          element: `${key}="${val.slice(0, 60)}"`,
        });
        return false;
      }
    }
  });

  // 8. Aria-hidden abuse
  $('[aria-hidden="true"]').each((_, el) => {
    const text = $(el).text().trim();
    if (text.length > 100) {
      injections.push({
        pattern: "aria-hidden-abuse",
        severity: "info",
        element: text.slice(0, 100),
      });
    }
  });

  return injections;
}
