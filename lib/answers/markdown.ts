import { linkHref } from "@/lib/urls/strip-tracking";

/**
 * 13 Nov (Sri's walk-through, part 10): AI answers are markdown -- `**Hero** Home Services`, links like
 * `([localsearch.com.au](https://…?utm_source=openai))`, tables as `| Provider | … |` / `|------|` -- and the
 * Responses tab printed it raw. This reads the part of markdown the engines write (headings, paragraphs,
 * bullet and numbered lists, one level nested, tables, bold, italic, inline code, links, bare links, code
 * blocks, rules) into plain data; components/domain/audit/answer-markdown.tsx renders it as React elements.
 *
 * Safe by construction: nothing here is HTML. Text stays text (React escapes it, so `<script>` shows as
 * those characters and never runs); a link is kept only when it is http(s) -- `javascript:`, `data:` and
 * anything else become plain text -- and its tracking parameters (utm_source=openai and the like) are
 * removed from the link and from its text when the text is the address.
 */

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; children: Inline[] }
  | { kind: "em"; children: Inline[] }
  | { kind: "code"; text: string }
  | { kind: "link"; href: string; children: Inline[] }
  | { kind: "break" };

export type Block =
  | { kind: "heading"; level: number; children: Inline[] }
  | { kind: "paragraph"; children: Inline[] }
  | { kind: "list"; ordered: boolean; items: ListItem[] }
  | { kind: "table"; header: Inline[][]; rows: Inline[][][] }
  | { kind: "code"; text: string }
  | { kind: "rule" };

export interface ListItem {
  children: Inline[];
  sublist: { ordered: boolean; items: { children: Inline[] }[] } | null;
}

/** The link's address when it's one we'd open: http(s) only, tracking parameters removed; else null. */
export function safeHref(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return linkHref(url.toString());
}

/** A link's text, cleaned the same way when it is itself an address. */
function linkText(text: string): string {
  return /^https?:\/\//i.test(text.trim()) ? linkHref(text.trim()) : text;
}

const INLINE =
  /(`[^`\n]+`)|(\[([^\]\n]+)\]\(\s*([^)\s]+)\s*\))|(\*\*([^*\n]+?)\*\*|__([^_\n]+?)__)|(\*([^*\s][^*\n]*?)\*|(?<![A-Za-z0-9])_([^_\s][^_\n]*?)_(?![A-Za-z0-9]))|(https?:\/\/[^\s<>()[\]]+[^\s<>()[\].,;:!?'"])/;

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let rest = source;
  const pushText = (text: string) => {
    if (!text) return;
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (i > 0) out.push({ kind: "break" });
      if (line) out.push({ kind: "text", text: line });
    });
  };
  while (rest.length > 0) {
    const m = INLINE.exec(rest);
    if (!m) {
      pushText(rest);
      break;
    }
    pushText(rest.slice(0, m.index));
    const [whole] = m;
    if (m[1]) {
      out.push({ kind: "code", text: m[1].slice(1, -1) });
    } else if (m[2]) {
      const href = safeHref(m[4]);
      const children = parseInline(linkText(m[3]));
      if (href) out.push({ kind: "link", href, children });
      else out.push(...children);
    } else if (m[5]) {
      out.push({ kind: "strong", children: parseInline(m[6] ?? m[7] ?? "") });
    } else if (m[8]) {
      out.push({ kind: "em", children: parseInline(m[9] ?? m[10] ?? "") });
    } else if (m[11]) {
      const href = safeHref(m[11]);
      if (href) out.push({ kind: "link", href, children: [{ kind: "text", text: href }] });
      else pushText(m[11]);
    }
    rest = rest.slice(m.index + whole.length);
  }
  return out;
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const LIST_ITEM = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE = /^\s*```/;

function cells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  const isTableStart = (at: number) =>
    lines[at]?.includes("|") &&
    TABLE_SEPARATOR.test(lines[at + 1] ?? "") &&
    lines[at + 1].includes("-");
  const startsBlock = (line: string, at: number) =>
    HEADING.test(line) ||
    LIST_ITEM.test(line) ||
    RULE.test(line) ||
    FENCE.test(line) ||
    isTableStart(at);

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (FENCE.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) body.push(lines[i++]);
      i++;
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, children: parseInline(heading[2]) });
      i++;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ kind: "rule" });
      i++;
      continue;
    }
    if (isTableStart(i)) {
      const header = cells(line).map(parseInline);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(cells(lines[i]).map(parseInline));
        i++;
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }
    const first = LIST_ITEM.exec(line);
    if (first) {
      const baseIndent = first[1].length;
      const ordered = /\d/.test(first[2]);
      const items: ListItem[] = [];
      while (i < lines.length) {
        const item = LIST_ITEM.exec(lines[i]);
        if (item && item[1].length <= baseIndent + 1) {
          items.push({ children: parseInline(item[3]), sublist: null });
          i++;
          continue;
        }
        if (item && items.length > 0) {
          const last = items[items.length - 1];
          last.sublist ??= { ordered: /\d/.test(item[2]), items: [] };
          last.sublist.items.push({ children: parseInline(item[3]) });
          i++;
          continue;
        }
        if (lines[i].trim() !== "" && /^\s+\S/.test(lines[i]) && items.length > 0) {
          // A continuation line of the item above.
          const last = items[items.length - 1];
          const target = last.sublist ? last.sublist.items[last.sublist.items.length - 1] : last;
          target.children.push({ kind: "break" }, ...parseInline(lines[i].trim()));
          i++;
          continue;
        }
        break;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !(paragraph.length > 0 && startsBlock(lines[i], i))
    ) {
      paragraph.push(lines[i].replace(/^\s*>\s?/, ""));
      i++;
    }
    blocks.push({ kind: "paragraph", children: parseInline(paragraph.join("\n")) });
  }
  return blocks;
}
