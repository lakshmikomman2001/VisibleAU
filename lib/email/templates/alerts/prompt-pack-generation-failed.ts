interface PromptPackGenerationFailedParams {
  brandName: string;
  brandUrl: string;
}

export function buildPromptPackGenerationFailedHtml({
  brandName,
  brandUrl,
}: PromptPackGenerationFailedParams): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family:sans-serif;background:#f4f4f5;padding:24px 0;margin:0">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden">

    <!-- Header -->
    <div style="background:#0A0A0F;padding:24px 32px">
      <h1 style="font-size:20px;font-weight:700;color:#ffffff;margin:0">VisibleAU</h1>
      <p style="font-size:13px;color:#DC2626;margin:4px 0 0 0;font-weight:600">AUDIT NOT RUN</p>
    </div>

    <div style="padding:32px">
      <h2 style="font-size:18px;font-weight:700;color:#111827;margin:0 0 8px 0">We couldn't prepare this audit's questions</h2>
      <p style="font-size:14px;color:#6B7280;margin:0 0 24px 0">${brandName}</p>

      <div style="background:#FEF2F2;border-left:4px solid #DC2626;border-radius:4px;padding:16px;margin-bottom:24px">
        <p style="font-size:14px;color:#991B1B;margin:0;line-height:1.5">
          An audit for <strong>${brandName}</strong> did not run because its question pack
          couldn't be refreshed first. No engines were called and nothing was spent. This
          usually clears up once the brand's business details are reviewed.
        </p>
      </div>

      <!-- CTA -->
      <div style="text-align:center;margin-bottom:24px">
        <a href="${brandUrl}" style="display:inline-block;background:#6366F1;color:#fff;border-radius:6px;padding:12px 24px;font-size:14px;font-weight:600;text-decoration:none">Review business details</a>
      </div>

      <p style="font-size:13px;color:#6B7280;margin:0 0 0 0">
        You'll get this email once per failed attempt, not once per retry.
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
