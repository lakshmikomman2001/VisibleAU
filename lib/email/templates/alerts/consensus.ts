interface ConsensusAlertParams {
  brandName: string;
  sourceType: string;
  discrepancyDetails: string;
  consensusUrl: string;
}

export function buildConsensusAlertHtml({
  brandName,
  sourceType,
  discrepancyDetails,
  consensusUrl,
}: ConsensusAlertParams): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:sans-serif;background:#f4f4f5;padding:24px 0;margin:0">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden">

    <!-- Header -->
    <div style="background:#0A0A0F;padding:24px 32px">
      <h1 style="font-size:20px;font-weight:700;color:#ffffff;margin:0">VisibleAU</h1>
      <p style="font-size:13px;color:#F59E0B;margin:4px 0 0 0;font-weight:600">CONSISTENCY ALERT</p>
    </div>

    <div style="padding:32px">
      <h2 style="font-size:18px;font-weight:700;color:#111827;margin:0 0 8px 0">Brand Consistency Issue</h2>
      <p style="font-size:14px;color:#6B7280;margin:0 0 24px 0">${brandName} &middot; ${sourceType}</p>

      <!-- Discrepancy details -->
      <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:16px;margin-bottom:24px">
        <p style="font-size:12px;font-weight:600;color:#EF4444;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.05em">Discrepancy detected</p>
        <p style="font-size:14px;color:#374151;margin:0;line-height:1.6">${discrepancyDetails}</p>
      </div>

      <p style="font-size:14px;color:#374151;margin:0 0 24px 0;line-height:1.6">
        AI engines are presenting inconsistent information about your brand across different sources.
        This can erode trust and reduce your brand's AI visibility score.
      </p>

      <!-- CTA -->
      <div style="text-align:center;margin-bottom:24px">
        <a href="${consensusUrl}" style="display:inline-block;background:#6366F1;color:#fff;border-radius:6px;padding:12px 24px;font-size:14px;font-weight:600;text-decoration:none">Review Consistency Report</a>
      </div>

      <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0" />

      <p style="font-size:12px;color:#9CA3AF;margin:0;text-align:center">
        VisibleAU &middot; Built in Sydney
      </p>
    </div>
  </div>
</body>
</html>`;
}
