export interface LlmsTxtValidation {
  valid: boolean;
  issues: string[];
}

export function validateLlmsTxt(content: string | null): LlmsTxtValidation {
  const issues: string[] = [];

  if (!content || content.trim().length === 0) {
    return { valid: false, issues: ["llms.txt is empty or missing"] };
  }

  if (content.length > 10240) {
    issues.push(`File exceeds 10KB (${Math.round(content.length / 1024)}KB)`);
  }

  if (!/^#\s+.+/m.test(content)) {
    issues.push("Missing H1 heading (brand name)");
  }

  if (!/^>\s+.+/m.test(content)) {
    issues.push("Missing blockquote summary after H1");
  }

  const h2Count = (content.match(/^##\s+/gm) ?? []).length;
  if (h2Count < 3) {
    issues.push(`Only ${h2Count} H2 sections found (recommend ≥3)`);
  }

  const linkCount = (content.match(/\[.+?\]\(.+?\)/g) ?? []).length;
  if (linkCount < 5) {
    issues.push(`Only ${linkCount} internal links (recommend ≥5)`);
  }

  if (content.length < 1500) {
    issues.push(`File is ${content.length} chars (recommend ≥1500)`);
  }

  return { valid: issues.length === 0, issues };
}
