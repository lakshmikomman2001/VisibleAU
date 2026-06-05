interface AuditCompleteEmailProps {
  brandName: string;
  auditNumber: number;
  compositeScore: number | null;
  auditResultsUrl: string;
  promptCount: number;
  engine: string;
}

export function renderAuditCompleteEmail({
  brandName,
  auditNumber,
  compositeScore,
  auditResultsUrl,
  promptCount,
  engine,
}: AuditCompleteEmailProps): string {
  const scoreText = compositeScore !== null ? `${compositeScore.toFixed(1)}/100` : "Calculating...";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:sans-serif;background:#f9fafb;padding:24px 0">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:32px">
    <h1 style="font-size:24px;font-weight:700;color:#111827">Audit complete: ${brandName}</h1>
    <p style="color:#6b7280;margin-top:4px">Audit #${auditNumber} · ${promptCount} prompts · ${engine}</p>
    <hr style="border-color:#e5e7eb;margin:24px 0" />
    <p style="font-size:14px;color:#374151">
      <strong>AI Visibility Score:</strong>
      <span style="font-size:32px;font-weight:700;color:#2563eb">${scoreText}</span>
    </p>
    <hr style="border-color:#e5e7eb;margin:24px 0" />
    <a href="${auditResultsUrl}" style="display:inline-block;background:#2563eb;color:#fff;border-radius:6px;padding:12px 24px;font-size:14px;font-weight:600;text-decoration:none">View full audit results</a>
    <p style="font-size:12px;color:#9ca3af;margin-top:32px">VisibleAU · Built in Sydney</p>
  </div>
</body>
</html>`;
}
