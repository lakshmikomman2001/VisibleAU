import * as cheerio from "cheerio";
import type { CrawlPage } from "@/lib/crawler/types";

export interface PromptInjection {
  pattern: string;
  severity: "critical" | "warning" | "info";
  element: string;
  detail: string;
  pagesAffected?: string[];
}

// biome-ignore lint/suspicious/noMisleadingCharacterClass: intentionally matching individual invisible codepoints
const INVISIBLE_RE = /[­​‌‍‎‏ {2}‪‫‬‭‮⁠﻿]/;

const LLM_INSTRUCTION_RE =
  /ignore (previous|all|above)|act as|you are now|disregard|system prompt/i;

const BENIGN_CLASS_RE =
  /(form|field|submit|success|error|warning|alert|toast|notif|flash|message|msg|feedback|status|help|hint)/i;

const TOGGLED_UI_RE = /(modal|dropdown|accordion|collapse|offcanvas|tooltip|popover)/i;

function isBenignHiddenPattern($el: ReturnType<cheerio.CheerioAPI>): boolean {
  const role = $el.attr("role") ?? "";
  if (["alert", "status"].includes(role)) return true;
  if ($el.attr("aria-live") !== undefined) return true;

  const cls = $el.attr("class") ?? "";
  const id = $el.attr("id") ?? "";
  if (BENIGN_CLASS_RE.test(cls) || BENIGN_CLASS_RE.test(id)) return true;

  if (
    cls.includes("sr-only") ||
    cls.includes("visually-hidden") ||
    cls.includes("screen-reader-text")
  )
    return true;

  if (role === "tabpanel" || role === "dialog") return true;
  if ($el.is("[hidden]")) return true;
  if ($el.closest("details").length > 0) return true;
  if (TOGGLED_UI_RE.test(cls)) return true;

  if (/cookie/i.test(cls) || /consent/i.test(cls) || /cookie/i.test(id)) return true;

  return false;
}

export function detectPromptInjections(page: CrawlPage): PromptInjection[] {
  const $ = cheerio.load(page.html);
  const injections: PromptInjection[] = [];
  const pagePath = (() => {
    try {
      return new URL(page.url).pathname;
    } catch {
      return page.url;
    }
  })();

  // 1. Hidden text
  $("[style]").each((_, el) => {
    const style = $(el).attr("style") ?? "";
    const text = $(el).text().trim();
    if (
      text.length > 20 &&
      (/display\s*:\s*none/i.test(style) || /visibility\s*:\s*hidden/i.test(style))
    ) {
      const $el = $(el);
      if (LLM_INSTRUCTION_RE.test(text)) {
        injections.push({
          pattern: "hidden-text",
          severity: "critical",
          element: text.slice(0, 100),
          detail: `Hidden text with LLM-directed instructions on ${pagePath} — confirmed manipulation attempt.`,
        });
      } else if (!isBenignHiddenPattern($el)) {
        injections.push({
          pattern: "hidden-text",
          severity: "warning",
          element: text.slice(0, 100),
          detail: `Off-screen text hidden via CSS on ${pagePath} — may contain instructions targeting AI assistants.`,
        });
      }
    }
  });

  // 2. Invisible Unicode
  const bodyText = $("body").text();
  if (INVISIBLE_RE.test(bodyText)) {
    injections.push({
      pattern: "invisible-unicode",
      severity: "critical",
      element: "Invisible Unicode characters detected in page content",
      detail: `Zero-width characters in page content on ${pagePath} — often used to smuggle hidden instructions to AI crawlers.`,
    });
  }

  // 3. LLM-instruction injections
  $("body")
    .find("p, span, div")
    .each((_, el) => {
      const text = $(el).text().trim();
      if (LLM_INSTRUCTION_RE.test(text) && $(el).children().length === 0 && text.length < 500) {
        injections.push({
          pattern: "llm-instruction",
          severity: "critical",
          element: text.slice(0, 100),
          detail: `Text containing LLM-directed instructions on ${pagePath} — detected in visible page content.`,
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
      detail: `LLM-directed instruction in an HTML comment on ${pagePath} — invisible to users, readable by AI crawlers.`,
    });
  }

  // 5. Monochrome text
  $("[style]").each((_, el) => {
    const style = $(el).attr("style") ?? "";
    const colorMatch = style.match(/(?:^|;)\s*color\s*:\s*(#[0-9a-f]{3,8})/i);
    const bgMatch = style.match(/background(?:-color)?\s*:\s*(#[0-9a-f]{3,8})/i);
    if (colorMatch && bgMatch && colorMatch[1].toLowerCase() === bgMatch[1].toLowerCase()) {
      const text = $(el).text().trim();
      if (text.length > 5) {
        injections.push({
          pattern: "monochrome-text",
          severity: "critical",
          element: text.slice(0, 80),
          detail: `Text colour matches background on ${pagePath} — invisible to users but readable by AI crawlers.`,
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
          detail: `Text rendered at sub-2px font size on ${pagePath} — effectively invisible to users but parseable by AI crawlers.`,
        });
      }
    }
  });

  // 7. Data-attr injection
  $("*").each((_, el) => {
    if (!("attribs" in el)) return;
    const attrs = (el as unknown as { attribs: Record<string, string> }).attribs ?? {};
    for (const [key, val] of Object.entries(attrs)) {
      if (
        /^data-(llm|ai|gpt|prompt|instruction)/i.test(key) &&
        typeof val === "string" &&
        val.length > 0
      ) {
        injections.push({
          pattern: "data-attr-injection",
          severity: "warning",
          element: `${key}="${val.slice(0, 60)}"`,
          detail: `AI-targeted data attribute on ${pagePath} — may attempt to influence LLM output.`,
        });
        return false;
      }
    }
  });

  // 8. Aria-hidden abuse
  $('[aria-hidden="true"]').each((_, el) => {
    const text = $(el).text().trim();
    if (text.length > 100) {
      const $el = $(el);
      if (LLM_INSTRUCTION_RE.test(text)) {
        injections.push({
          pattern: "aria-hidden-abuse",
          severity: "critical",
          element: text.slice(0, 100),
          detail: `aria-hidden text with LLM-directed instructions on ${pagePath} — confirmed manipulation attempt.`,
        });
      } else {
        const role = $el.attr("role") ?? "";
        const cls = $el.attr("class") ?? "";
        const isToggledUI = role === "tabpanel" || role === "dialog" || TOGGLED_UI_RE.test(cls);
        if (!isToggledUI) {
          injections.push({
            pattern: "aria-hidden-abuse",
            severity: "info",
            element: text.slice(0, 100),
            detail: `Large block of aria-hidden text on ${pagePath} — hidden from screen readers but still parsed by AI crawlers.`,
          });
        }
      }
    }
  });

  return injections;
}
