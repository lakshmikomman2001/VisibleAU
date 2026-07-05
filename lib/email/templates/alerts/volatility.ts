interface VolatilityAlertParams {
  brandName: string;
  currentScore: number;
  trend: string;
  recommendedAction: string;
}

export function buildVolatilityAlertHtml({
  brandName,
  currentScore,
  trend,
  recommendedAction,
}: VolatilityAlertParams): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:sans-serif;background:#f4f4f5;padding:24px 0;margin:0">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden">

    <!-- Header -->
    <div style="background:#0A0A0F;padding:24px 32px">
      <h1 style="font-size:20px;font-weight:700;color:#ffffff;margin:0">VisibleAU</h1>
      <p style="font-size:13px;color:#F59E0B;margin:4px 0 0 0;font-weight:600">VOLATILITY WARNING</p>
    </div>

    <div style="padding:32px">
      <h2 style="font-size:18px;font-weight:700;color:#111827;margin:0 0 8px 0">Citation Volatility Warning</h2>
      <p style="font-size:14px;color:#6B7280;margin:0 0 24px 0">${brandName}</p>

      <!-- Score card -->
      <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:24px;text-align:center;margin-bottom:24px">
        <p style="font-size:12px;color:#92400E;margin:0 0 4px 0;text-transform:uppercase;letter-spacing:0.05em">Volatility Score</p>
        <p style="font-size:48px;font-weight:700;color:#D97706;margin:0;line-height:1">${currentScore.toFixed(1)}</p>
        <p style="font-size:14px;color:#92400E;margin:8px 0 0 0">Threshold: 15.0</p>
      </div>

      <!-- Trend -->
      <div style="background:#F9FAFB;border-left:4px solid #6366F1;border-radius:4px;padding:16px;margin-bottom:16px">
        <p style="font-size:12px;font-weight:600;color:#6366F1;margin:0 0 4px 0;text-transform:uppercase;letter-spacing:0.05em">Trend</p>
        <p style="font-size:14px;color:#374151;margin:0;line-height:1.5">${trend}</p>
      </div>

      <!-- Recommended action -->
      <div style="background:#EEF2FF;border-left:4px solid #6366F1;border-radius:4px;padding:16px;margin-bottom:24px">
        <p style="font-size:12px;font-weight:600;color:#6366F1;margin:0 0 4px 0;text-transform:uppercase;letter-spacing:0.05em">Recommended Action</p>
        <p style="font-size:14px;color:#374151;margin:0;line-height:1.5">${recommendedAction}</p>
      </div>

      <p style="font-size:14px;color:#374151;margin:0 0 24px 0;line-height:1.6">
        The sources citing your brand are changing rapidly. High volatility can indicate
        that AI engines are uncertain about your brand's authoritative sources, which may
        affect long-term visibility.
      </p>

      <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0" />

      <p style="font-size:12px;color:#9CA3AF;margin:0;text-align:center">
        VisibleAU &middot; Built in Sydney
      </p>
    </div>
  </div>
</body>
</html>`;
}
