interface DriftAlertParams {
  brandName: string;
  dimension: string;
  scoreBefore: number;
  scoreAfter: number;
  auditUrl: string;
}

export function buildDriftAlertHtml({
  brandName,
  dimension,
  scoreBefore,
  scoreAfter,
  auditUrl,
}: DriftAlertParams): string {
  const drop = scoreBefore - scoreAfter;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:sans-serif;background:#f4f4f5;padding:24px 0;margin:0">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden">

    <!-- Header -->
    <div style="background:#0A0A0F;padding:24px 32px">
      <h1 style="font-size:20px;font-weight:700;color:#ffffff;margin:0">VisibleAU</h1>
      <p style="font-size:13px;color:#F59E0B;margin:4px 0 0 0;font-weight:600">DRIFT ALERT</p>
    </div>

    <div style="padding:32px">
      <h2 style="font-size:18px;font-weight:700;color:#111827;margin:0 0 8px 0">AI Visibility Drift Detected</h2>
      <p style="font-size:14px;color:#6B7280;margin:0 0 24px 0">${brandName} &middot; ${dimension}</p>

      <!-- Score comparison -->
      <div style="display:flex;margin-bottom:24px">
        <div style="flex:1;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:16px;text-align:center;margin-right:8px">
          <p style="font-size:12px;color:#6B7280;margin:0 0 4px 0;text-transform:uppercase;letter-spacing:0.05em">Before</p>
          <p style="font-size:32px;font-weight:700;color:#111827;margin:0">${scoreBefore.toFixed(1)}</p>
        </div>
        <div style="flex:1;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:16px;text-align:center;margin-left:8px">
          <p style="font-size:12px;color:#6B7280;margin:0 0 4px 0;text-transform:uppercase;letter-spacing:0.05em">After</p>
          <p style="font-size:32px;font-weight:700;color:#EF4444;margin:0">${scoreAfter.toFixed(1)}</p>
        </div>
      </div>

      <div style="background:#FFFBEB;border-left:4px solid #F59E0B;border-radius:4px;padding:16px;margin-bottom:24px">
        <p style="font-size:14px;color:#92400E;margin:0;line-height:1.5">
          <strong>${dimension}</strong> dropped by <strong>${drop.toFixed(1)} points</strong>.
          This may indicate changes in how AI engines represent your brand in this area.
        </p>
      </div>

      <!-- CTA -->
      <div style="text-align:center;margin-bottom:24px">
        <a href="${auditUrl}" style="display:inline-block;background:#6366F1;color:#fff;border-radius:6px;padding:12px 24px;font-size:14px;font-weight:600;text-decoration:none">View Audit Details</a>
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
