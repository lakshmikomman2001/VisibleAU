interface HallucinationAlertParams {
  brandName: string;
  engine: string;
  incorrectClaim: string;
  correctValue: string;
  acknowledgeUrl: string;
}

export function buildHallucinationAlertHtml({
  brandName,
  engine,
  incorrectClaim,
  correctValue,
  acknowledgeUrl,
}: HallucinationAlertParams): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:sans-serif;background:#f4f4f5;padding:24px 0;margin:0">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden">

    <!-- Header -->
    <div style="background:#0A0A0F;padding:24px 32px">
      <h1 style="font-size:20px;font-weight:700;color:#ffffff;margin:0">VisibleAU</h1>
      <p style="font-size:13px;color:#EF4444;margin:4px 0 0 0;font-weight:600">CRITICAL ALERT</p>
    </div>

    <div style="padding:32px">
      <h2 style="font-size:18px;font-weight:700;color:#111827;margin:0 0 8px 0">AI Hallucination Detected</h2>
      <p style="font-size:14px;color:#6B7280;margin:0 0 24px 0">${brandName} &middot; ${engine}</p>

      <!-- What AI said (incorrect) -->
      <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:16px;margin-bottom:16px">
        <p style="font-size:12px;font-weight:600;color:#EF4444;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.05em">What the AI claimed</p>
        <p style="font-size:14px;color:#991B1B;margin:0;line-height:1.5">${incorrectClaim}</p>
      </div>

      <!-- Correct value -->
      <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:16px;margin-bottom:24px">
        <p style="font-size:12px;font-weight:600;color:#10B981;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.05em">Verified correct information</p>
        <p style="font-size:14px;color:#166534;margin:0;line-height:1.5">${correctValue}</p>
      </div>

      <p style="font-size:14px;color:#374151;margin:0 0 24px 0;line-height:1.6">
        An AI engine is presenting incorrect information about your brand. We recommend reviewing and taking corrective action as soon as possible.
      </p>

      <!-- CTA -->
      <div style="text-align:center;margin-bottom:24px">
        <a href="${acknowledgeUrl}" style="display:inline-block;background:#EF4444;color:#fff;border-radius:6px;padding:12px 24px;font-size:14px;font-weight:600;text-decoration:none">Review &amp; Acknowledge</a>
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
