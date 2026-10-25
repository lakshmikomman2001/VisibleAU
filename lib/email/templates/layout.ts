import { notificationSettingsUrl } from "@/lib/email/links";
import { type EmailCategory, TRANSACTIONAL_CATEGORIES } from "@/lib/email/send";

/**
 * Every email the app sends is built here, once, as both HTML and plain
 * text from the same content -- so the two can't drift apart. Plain and
 * accessible: a text wordmark (no images), real headings, descriptive
 * link text, lang and title set, layout tables marked presentational.
 * Colours are the app's light-theme tokens (app/globals.css); email
 * clients can't read CSS variables, so their values are inlined.
 *
 * Notification emails end with a link to the notification settings;
 * transactional ones (reset, verification, invite) say why they came.
 */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export type EmailBlock =
  /** The one line that matters, e.g. "Visibility 8% · mentioned in 3 of 40 answers". */
  | { kind: "headline"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "table"; columns: [string, string]; rows: Array<[string, string]> }
  | { kind: "button"; label: string; url: string }
  | { kind: "link"; label: string; url: string }
  | { kind: "note"; text: string };

export interface EmailContent {
  category: EmailCategory;
  subject: string;
  /** Shown after the subject in the inbox list. */
  preview: string;
  heading: string;
  blocks: EmailBlock[];
  /** Why this email came. Defaults: transactional, "ignore it if it wasn't
   * you"; notifications, "your organisation's notification settings". */
  reason?: string;
}

// Light-theme tokens: --bg-base, --bg-elevated, --text-primary/-secondary/
// -tertiary, --bg-active (as a solid border), --accent-primary(-fg), --accent-blue.
const COLOR = {
  page: "#fafafa",
  card: "#ffffff",
  text: "#09090b",
  secondary: "#52525b",
  tertiary: "#71717a",
  border: "#e4e4e7",
  button: "#18181b",
  buttonText: "#fafafa",
  link: "#2563eb",
} as const;
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const BRAND = "Vunnara";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function blockHtml(block: EmailBlock): string {
  const p = (size: number, color: string, extra = "") =>
    `margin:0 0 16px;font-family:${FONT};font-size:${size}px;line-height:${Math.round(size * 1.5)}px;color:${color};${extra}`;
  switch (block.kind) {
    case "headline":
      return `<p style="${p(18, COLOR.text, "font-weight:600;")}">${escapeHtml(block.text)}</p>`;
    case "paragraph":
      return `<p style="${p(14, COLOR.secondary)}">${escapeHtml(block.text)}</p>`;
    case "note":
      return `<p style="${p(12, COLOR.tertiary)}">${escapeHtml(block.text)}</p>`;
    case "link":
      return `<p style="${p(14, COLOR.secondary)}"><a href="${escapeHtml(block.url)}" style="color:${COLOR.link};text-decoration:underline;">${escapeHtml(block.label)}</a></p>`;
    case "button":
      return `<p style="margin:8px 0 24px;"><a href="${escapeHtml(block.url)}" style="display:inline-block;background:${COLOR.button};color:${COLOR.buttonText};font-family:${FONT};font-size:14px;font-weight:600;line-height:20px;text-decoration:none;padding:12px 20px;border-radius:6px;">${escapeHtml(block.label)}</a></p>`;
    case "table": {
      const cell = (align: string, weight: number) =>
        `padding:8px 0;border-bottom:1px solid ${COLOR.border};font-family:${FONT};font-size:14px;line-height:20px;color:${COLOR.text};text-align:${align};font-weight:${weight};`;
      const head = block.columns
        .map(
          (c, i) =>
            `<th scope="col" style="${cell(i === 0 ? "left" : "right", 600)}color:${COLOR.tertiary};font-size:12px;">${escapeHtml(c)}</th>`,
        )
        .join("");
      const rows = block.rows
        .map(
          ([a, b]) =>
            `<tr><td style="${cell("left", 400)}">${escapeHtml(a)}</td><td style="${cell("right", 600)}">${escapeHtml(b)}</td></tr>`,
        )
        .join("");
      return `<table role="table" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 16px;"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
    }
  }
}

function blockText(block: EmailBlock): string {
  switch (block.kind) {
    case "headline":
    case "paragraph":
    case "note":
      return block.text;
    case "link":
    case "button":
      return `${block.label}: ${block.url}`;
    case "table":
      return [
        `${block.columns[0]} — ${block.columns[1]}`,
        ...block.rows.map(([a, b]) => `- ${a}: ${b}`),
      ].join("\n");
  }
}

export function renderEmail(content: EmailContent): RenderedEmail {
  const transactional = TRANSACTIONAL_CATEGORIES.has(content.category);
  const footerText =
    content.reason ??
    (transactional
      ? "If you didn't ask for this, you can ignore this email."
      : "You're getting this because of your organisation's notification settings.");
  const settingsUrl = transactional ? null : notificationSettingsUrl();

  const footerHtml = settingsUrl
    ? `${escapeHtml(footerText)} <a href="${escapeHtml(settingsUrl)}" style="color:${COLOR.link};text-decoration:underline;">Change your notification settings</a>.`
    : escapeHtml(footerText);

  const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(content.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${COLOR.page};">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(content.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.page};">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${COLOR.card};border:1px solid ${COLOR.border};border-radius:8px;">
<tr><td style="padding:24px 32px 0;font-family:${FONT};font-size:15px;font-weight:700;color:${COLOR.text};">${BRAND}</td></tr>
<tr><td style="padding:16px 32px 16px;">
<h1 style="margin:0 0 16px;font-family:${FONT};font-size:20px;line-height:28px;font-weight:600;color:${COLOR.text};">${escapeHtml(content.heading)}</h1>
${content.blocks.map(blockHtml).join("\n")}
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:16px 32px;font-family:${FONT};font-size:12px;line-height:18px;color:${COLOR.tertiary};">${footerHtml}<br>${BRAND} · AI search visibility for Australian businesses</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    BRAND,
    "",
    content.heading,
    "",
    content.blocks.map(blockText).join("\n\n"),
    "",
    "---",
    footerText,
    ...(settingsUrl ? [`Notification settings: ${settingsUrl}`] : []),
  ].join("\n");

  return { subject: content.subject, html, text };
}
