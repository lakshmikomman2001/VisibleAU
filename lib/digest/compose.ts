export function buildDigestHtml(
  audits: Array<{ brandName: string; scoreComposite: number | string | null }>
): string {
  const rows = audits
    .map(
      (a) =>
        `<tr><td style="padding:8px;border-bottom:1px solid #eee">${a.brandName}</td>
     <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${a.scoreComposite ?? "—"}/100</td></tr>`
    )
    .join("");
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto">
    <h2 style="color:#0066CC">VisibleAU Weekly Digest</h2>
    <p>${new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}</p>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>
        <th style="text-align:left;padding:8px;background:#f5f5f5">Brand</th>
        <th style="text-align:right;padding:8px;background:#f5f5f5">Score</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="color:#666;font-size:12px;margin-top:24px">
      Sent by <a href="https://visibleau.com">VisibleAU</a>.
      <a href="${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/settings/notifications">Manage preferences</a>
    </p>
  </body></html>`;
}
