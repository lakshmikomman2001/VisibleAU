interface ScheduleNeedsConfirmationParams {
  brandName: string;
  confirmUrl: string;
}

export function buildScheduleNeedsConfirmationHtml({
  brandName,
  confirmUrl,
}: ScheduleNeedsConfirmationParams): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:sans-serif;background:#f4f4f5;padding:24px 0;margin:0">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden">

    <!-- Header -->
    <div style="background:#0A0A0F;padding:24px 32px">
      <h1 style="font-size:20px;font-weight:700;color:#ffffff;margin:0">VisibleAU</h1>
      <p style="font-size:13px;color:#F59E0B;margin:4px 0 0 0;font-weight:600">SCHEDULED AUDIT PAUSED</p>
    </div>

    <div style="padding:32px">
      <h2 style="font-size:18px;font-weight:700;color:#111827;margin:0 0 8px 0">Confirm your business details to resume scheduled audits</h2>
      <p style="font-size:14px;color:#6B7280;margin:0 0 24px 0">${brandName}</p>

      <div style="background:#FFFBEB;border-left:4px solid #F59E0B;border-radius:4px;padding:16px;margin-bottom:24px">
        <p style="font-size:14px;color:#92400E;margin:0;line-height:1.5">
          Scheduled audits for <strong>${brandName}</strong> are paused until you confirm its
          business type and location. This takes about 30 seconds and makes sure every audit
          asks the right questions for your actual business.
        </p>
      </div>

      <!-- CTA -->
      <div style="text-align:center;margin-bottom:24px">
        <a href="${confirmUrl}" style="display:inline-block;background:#6366F1;color:#fff;border-radius:6px;padding:12px 24px;font-size:14px;font-weight:600;text-decoration:none">Confirm business details</a>
      </div>

      <p style="font-size:13px;color:#6B7280;margin:0 0 0 0">
        Scheduled audits resume automatically once confirmed. You won't get this email again for
        this brand unless it's paused again.
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
