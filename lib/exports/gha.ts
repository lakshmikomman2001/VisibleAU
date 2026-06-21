const DIMS = [
  "frequency",
  "position",
  "sentiment",
  "context",
  "accuracy",
] as const;

export interface GhaAuditInput {
  scores: Record<string, number>;
}

export function buildGha(audit: GhaAuditInput): string {
  const scores = audit.scores ?? {};
  const lines: string[] = [];

  for (const dim of DIMS) {
    const score = scores[dim] ?? 0;
    const label = `${dim.charAt(0).toUpperCase()}${dim.slice(1)} Score`;
    const msg = `${score}/100`;

    if (score < 30) {
      lines.push(`::error title=${label}::${msg}`);
    } else if (score < 50) {
      lines.push(`::warning title=${label}::${msg}`);
    } else if (score < 70) {
      lines.push(`::notice title=${label}::${msg}`);
    }
  }

  return lines.join("\n");
}
