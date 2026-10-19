/**
 * Vunnara (19 Oct): the per-brand number is the headline mention rate
 * (% of organic AI answers that mention the brand) -- never a weighted
 * multi-dimension blend, so it renders as a percentage, not "/100".
 * null = insufficient_data (zero successful organic answers): rendered
 * as "Not enough data yet", never as a fabricated 0%.
 */
export function buildDigestHtml(
  audits: Array<{ brandName: string; mentionRate: number | string | null }>,
): string {
  const rows = audits
    .map((a) => {
      const cell =
        a.mentionRate == null || Number.isNaN(Number(a.mentionRate))
          ? `<span style="color:#666;font-weight:400">Not enough data yet</span>`
          : `${Number(a.mentionRate).toFixed(1)}%`;
      return `<tr><td style="padding:8px;border-bottom:1px solid #eee">${a.brandName}</td>
     <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${cell}</td></tr>`;
    })
    .join("");
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto">
    <h2 style="color:#0066CC">VisibleAU Weekly Digest</h2>
    <p>${new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}</p>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>
        <th style="text-align:left;padding:8px;background:#f5f5f5">Brand</th>
        <th style="text-align:right;padding:8px;background:#f5f5f5">Mentioned in AI answers</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="color:#666;font-size:12px;margin-top:24px">
      Sent by <a href="https://visibleau.com">VisibleAU</a>.
      <a href="${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/settings/notifications">Manage preferences</a>
    </p>
  </body></html>`;
}
