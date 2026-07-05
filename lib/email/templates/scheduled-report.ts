interface ScheduledReportParams {
  brandName: string;
  periodLabel: string;
  compositeScore: number;
  scoreDelta: number;
  topWin: { dimension: string; delta: number };
  topGap: { dimension: string; score: number };
  pdfUrl?: string | null;
  unsubscribeUrl: string;
}

export function buildScheduledReportHtml({
  brandName,
  periodLabel,
  compositeScore,
  scoreDelta,
  topWin,
  topGap,
  pdfUrl,
  unsubscribeUrl,
}: ScheduledReportParams): string {
  const deltaSign = scoreDelta >= 0 ? "+" : "";
  const deltaColor = scoreDelta >= 0 ? "#10B981" : "#EF4444";

  const pdfSection = pdfUrl
    ? `<a href="${pdfUrl}" style="display:inline-block;background:#6366F1;color:#fff;border-radius:6px;padding:12px 24px;font-size:14px;font-weight:600;text-decoration:none">Download PDF Report</a>`
    : `<p style="font-size:14px;color:#9CA3AF;font-style:italic">Report available in dashboard</p>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:sans-serif;background:#f4f4f5;padding:24px 0;margin:0">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden">

    <!-- Header -->
    <div style="background:#0A0A0F;padding:24px 32px">
      <h1 style="font-size:20px;font-weight:700;color:#ffffff;margin:0">VisibleAU</h1>
      <p style="font-size:13px;color:#9CA3AF;margin:4px 0 0 0">${periodLabel} Report</p>
    </div>

    <div style="padding:32px">
      <h2 style="font-size:18px;font-weight:700;color:#111827;margin:0 0 4px 0">${brandName}</h2>
      <p style="font-size:13px;color:#6B7280;margin:0 0 24px 0">${periodLabel}</p>

      <!-- Score Summary Card -->
      <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:24px;text-align:center;margin-bottom:24px">
        <p style="font-size:13px;color:#6B7280;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.05em">AI Visibility Score</p>
        <p style="font-size:48px;font-weight:700;color:#0A0A0F;margin:0;line-height:1">${compositeScore.toFixed(1)}</p>
        <p style="font-size:16px;font-weight:600;color:${deltaColor};margin:8px 0 0 0">${deltaSign}${scoreDelta.toFixed(1)} pts</p>
      </div>

      <!-- Top Win -->
      <div style="background:#F0FDF4;border-left:4px solid #10B981;border-radius:4px;padding:16px;margin-bottom:16px">
        <p style="font-size:12px;font-weight:600;color:#10B981;margin:0 0 4px 0;text-transform:uppercase;letter-spacing:0.05em">Top Win</p>
        <p style="font-size:16px;font-weight:600;color:#111827;margin:0">${topWin.dimension}</p>
        <p style="font-size:14px;color:#059669;margin:4px 0 0 0">+${topWin.delta.toFixed(1)} pts improvement</p>
      </div>

      <!-- Top Gap -->
      <div style="background:#FEF2F2;border-left:4px solid #EF4444;border-radius:4px;padding:16px;margin-bottom:24px">
        <p style="font-size:12px;font-weight:600;color:#EF4444;margin:0 0 4px 0;text-transform:uppercase;letter-spacing:0.05em">Top Gap</p>
        <p style="font-size:16px;font-weight:600;color:#111827;margin:0">${topGap.dimension}</p>
        <p style="font-size:14px;color:#DC2626;margin:4px 0 0 0">Score: ${topGap.score.toFixed(1)}/100</p>
      </div>

      <!-- PDF Link / Dashboard Fallback -->
      <div style="text-align:center;margin-bottom:24px">
        ${pdfSection}
      </div>

      <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0" />

      <!-- Footer -->
      <p style="font-size:12px;color:#9CA3AF;margin:0;text-align:center">
        VisibleAU &middot; Built in Sydney
        <br />
        <a href="${unsubscribeUrl}" style="color:#6366F1;text-decoration:underline">Unsubscribe</a> from scheduled reports
      </p>
    </div>
  </div>
</body>
</html>`;
}
