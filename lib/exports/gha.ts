import {
  type CiExportInput,
  NOT_MEASURED_TEXT,
  positionLine,
  sourceCitationLine,
  visibilityCheck,
} from "./ci-checks";

export type GhaAuditInput = CiExportInput;

/**
 * GitHub Actions workflow commands. Only Visibility can be ::error (the
 * app's "low" band) or ::warning ("developing"; lib/exports/ci-checks.ts); Typical position and Source
 * citation are always ::notice -- audit #36 follow-up: they used to be
 * 0-100 scores that could raise ::error. A Visibility that couldn't be
 * measured (too few answers) is a ::notice saying why, never an error.
 */
export function buildGha(audit: GhaAuditInput): string {
  const lines: string[] = [];

  const visibility = visibilityCheck(audit);
  if (visibility.kind === "error" || visibility.kind === "warning") {
    lines.push(`::${visibility.kind} title=Visibility::${visibility.text}`);
  } else {
    lines.push(`::notice title=Visibility::${visibility.text}`);
  }

  lines.push(`::notice title=Typical position::${positionLine(audit)}`);
  lines.push(`::notice title=Source citation::${sourceCitationLine(audit)}`);
  lines.push(`::notice title=Sentiment::${NOT_MEASURED_TEXT}`);
  lines.push(`::notice title=Context::${NOT_MEASURED_TEXT}`);

  return lines.join("\n");
}
