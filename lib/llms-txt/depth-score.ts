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

  if (!content || content.trim().length === 0) {
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
  components.fullTxt = !!fullTxtContent && fullTxtContent.length > 2048;

  let score = 0;
  if (components.present) score += 3;
  if (components.h1Blockquote) score += 3;
  if (components.sections) score += 3;
  if (components.links) score += 3;
  if (components.depth) score += 3;
  if (components.fullTxt) score += 3;

  return { score, components };
}
