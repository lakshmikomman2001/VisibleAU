import { DIMENSION_LABELS } from "@/lib/scoring/dimension-labels";
import type { DimensionKey, DimensionResult } from "@/lib/scoring/dimension-result";

const DIMS: readonly DimensionKey[] = ["frequency", "position", "sentiment", "context", "accuracy"];

export interface GhaAuditInput {
  dimensions: Record<DimensionKey, DimensionResult>;
}

export function buildGha(audit: GhaAuditInput): string {
  const lines: string[] = [];

  for (const dim of DIMS) {
    const d = audit.dimensions[dim];
    const label = `${DIMENSION_LABELS[dim]} Score`;

    // Task #46 Phase 2, Part 1: an insufficient_data dimension always
    // gets `::notice::` -- never `::error::`/`::warning::` -- so a
    // zero-mention audit's missing dimensions read as informational in
    // a GitHub Actions log/annotations UI, not as a quality regression
    // that would fail the job's annotation-based gate.
    if (d.status === "insufficient_data") {
      lines.push(
        `::notice title=${label}::Insufficient data — brand was not mentioned, excluded from scoring`,
      );
      continue;
    }

    const msg = `${d.value}/100`;
    if (d.value < 30) {
      lines.push(`::error title=${label}::${msg}`);
    } else if (d.value < 50) {
      lines.push(`::warning title=${label}::${msg}`);
    } else if (d.value < 70) {
      lines.push(`::notice title=${label}::${msg}`);
    }
  }

  return lines.join("\n");
}
