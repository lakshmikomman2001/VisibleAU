export interface LlmsTxtDepthResult {
  score: number;
  components: {
    present: boolean;
    h1Blockquote: boolean;
    sections: boolean;
    links: boolean;
    depth: boolean;
    fullTxt: boolean;
  };
}

/**
 * A soft-404 returns 200 + the site's own HTML page, not a missing-file
 * error -- content-type alone can also lie (some servers mislabel HTML as
 * text/plain), so this is checked independently of the content-type gate
 * at the fetch call site, as a second, defense-in-depth guard here.
 */
function looksLikeHtml(content: string): boolean {
  return /<!doctype\s+html|<html[\s>]/i.test(content);
}

/**
 * Whether a fetched body can be treated as a real llms.txt/llms-full.txt
 * file: requires an actual text/plain or text/markdown content-type AND a
 * body that isn't HTML-shaped. Used at the fetch call site (orchestrate.ts)
 * before the content ever reaches the scorer below.
 */
export function isPlainTextLlmsFile(contentType: string | null, body: string): boolean {
  const normalizedType = (contentType ?? "").toLowerCase();
  const isTextContentType =
    normalizedType.startsWith("text/plain") || normalizedType.startsWith("text/markdown");
  if (!isTextContentType) return false;
  return !looksLikeHtml(body);
}

export function scoreLlmsTxtDepth(
  content: string | null,
  fullTxtContent: string | null,
): LlmsTxtDepthResult {
  const components = {
    present: false,
    h1Blockquote: false,
    sections: false,
    links: false,
    depth: false,
    fullTxt: false,
  };

  if (!content || content.trim().length === 0 || looksLikeHtml(content)) {
    return { score: 0, components };
  }

  // 1. Present (3pts)
  components.present = true;

  // 2. H1 + blockquote (3pts)
  components.h1Blockquote = /^#\s+.+/m.test(content) && /^>\s+.+/m.test(content);

  // 3. ≥3 H2 sections (3pts)
  const h2Count = (content.match(/^##\s+/gm) ?? []).length;
  components.sections = h2Count >= 3;

  // 4. ≥5 internal links (3pts)
  const linkCount = (content.match(/\[.+?\]\(.+?\)/g) ?? []).length;
  components.links = linkCount >= 5;

  // 5. ≥1500 chars total (3pts)
  components.depth = content.length >= 1500;

  // 6. llms-full.txt companion (3pts)
  components.fullTxt =
    !!fullTxtContent && fullTxtContent.length > 2048 && !looksLikeHtml(fullTxtContent);

  let score = 0;
  if (components.present) score += 3;
  if (components.h1Blockquote) score += 3;
  if (components.sections) score += 3;
  if (components.links) score += 3;
  if (components.depth) score += 3;
  if (components.fullTxt) score += 3;

  return { score, components };
}
