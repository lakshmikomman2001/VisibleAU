import * as cheerio from "cheerio";
import type { CrawlPage } from "@/lib/crawler/types";

export interface PromptInjection {
  pattern: string;
  severity: "critical" | "warning" | "info";
  element: string;
  detail: string;
  pagesAffected?: string[];
}

// Task DDD: the ONLY genuinely invisible / zero-width / bidi-control
// codepoints this detector flags -- soft hyphen, zero-width space/non-
// joiner/joiner, left/right-to-left marks, bidi embedding/override
// controls, word joiner, and the BOM / zero-width no-break space. A
// previous version of this class accidentally included a literal ASCII
// space (U+0020) and the stray literal characters `{`, `2`, `}`, so it
// matched the first ordinary space on any page -- a false positive on
// essentially every site audited (confirmed against the live Bondi site,
// task CCC).
// biome-ignore lint/suspicious/noMisleadingCharacterClass: intentionally matching individual invisible codepoints
const INVISIBLE_CHARS_RE = /[­​-‏‪-‮⁠﻿]/g;

// A single invisible character (one soft hyphen in "co-operate", one ZWJ
// inside an emoji sequence, one stray BOM at a copy-paste boundary) is
// normal web content, not an attack -- only a genuine hidden-text
// signature should flag: several invisible characters back-to-back (a
// steganographic run), or enough scattered occurrences across the page
// that incidental use stops being plausible.
const INVISIBLE_MIN_RUN = 2;
const INVISIBLE_MIN_COUNT = 8;

interface InvisibleUnicodeFinding {
  count: number;
  codepoints: string[];
  context: string;
}

function detectInvisibleUnicodeRun(bodyText: string): InvisibleUnicodeFinding | null {
  const matches = [...bodyText.matchAll(INVISIBLE_CHARS_RE)];
  if (matches.length === 0) return null;

  let longestRun = 1;
  let longestRunStart = matches[0].index ?? 0;
  let runLength = 1;
  let runStart = matches[0].index ?? 0;
  for (let i = 1; i < matches.length; i++) {
    const prevIndex = matches[i - 1].index ?? 0;
    const thisIndex = matches[i].index ?? 0;
    runLength = thisIndex === prevIndex + 1 ? runLength + 1 : 1;
    if (runLength === 1) runStart = thisIndex;
    if (runLength > longestRun) {
      longestRun = runLength;
      longestRunStart = runStart;
    }
  }

  if (longestRun < INVISIBLE_MIN_RUN && matches.length < INVISIBLE_MIN_COUNT) return null;

  const anchorIndex = longestRun >= INVISIBLE_MIN_RUN ? longestRunStart : (matches[0].index ?? 0);
  const codepoints = [
    ...new Set(matches.map((m) => `U+${(m[0].codePointAt(0) ?? 0).toString(16).toUpperCase()}`)),
  ];
  const context = bodyText.slice(Math.max(0, anchorIndex - 20), anchorIndex + 20);

  return { count: matches.length, codepoints, context };
}

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

  // 2. Invisible Unicode -- only a real hidden-text signature (a run of
  // ≥2 back-to-back invisible chars, or enough scattered occurrences to
  // not be incidental), never a lone benign codepoint.
  const bodyText = $("body").text();
  const invisibleFinding = detectInvisibleUnicodeRun(bodyText);
  if (invisibleFinding) {
    const codepointList = invisibleFinding.codepoints.join(", ");
    injections.push({
      pattern: "invisible-unicode",
      severity: "critical",
      element: `${codepointList} — context: ${JSON.stringify(invisibleFinding.context)}`,
      detail: `${invisibleFinding.count} invisible Unicode character(s) (${codepointList}) in page content on ${pagePath} — often used to smuggle hidden instructions to AI crawlers.`,
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

  // 4. HTML comment injection -- extract each comment's own inner text and
  // test the instruction keywords against THAT ONLY (task DDD). The
  // previous unanchored `[\s\S]*?` had no `-->` boundary, so it matched
  // past the comment close into unrelated later page copy -- confirmed on
  // the live Bondi site, where it spanned 60,649 characters from a benign
  // tracking comment to the word "ignored" in ordinary safety copy.
  const commentContentsRe = /<!--([\s\S]*?)-->/g;
  for (const match of page.html.matchAll(commentContentsRe)) {
    const inner = match[1];
    if (LLM_INSTRUCTION_RE.test(inner)) {
      injections.push({
        pattern: "html-comment-injection",
        severity: "warning",
        element: inner.trim().slice(0, 100),
        detail: `LLM-directed instruction in an HTML comment on ${pagePath} — invisible to users, readable by AI crawlers.`,
      });
      break;
    }
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
